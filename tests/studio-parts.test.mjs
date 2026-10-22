import test from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import { materials } from '../src/data/materials.js'
import { REGION_COLORS, buildPartRegions, validOutline, partsFingerprint } from '../src/studio/part-regions.js'
import { prepareGeneration, editWithPollinations, editWithGoogle, compositeGeneration, generationDigest } from '../server/studio-generation.mjs'
import { fabricPasses, editFabricRegions } from '../server/studio-fabric-passes.mjs'
import { readProgressJson } from '../src/lib/progress-json.js'

const material=materials.find(item=>item.id==='velvet')
const outline=(x0,y0,x1,y1)=>[{x:x0,y:y0},{x:x1,y:y0},{x:x1,y:y1},{x:x0,y:y1}]
const url=buffer=>`data:image/png;base64,${buffer.toString('base64')}`
async function fixture(keepRest=false){
  const width=256,height=192,mask=new Float32Array(width*height)
  for(let y=20;y<170;y++)for(let x=20;x<235;x++)mask[y*width+x]=1
  const parts=[{id:'cushion-1',type:'Cushion',materialId:'leather',points:outline(.18,.18,.42,.48)},{id:'cushion-2',type:'Cushion',materialId:'linen',points:outline(.5,.18,.75,.48)}]
  const {labels,selection}=buildPartRegions(mask,width,height,parts,{keepRest})
  const pixels=Buffer.alloc(width*height*4,255),regions=Buffer.alloc(width*height*4,255)
  for(let p=0;p<mask.length;p++){pixels[p*4+3]=Math.round((1-selection[p])*255);for(let c=0;c<3;c++)regions[p*4+c]=REGION_COLORS[labels[p]][c]}
  const [image,selectionPng,regionPng]=await Promise.all([
    sharp({create:{width,height,channels:3,background:'#ddd'}}).png().toBuffer(),
    sharp(pixels,{raw:{width,height,channels:4}}).png().toBuffer(),
    sharp(regions,{raw:{width,height,channels:4}}).png().toBuffer(),
  ])
  const body={materialId:material.id,imageData:url(image),maskData:url(selectionPng),regionData:url(regionPng),components:parts.map(({id,type,materialId})=>({id,type,materialId})),keepRest,nativeSize:'2K'}
  return {body,parts,mask,labels,width,height}
}

test('part outlines clip to upholstery, resolve overlap and protect unassigned upholstery',()=>{
  const mask=new Float32Array(100*100);for(let y=10;y<90;y++)for(let x=10;x<90;x++)mask[y*100+x]=1
  const parts=[{id:'one',type:'Cushion',materialId:'velvet',points:outline(0,0,.55,.55)},{id:'two',type:'Seat',materialId:'leather',points:outline(.4,.4,.8,.8)}]
  const full=buildPartRegions(mask,100,100,parts)
  assert.equal(full.labels[0],0);assert.equal(full.labels[20*100+20],2);assert.equal(full.labels[45*100+45],3);assert.equal(full.labels[85*100+85],1)
  const partial=buildPartRegions(mask,100,100,parts,{keepRest:true})
  assert.equal(partial.selection[85*100+85],0);assert.equal(partial.selection[20*100+20],1)
  assert.equal(validOutline(outline(0,0,.0001,.0001)),false)
  assert.throws(()=>buildPartRegions(mask,100,100,[{...parts[0],points:outline(.91,.91,1,1)}]),/visible upholstery/)
  assert.notEqual(partsFingerprint(parts,false),partsFingerprint([{...parts[0],materialId:'linen'},parts[1]],false))
  assert.notEqual(partsFingerprint(parts,false),partsFingerprint(parts,true))
})

