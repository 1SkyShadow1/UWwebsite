import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import { materials } from '../src/data/materials.js'
import { createStudioGenerationService } from '../server/studio-generation.mjs'
import { createPersistentGeneration } from '../server/persistent-generation.mjs'
import { POLLINATIONS_QUICK_MODEL, POLLINATIONS_DETAIL_MODEL } from '../server/studio-models.mjs'

async function photograph(){
  const width=256,height=192,image=await sharp({create:{width,height,channels:3,background:'#ddd'}}).png().toBuffer(),pixels=Buffer.alloc(width*height*4,255)
  for(let y=30;y<160;y++)for(let x=30;x<225;x++)pixels[(y*width+x)*4+3]=0
  const mask=await sharp(pixels,{raw:{width,height,channels:4}}).png().toBuffer(),url=bytes=>`data:image/png;base64,${bytes.toString('base64')}`
  return {materialId:'velvet',imageData:url(image),maskData:url(mask)}
}
async function settled(service,owner,id){
  for(let i=0;i<300;i++){
    const job=service.get(owner,id)
    if(['complete','failed','cancelled'].includes(job.status))return job
    await new Promise(resolve=>setTimeout(resolve,10))
  }
  throw Error('Mode fixture did not complete')
}
const options={getProvider:async()=>'pollinations',isConfigured:async()=>true,getKey:async({provider})=>`offline-${provider}`,env:{POLLINATIONS_IMAGE_MODEL:POLLINATIONS_DETAIL_MODEL}}

test('Quick stays on the small Pollinations route; Realism uses its own Google key and native detail',async t=>{
  const calls=[],service=createStudioGenerationService({...options,edit:async(prepared,_material,{key,model})=>{
    calls.push({key,model,size:prepared.nativeSize,parts:prepared.components.length})
    return {image:prepared.image,width:256,height:192,model}
  }});t.after(()=>service.dispose())
  const body=await photograph()
  for(const generationMode of ['quick','realism']){
    const job=await service.start('owner',{...body,generationMode},randomUUID(),materials)
    assert.equal((await settled(service,'owner',job.id)).status,'complete')
  }
  assert.deepEqual(calls,[{key:'offline-pollinations',model:POLLINATIONS_QUICK_MODEL,size:'1K',parts:0},{key:'offline-google',model:'gemini-3.1-flash-image',size:'2K',parts:0}])
})

test('mode availability is independent and invalid Quick sizes never reserve a paid job',async t=>{
  const local=createStudioGenerationService({...options,isConfigured:async({provider})=>provider==='pollinations',edit:()=>{throw Error('Must not contact a provider')}})
  t.after(()=>local.dispose())
  const capabilities=await local.capabilities()
  assert.equal(capabilities.defaultGenerationMode,'quick')
  assert.equal(capabilities.modes.find(mode=>mode.id==='quick').configured,true)
  assert.equal(capabilities.modes.find(mode=>mode.id==='realism').configured,false)
  assert.deepEqual(capabilities.modes.find(mode=>mode.id==='quick').supportedNativeSizes,['1K'])
  const hosted=createPersistentGeneration({local,configured:async()=>true,store:{claim(){throw Error('No durable claim should be made')}}})
  const body=await photograph()
  for(const patch of [{generationMode:'quick',nativeSize:'4K'},{generationMode:'unknown'},{generationMode:'realism'}])await assert.rejects(hosted.start('owner',{...body,...patch},randomUUID(),materials),error=>[400,503].includes(error.status))
  await assert.rejects(local.plan({generationMode:'realism'}),/GEMINI_API_KEY/)
  assert.equal((await local.plan({generationMode:'quick'})).provider,'pollinations')
})

test('mode changes cannot reuse another design request and failure never spends on the other provider',async t=>{
  let calls=0
  const service=createStudioGenerationService({...options,edit:async(prepared,_material,{key})=>{
    calls++
    if(key==='offline-google')throw Object.assign(new Error('Google quota reached'),{status:429})
    return {image:prepared.image,width:256,height:192,model:'offline'}
  }});t.after(()=>service.dispose())
  const body=await photograph(),key=randomUUID(),quick={...body,generationMode:'quick',nativeSize:'1K'}
  const first=await service.start('owner',quick,key,materials)
  await settled(service,'owner',first.id)
  assert.equal((await service.start('owner',quick,key,materials)).id,first.id)
  await assert.rejects(service.start('owner',{...quick,generationMode:'realism'},key,materials),error=>error.status===409)
  const realism=await service.start('owner',{...body,generationMode:'realism'},randomUUID(),materials)
  assert.equal((await settled(service,'owner',realism.id)).status,'failed')
  assert.equal(calls,2)
})
