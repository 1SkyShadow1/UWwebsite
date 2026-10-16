import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { randomUUID, createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import * as THREE from 'three'
import sharp from 'sharp'
import { materials } from '../src/data/materials.js'
import { materialResponse, photoMaterialResponse, studioForms, exportSize, encodedPngSize } from '../src/studio/material-response.js'
import { buildUpholsteryForm, disposeForm } from '../src/studio/upholstery-forms.js'
import { analyseSurface, trackSurface, translateMask, protectThinSupports, polishSelectionMask } from '../src/studio/surface-analysis.js'
import { renderSurfaceCPU } from '../src/studio/cpu-renderer.js'
import { createInferenceClient } from '../src/studio/inference.js'
import { acquireCamera } from '../src/studio/camera.js'
import { chooseConsistentMasks, resampleSelection } from '../src/studio/selection.js'
import { openDatabase } from '../server/database.mjs'
import { createApiHandler } from '../server/index.mjs'

test('fabric families distinguish glossy coatings, brushed suede and directional pile, including archive names',()=>{
  const family=name=>materialResponse({name,texture:'woven'})
  assert.equal(family('Brown Leather').family,'leather')
  assert.equal(family('Faux leather').family,'coated')
  assert.equal(family('Scuba Suede').family,'suede')
  assert.equal(family('Velour Velvet').family,'velvet')
  assert.ok(family('Velour Velvet').sheen>family('Rough Linen').sheen)
  assert.ok(family('Upholstery vinyl').roughness<family('Curly Teddy Natural').roughness)
  for(const material of materials){const profile=materialResponse(material);assert.equal(profile.metalness,0);assert.ok(profile.roughness>0&&profile.roughness<=1);assert.ok(profile.tileMetres>0)}
})

test('all ten upholstery forms contain finite, distinct 3D geometry with fabric surfaces',()=>{
  const cloth=new THREE.MeshPhysicalMaterial(),piping=cloth.clone(),timber=new THREE.MeshStandardMaterial(),metal=timber.clone(),signatures=new Set()
  try{
    for(const form of studioForms){
      const group=buildUpholsteryForm(form.id,{cloth,piping,timber,metal}),bounds=new THREE.Box3().setFromObject(group),size=bounds.getSize(new THREE.Vector3())
      let vertices=0,fabric=0
      group.traverse(mesh=>{if(!mesh.isMesh)return;vertices+=mesh.geometry.attributes.position.count;fabric+=Number(mesh.userData.upholstery);assert.ok(mesh.geometry.attributes.uv);for(const value of mesh.geometry.attributes.position.array)assert.ok(Number.isFinite(value),form.id)})
      assert.ok(fabric>0&&vertices>1000,form.id);assert.ok(size.x>0&&size.y>0&&size.z>0)
      signatures.add(`${vertices}/${size.x.toFixed(3)}/${size.y.toFixed(3)}/${size.z.toFixed(3)}`)
      if(form.id==='wingback')assert.ok(size.y>size.x)
      if(form.id==='corner-sofa')assert.ok(size.z>1.8)
      disposeForm(group)
    }
    assert.equal(signatures.size,10)
    assert.throws(()=>buildUpholsteryForm('unknown',{cloth,piping,timber,metal}))
  }finally{for(const material of [cloth,piping,timber,metal])material.dispose()}
})

function photo(width=64,height=48){
  const data=new Uint8ClampedArray(width*height*4)
  for(let p=0;p<width*height;p++){const value=80+(p%width);data.set([value,value,value,255],p*4)}
  return {width,height,data}
}

test('depth analysis keeps the room out of the selection and supplies a bounded surface field',()=>{
  const source=photo(),mask=new Float32Array(source.width*source.height)
  for(let y=10;y<38;y++)for(let x=10;x<54;x++)mask[y*source.width+x]=1
  const depth={width:8,height:6,values:Float32Array.from({length:48},(_,p)=>p%8)}
  const analysis=analyseSurface(source,mask,depth)
  assert.equal(analysis.selected,44*28);assert.equal(analysis.depth,true);assert.equal(analysis.data[3],0)
  assert.ok(analysis.bounds.every(Number.isFinite));assert.equal(analysis.data.length,source.data.length)
  assert.equal(analyseSurface(source,new Float32Array(mask.length),depth).selected,0)
  assert.throws(()=>analyseSurface(source,new Float32Array(1),depth))
})

test('material relighting differs by fabric while preserving unselected room pixels and the original endpoint',()=>{
  const source=photo(),mask=new Float32Array(source.width*source.height).fill(1);mask[0]=0
  const depth={width:source.width,height:source.height,values:Float32Array.from(mask,(_,p)=>Math.sin(p%source.width/source.width*Math.PI))}
  const analysis=analyseSurface(source,mask,depth),texture={width:4,height:4,data:new Uint8ClampedArray(64)}
  for(let p=0;p<16;p++)texture.data.set([110,65,42,255],p*4)
  const velvet=renderSurfaceCPU(source,analysis,texture,{name:'Velvet'},{compare:0}),leather=renderSurfaceCPU(source,analysis,texture,{name:'Leather'},{compare:0})
  assert.deepEqual(velvet.slice(0,4),source.data.slice(0,4));assert.notDeepEqual(velvet,leather)
  assert.deepEqual(renderSurfaceCPU(source,analysis,texture,{name:'Velvet'},{compare:1}),source.data)
})

test('camera block tracking follows translated surface detail and mask shifting never wraps at an edge',()=>{
  const width=80,height=60,previous=photo(width,height),current=photo(width,height)
  for(let p=0;p<width*height;p++){const value=((p*37)^(p>>>2)*73)%220;previous.data.set([value,value,value,255],p*4)}
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){const px=x-2,py=y+1;if(px>=0&&px<width&&py>=0&&py<height)current.data.set(previous.data.subarray((py*width+px)*4,(py*width+px)*4+4),(y*width+x)*4)}
  const tracked=trackSurface(previous,current,{x:.5,y:.5});assert.equal(tracked.dx,2);assert.equal(tracked.dy,-1);assert.ok(tracked.confidence>.5)
  const mask=new Float32Array(9);mask[2]=1;assert.equal(translateMask(mask,3,3,1,0).reduce((a,b)=>a+b,0),0)
})