test('each isolated fabric request receives only its own swatch and a binary guide',async()=>{
  const {body}=await fixture(),prepared=await prepareGeneration(body,material),{passes}=await fabricPasses(prepared,material)
  assert.deepEqual(passes.map(pass=>pass.material.id),['velvet','leather','linen'])
  for(const pass of passes){
    const result=await editWithPollinations(pass.prepared,pass.material,{key:'sk_offline-not-real',fetchImpl:async(_endpoint,options)=>{
      const sent=JSON.parse(options.body)
      assert.equal(sent.model,'black-forest-labs/flux-3-image-klein');assert.equal(sent.size,'2048x1536');assert.equal(sent.image.length,3);assert.equal(sent.n,1)
      assert.match(sent.image[0].image_url,/^data:image\/jpeg/);assert.ok(sent.prompt.includes(pass.material.name))
      assert.doesNotMatch(sent.prompt,/Part 1|image 4|colour-coded/)
      const guide=await sharp(Buffer.from(sent.image[2].image_url.split(',')[1],'base64')).toColourspace('b-w').raw().toBuffer()
      assert.ok(guide.every(value=>value===0||value===255))
      return Response.json({data:[{b64_json:prepared.image.toString('base64')}]})
    }})
    assert.equal(result.width,256)
  }
  const pass=passes[1]
  await editWithGoogle(pass.prepared,pass.material,{key:'offline',fetchImpl:async(_endpoint,options)=>{
    const sent=JSON.parse(options.body);assert.equal(sent.contents[0].parts.length,4);assert.ok(sent.contents[0].parts[0].text.includes(pass.material.name))
    return Response.json({candidates:[{content:{parts:[{inlineData:{mimeType:'image/png',data:prepared.image.toString('base64')}}]}}]})
  }})
})

test('separate fabric ownership prevents even a whole-frame provider edit from overwriting another part or the room',async()=>{
  const {body,width,height,labels}=await fixture(),prepared=await prepareGeneration(body,material),calls=[]
  const colours={velvet:[0,150,0],leather:[220,0,0],linen:[0,0,220]}
  const design=await editFabricRegions(prepared,material,async(input,fabric)=>{
    calls.push(fabric.id);assert.equal(input.components.length,0)
    const image=await sharp({create:{width,height,channels:3,background:{r:colours[fabric.id][0],g:colours[fabric.id][1],b:colours[fabric.id][2]}}}).png().toBuffer()
    return {image,width,height,model:'malicious-whole-frame-fixture'}
  },{})
  const result=await design.finish(),pixels=await sharp(Buffer.from(result.imageData.split(',')[1],'base64')).removeAlpha().raw().toBuffer()
  assert.deepEqual(calls.sort(),['leather','linen','velvet']);assert.equal(result.fabricEditCount,3)
  for(const [x,y,expected] of [[70,60,colours.leather],[155,60,colours.linen],[130,140,colours.velvet],[19,60,[221,221,221]],[235,60,[221,221,221]],[0,0,[221,221,221]]]){
    assert.deepEqual([...pixels.subarray((y*width+x)*3,(y*width+x)*3+3)],expected)
  }
  for(let p=0;p<labels.length;p++)if(labels[p]===0)assert.deepEqual([...pixels.subarray(p*3,p*3+3)],[221,221,221])
})

test('matching fabrics share one call and failures do not start queued paid edits',async()=>{
  const {body}=await fixture();body.components=body.components.map(part=>({...part,materialId:'velvet'}))
  const prepared=await prepareGeneration(body,material),plan=await fabricPasses(prepared,material)
  assert.equal(plan.passes.length,1);assert.deepEqual(plan.passes[0].labels,[1,2,3])
  const original=await fixture(),multiple=await prepareGeneration(original.body,material);let calls=0
  await assert.rejects(editFabricRegions(multiple,material,async(_input,_fabric,{signal})=>{
    calls++;if(calls===1)throw Object.assign(new Error('Budget exhausted'),{status:402})
    if(signal.aborted)throw signal.reason
    await new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}))
  },{}),/No automatic retry/)
  assert.ok(calls<=2)
})

