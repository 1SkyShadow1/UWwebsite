import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import { materials } from '../src/data/materials.js'
import { getAiProvider, getAiCredential } from '../server/ai-credentials.mjs'
import { editWithPollinations, prepareGeneration, createStudioGenerationService } from '../server/studio-generation.mjs'

const material=materials.find(item=>item.id==='velvet'),key='sk_test-fixture-do-not-send'
const dataUrl=bytes=>`data:image/png;base64,${bytes.toString('base64')}`
async function fixture(){
  const image=await sharp({create:{width:256,height:192,channels:4,background:'#ccc'}}).png().toBuffer()
  const pixels=Buffer.alloc(256*192*4,255)
  for(let y=40;y<150;y++)for(let x=30;x<230;x++)pixels[(y*256+x)*4+3]=0
  const mask=await sharp(pixels,{raw:{width:256,height:192,channels:4}}).png().toBuffer()
  const body={materialId:material.id,imageData:dataUrl(image),maskData:dataUrl(mask),nativeSize:'1K'}
  return {image,body,prepared:await prepareGeneration(body,material)}
}

test('Pollinations receives three inline references, one low-cost image request and a separate selection guide',async()=>{
  const {prepared}=await fixture()
  const jpeg=await sharp(prepared.image).jpeg().toBuffer()
  const result=await editWithPollinations(prepared,material,{key,fetchImpl:async(endpoint,options)=>{
    assert.equal(endpoint,'https://gen.pollinations.ai/v1/images/edits')
    assert.equal(options.headers.Authorization,`Bearer ${key}`)
    const body=JSON.parse(options.body)
    assert.equal(body.model,'black-forest-labs/flux.2-klein-4b')
    assert.equal(body.n,1);assert.equal(body.size,'1024x768');assert.equal(body.resolution,undefined)
    assert.equal(body.response_format,'b64_json');assert.equal(body.image.length,3)
    assert.match(body.prompt,/Replace the original fabric completely/)
    assert.match(body.prompt,/white area of image 3/)
    assert.ok(!JSON.stringify(body).includes(key))
    const guide=await sharp(Buffer.from(body.image[2].image_url.split(',')[1],'base64')).toColourspace('b-w').raw().toBuffer()
    assert.equal(guide[0],0);assert.equal(guide[90*256+90],255)
    return Response.json({data:[{b64_json:jpeg.toString('base64')}]})
  }})
  assert.equal((await sharp(result.image).metadata()).format,'png')
  assert.equal(result.width,256);assert.equal(result.height,192)
})

test('Pollinations rejects unsupported native sizes and models before contacting the provider',async()=>{
  const {prepared}=await fixture();let calls=0
  const options={key,model:'black-forest-labs/flux.2-klein-4b',fetchImpl:async()=>{calls++;throw Error('should not run')}}
  await assert.rejects(editWithPollinations({...prepared,nativeSize:'4K'},material,options),error=>error.status===400)
  await assert.rejects(editWithPollinations(prepared,material,{...options,model:'__proto__'}),error=>error.status===503)
  assert.equal(calls,0)
  const result=await editWithPollinations({...prepared,nativeSize:'4K'},material,{key,model:'black-forest-labs/flux-3-image-klein',fetchImpl:async(_endpoint,options)=>{
    const body=JSON.parse(options.body);assert.equal(body.size,'4096x3072');assert.equal(body.resolution,undefined)
    return Response.json({data:[{b64_json:prepared.image.toString('base64')}]})
  }})
  assert.equal(result.model,'black-forest-labs/flux-3-image-klein')
})

test('Pollinations failures, remote-only images and changed framing never leak provider diagnostics or credentials',async()=>{
  const {prepared}=await fixture()
  for(const [status,message]of [[401,/secret key/],[402,/Pollen budget/],[403,/permissions/],[404,/unavailable/],[429,/limiting/],[500,/could not finish/]]){
    await assert.rejects(editWithPollinations(prepared,material,{key,fetchImpl:async()=>new Response(key,{status})}),error=>message.test(error.message)&&!error.message.includes(key))
  }
  for(const payload of [{data:[{url:'http://127.0.0.1/private'}]},{data:[{b64_json:'invalid-base64'}]}]){
    await assert.rejects(editWithPollinations(prepared,material,{key,fetchImpl:async()=>Response.json(payload)}),error=>error.status===502)
  }
  const square=await sharp({create:{width:256,height:256,channels:4,background:'#ccc'}}).png().toBuffer()
  await assert.rejects(editWithPollinations(prepared,material,{key,fetchImpl:async()=>Response.json({data:[{b64_json:square.toString('base64')}]})}),/changed.*framing/)
  const abort=new AbortController();abort.abort()
  await assert.rejects(editWithPollinations(prepared,material,{key,signal:abort.signal,fetchImpl:async()=>{throw abort.signal.reason}}),error=>error.name==='AbortError')
})

test('Pollinations credentials and job metadata stay server-side and unsupported sizes never start a job',async t=>{
  const env={POLLINATIONS_API_KEY:key},provider=await getAiProvider({path:null,env})
  assert.equal(provider,'pollinations');assert.equal(await getAiCredential({path:null,env}),key)
  assert.equal(await getAiProvider({path:null,env:{...env,AI_IMAGE_PROVIDER:'google'}}),'google')
  const {body,image}=await fixture();let calls=0;const models=[]
  const service=createStudioGenerationService({getProvider:async()=>provider,isConfigured:async()=>true,getKey:async()=>key,env,edit:async(prepared,_material,{model})=>{calls++;models.push(model);return {image,width:prepared.photoInfo.width,height:prepared.photoInfo.height,model}}})
  t.after(()=>service.dispose())
  const capabilities=await service.capabilities()
  assert.equal(capabilities.provider,'Pollinations');assert.deepEqual(capabilities.supportedNativeSizes,['1K','2K','4K'])
  assert.ok(!JSON.stringify(capabilities).includes(key))
  await assert.rejects(service.start('owner',{...body,nativeSize:'8K'},randomUUID(),materials),error=>error.status===400)
  const requestKey=randomUUID(),job=await service.start('owner',body,requestKey,materials)
  assert.equal((await service.start('owner',body,requestKey,materials)).id,job.id)
  for(let i=0;i<300&&!['complete','failed'].includes(service.get('owner',job.id).status);i++)await new Promise(resolve=>setTimeout(resolve,5))
  assert.equal(service.get('owner',job.id).status,'complete');assert.equal(calls,1)
  assert.throws(()=>service.get('other-owner',job.id),/unavailable/)
  for(const nativeSize of ['2K','4K']){
    const next=await service.start('owner',{...body,nativeSize},randomUUID(),materials)
    for(let i=0;i<300&&!['complete','failed'].includes(service.get('owner',next.id).status);i++)await new Promise(resolve=>setTimeout(resolve,5))
    assert.equal(service.get('owner',next.id).status,'complete')
  }
  assert.deepEqual(models,['black-forest-labs/flux.2-klein-4b','black-forest-labs/flux-3-image-klein','black-forest-labs/flux-3-image-klein'])
})