test('4K/8K exports preserve aspect ratio and report device-limited output explicitly',()=>{
  assert.deepEqual([exportSize(16,9,'4k').width,exportSize(16,9,'4k').height],[3840,2160])
  assert.deepEqual([exportSize(16,9,'8k').width,exportSize(16,9,'8k').height],[7680,4320])
  const portrait=exportSize(3,4,'8k');assert.equal(portrait.height,7680);assert.equal(portrait.width,5760)
  const limited=exportSize(16,9,'8k',4096);assert.equal(limited.limited,true);assert.equal(limited.width,4096)
  assert.throws(()=>exportSize(0,10))
})

test('automatic mask refinement protects thin bare supports without trimming the upholstered body',()=>{
  const mask=new Float32Array(50*50)
  for(let y=5;y<25;y++)for(let x=5;x<45;x++)mask[y*50+x]=1
  for(let y=25;y<48;y++)for(const x of [10,11,39,40])mask[y*50+x]=1
  const result=protectThinSupports(mask,50,50)
  assert.equal(result[20*50+20],1);assert.equal(result[40*50+10],0);assert.equal(mask[40*50+10],1)
})

test('leg protection retains a perspective-sloped upholstered base down to its last narrow rows',()=>{
  const width=120,height=80,mask=new Float32Array(width*height)
  for(let y=5;y<75;y++)for(let x=5;x<115;x++)if(y<50+(115-x)*.23)mask[y*width+x]=1
  assert.deepEqual(protectThinSupports(mask,width,height),mask)
})

test('photo cloth relief remains subordinate to shape and velvet is quieter than bouclé',()=>{
  const velvet=photoMaterialResponse({name:'Velvet'}),boucle=photoMaterialResponse({name:'Bouclé'})
  assert.ok(velvet.photoRelief<.04);assert.ok(boucle.photoRelief>velvet.photoRelief*3)
  assert.ok(velvet.albedoContrast<.15);assert.ok(velvet.specularStrength<photoMaterialResponse({name:'Leather'}).specularStrength)
})