test('different native result sizes retain fabric ownership and use the smallest native scale',async()=>{
  const {body,width,height}=await fixture(),prepared=await prepareGeneration(body,material)
  const colours={velvet:'#009600',leather:'#dc0000',linen:'#0000dc'}
  const design=await editFabricRegions(prepared,material,async(_input,fabric)=>{
    const scale=fabric.id==='velvet'?2:1,w=width*scale,h=height*scale
    const image=await sharp({create:{width:w,height:h,channels:3,background:colours[fabric.id]}}).png().toBuffer()
    return {image,width:w,height:h,model:'mixed-native-fixture'}
  },{})
  const result=await design.finish(),pixels=await sharp(Buffer.from(result.imageData.split(',')[1],'base64')).removeAlpha().raw().toBuffer()
  assert.equal(result.nativeWidth,width);assert.equal(result.nativeHeight,height)
  // Inspect both sides of a cushion boundary: no red/green interpolation is allowed.
  for(const [x,y,colour] of [[45,60,[0,150,0]],[46,60,[220,0,0]],[107,60,[220,0,0]],[108,60,[0,150,0]],[0,0,[221,221,221]]])assert.deepEqual([...pixels.subarray((y*width+x)*3,(y*width+x)*3+3)],colour)
})

test('part-only generation retains every unassigned original pixel and all part choices affect idempotency',async()=>{
  const {body,width,height}=await fixture(true),prepared=await prepareGeneration(body,material)
  const changed=await sharp({create:{width,height,channels:3,background:'#00ff00'}}).png().toBuffer()
  const result=await compositeGeneration(prepared,{image:changed,width,height,model:'fixture'})
  const pixels=await sharp(Buffer.from(result.imageData.split(',')[1],'base64')).removeAlpha().raw().toBuffer()
  assert.deepEqual([...pixels.subarray((140*width+130)*3,(140*width+130)*3+3)],[221,221,221])
  assert.deepEqual([...pixels.subarray((60*width+70)*3,(60*width+70)*3+3)],[0,255,0])
  const digest=generationDigest('pollinations',body,'model')
  assert.notEqual(digest,generationDigest('pollinations',{...body,components:[{...body.components[0],materialId:'velvet'},body.components[1]]},'model'))
  assert.notEqual(digest,generationDigest('pollinations',body,'another-model'))
  assert.notEqual(digest,generationDigest('pollinations',{...body,keepRest:false},'model'))
})

test('invalid part metadata, maps and uncovered regions are rejected before the provider',async()=>{
  const {body,width,height}=await fixture()
  for(const patch of [{components:[{...body.components[0],materialId:'unknown'}]},{components:[...body.components,...body.components]},{keepRest:'yes'},{regionData:'invalid'}]){
    await assert.rejects(prepareGeneration({...body,...patch},material),error=>error.status===400)
  }
  const bad=await sharp({create:{width,height,channels:4,background:'#12a0c4'}}).png().toBuffer()
  await assert.rejects(prepareGeneration({...body,regionData:url(bad)},material),/unknown region/)
  const empty=await sharp({create:{width,height,channels:4,background:'#000'}}).png().toBuffer()
  await assert.rejects(prepareGeneration({...body,regionData:url(empty)},material),/visible selected/)
})

test('progress JSON survives split UTF-8 frames and preserves errors without inventing completed images',async()=>{
  const bytes=new TextEncoder().encode(JSON.stringify({progress:{id:'private-job',stage:'Fitting cushions…'}})+'\n'+JSON.stringify({data:{id:'private-job',status:'complete',imageData:'fixture'}})+'\n')
  const stream=new ReadableStream({start(controller){for(let i=0;i<bytes.length;i+=7)controller.enqueue(bytes.subarray(i,i+7));controller.close()}}),events=[]
  const result=await readProgressJson(new Response(stream),event=>events.push(event))
  assert.equal(events[0].stage,'Fitting cushions…');assert.equal(result.data.status,'complete')
  const failed=await readProgressJson(new Response('{"error":"Budget exhausted","status":402}\n'))
  assert.equal(failed.status,402)
  await assert.rejects(readProgressJson(new Response('{"progress":{"stage":"still running"}}\n')),/ended before/)
  await assert.rejects(readProgressJson(new Response('invalid\n')),/incomplete result/)
})