test('relighting preserves broad form shadows, suppresses fine weave and isolates contact occlusion',()=>{
  const width=180,height=100,data=new Uint8ClampedArray(width*height*4),mask=new Float32Array(width*height).fill(1)
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const shade=105+70*x/width,value=(y===50||y===51?35:shade)+(x%2?10:-10)
    data.set([value,value,value,255],(y*width+x)*4)
  }
  const result=analyseSurface({width,height,data},mask)
  assert.ok(result.data[(20*width+150)*4+1]>result.data[(20*width+30)*4+1]*1.6,'retain the photographed light gradient')
  assert.ok(Math.abs(result.data[(20*width+90)*4+1]-result.data[(20*width+91)*4+1])<4,'remove high frequency source grain')
  assert.ok(result.geometry[(50*width+90)*4+2]<result.geometry[(40*width+90)*4+2]*.8,'keep the contact seam as an independent shadow layer')
})

test('depth resampling produces smooth finite normals rather than staircase highlights',()=>{
  const source=photo(120,80),mask=new Float32Array(120*80).fill(1)
  const depth={width:6,height:4,values:Float32Array.from({length:24},(_,p)=>p%6)}
  const result=analyseSurface(source,mask,depth)
  let changes=0
  for(let x=10;x<110;x++)changes+=Math.abs(result.geometry[(40*120+x)*4]-result.geometry[(40*120+x-1)*4])>8?1:0
  assert.equal(changes,0);assert.ok(result.geometry.every(Number.isFinite))
  const invalid=analyseSurface(source,mask,{width:2,height:2,values:new Float32Array([NaN,NaN,NaN,NaN])})
  assert.equal(invalid.depth,false)
})

test('mask polishing closes fine interior cracks and preserves larger room openings',()=>{
  const width=30,height=30,mask=new Float32Array(width*height)
  for(let y=3;y<27;y++)for(let x=3;x<27;x++)mask[y*width+x]=1
  for(let y=8;y<20;y++)mask[y*width+10]=0
  for(let y=12;y<18;y++)for(let x=17;x<23;x++)mask[y*width+x]=0
  const polished=polishSelectionMask(mask,width,height)
  assert.equal(polished[14*width+10],1);assert.equal(polished[15*width+20],0);assert.equal(polished[0],0)
})

test('automatic selection unifies agreeing furniture masks while rejecting a surrounding-room mask',()=>{
  const width=40,height=40,a=new Float32Array(1600),b=new Float32Array(1600),room=new Float32Array(1600).fill(1)
  for(let y=10;y<30;y++)for(let x=8;x<32;x++){a[y*width+x]=1;b[y*width+x]=1}
  for(let x=8;x<32;x++)b[30*width+x]=1
  const result=chooseConsistentMasks([{width,height,values:a},{width,height,values:b},{width,height,values:room}])
  assert.equal(result.values[30*width+20],1);assert.equal(result.values[0],0);assert.equal(a[30*width+20],0)
})

test('enlarged AI selections retain fractional silhouette coverage without block steps',()=>{
  const resized=resampleSelection({width:2,height:2,values:new Float32Array([0,1,0,1])},20,10)
  const row=resized.subarray(5*20,6*20)
  assert.equal(row[0],0);assert.equal(row[19],1)
  assert.ok([...row].filter(value=>value>0&&value<1).length>=4)
  assert.throws(()=>resampleSelection({width:2,height:2,values:new Float32Array(1)},20,10))
})

test('surface lighting retains a dark structural crease while suppressing fine source print',()=>{
  const width=128,height=64,data=new Uint8ClampedArray(width*height*4),mask=new Float32Array(width*height).fill(1)
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){const value=(y===32||y===33?35:140)+(x%2?12:-12);data.set([value,value,value,255],(y*width+x)*4)}
  const result=analyseSurface({width,height,data},mask)
  const shadow=p=>result.data[p*4+1]*result.geometry[p*4+2]/255
  assert.ok(shadow(32*width+64)<shadow(24*width+64)*.8)
  assert.ok(Math.abs(result.data[(24*width+64)*4+1]-result.data[(24*width+65)*4+1])<10)
})

test('an AI worker timeout rejects outstanding work, terminates the worker and allows a retry',async()=>{
  let calls=0,terminated=0
  const client=createInferenceClient(()=>({postMessage(){calls++},terminate(){terminated++}}),{timeout:15})
  await assert.rejects(client.request({}),/too long/);assert.equal(terminated,1)
  const retry=client.request({});client.dispose();await assert.rejects(retry,/closed/);assert.equal(calls,2)
})

test('export dimensions are read from the encoded PNG rather than inferred from a requested label',async()=>{
  const image=await sharp({create:{width:37,height:23,channels:4,background:'#31564a'}}).png().toBuffer()
  assert.deepEqual(await encodedPngSize(new Blob([image])),{width:37,height:23})
  await assert.rejects(encodedPngSize(new Blob(['invalid image'])),/encoded/)
})

test('a camera request times out cleanly and stops any stream granted after cancellation',async()=>{
  let resolveCamera,stops=0
  const request=acquireCamera({getUserMedia:()=>new Promise(resolve=>resolveCamera=resolve)},{timeout:5})
  await assert.rejects(request,/permission was not completed/)
  resolveCamera({getTracks:()=>[{stop:()=>stops++}]});await new Promise(resolve=>setImmediate(resolve));assert.equal(stops,1)
  const stale=acquireCamera({getUserMedia:async()=>({getTracks:()=>[{stop:()=>stops++}]})},{isCurrent:()=>false})
  await assert.rejects(stale,/cancelled/);assert.equal(stops,2)
})

test('local depth weights have recorded integrity and matched HD maps retain source dimensions',async()=>{
  const root='public/models/depth-anything-v2-small',provenance=JSON.parse(readFileSync(`${root}/provenance.json`)),weights=readFileSync(`${root}/onnx/model_quantized.onnx`)
  assert.equal(createHash('sha256').update(weights).digest('hex'),provenance.sha256);assert.match(readFileSync(`${root}/LICENSE.txt`,'utf8'),/Apache License/)
  const manifest=JSON.parse(readFileSync('src/data/studio-hd-textures.json'))
  for(const entry of Object.values(manifest)){
    const maps=await Promise.all(['color','normal','roughness'].map(channel=>sharp(`public${entry[channel]}`).metadata()))
    assert.equal(entry.license,'CC0');assert.ok(maps[0].width>1024||maps[0].height>1024)
    for(const map of maps){assert.ok(map.width<=2048&&map.height<=2048);assert.equal(map.width,maps[0].width);assert.equal(map.height,maps[0].height)}
  }
})

test('Studio setup API validates its recipe, remains private and retries without duplicate designs',async t=>{
  const database=openDatabase(':memory:'),server=http.createServer(createApiHandler({database}));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));database.close()})
  const base=`http://127.0.0.1:${server.address().port}`,owner=randomUUID()+randomUUID(),key=randomUUID()
  const call=async(path,{body,token=owner}={})=>{const response=await fetch(base+path,{method:body?'POST':'GET',headers:{...(token?{Authorization:`Bearer ${token}`} : {}),...(body?{'Content-Type':'application/json','Idempotency-Key':key}:{})},body:body?JSON.stringify(body):undefined});return {status:response.status,...await response.json()}}
  const capabilities=await call('/api/studio/capabilities',{token:null});assert.equal(capabilities.data.forms.length,10);assert.equal(capabilities.data.localPreviewPhotosLeaveDevice,false);assert.equal(capabilities.data.generation.photosSentOnRequest,true)
  assert.equal((await call('/api/studio/designs',{token:null})).status,401)
  const body={materialId:'velvet',formId:'wingback',lighting:'daylight',mode:'3d',quality:'8k',name:'Studio API verification',imageData:'do not store images'}
  const first=await call('/api/studio/designs',{body});assert.equal(first.status,201);assert.equal(first.data.imageData,undefined)
  const retry=await call('/api/studio/designs',{body});assert.equal(first.data.id,retry.data.id);assert.equal(database.listAll('studio-design').length,1)
  assert.deepEqual((await call('/api/studio/designs',{token:randomUUID()})).data,[])
  for(const change of [{materialId:'missing'},{formId:'missing'},{lighting:'missing'},{quality:'32k'},{mode:'unknown'}])assert.equal((await call('/api/studio/designs',{body:{...body,...change}})).status,400)
})
