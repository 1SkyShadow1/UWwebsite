import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import { materials } from '../src/data/materials.js'
import { classifiedCushions, furnitureSelectionTarget, buildPartRegions } from '../src/studio/part-regions.js'
import { identifyPartTypes } from '../server/studio-part-identification.mjs'
import { createStudioGenerationService, prepareGeneration } from '../server/studio-generation.mjs'
import { identifiedPartsFixture } from './helpers/identified-parts.mjs'
import { createInferenceClient } from '../src/studio/inference.js'

const named={furniture:'Couch',parts:[{id:'pillow',type:'Pillow',certainty:'clear'},{id:'seat',type:'Seat cushion',certainty:'clear'},{id:'arm',type:'Arm',certainty:'clear'}]}
const response=value=>Response.json({candidates:[{content:{parts:[{text:JSON.stringify(value)}]}}]})

test('a completed local analysis can release its model worker and start a fresh session',async()=>{
  let created=0,released=0
  const engine=createInferenceClient(()=>{
    created++
    return {postMessage({id}){queueMicrotask(()=>this.onmessage({data:{id,sections:[]}}))},terminate(){released++}}
  })
  assert.deepEqual((await engine.request({})).sections,[])
  engine.cancel();assert.equal(released,1)
  assert.deepEqual((await engine.request({})).sections,[])
  assert.equal(created,2)
  engine.dispose();assert.equal(released,2)
})

test('recognition sends only the photo and bounded section guide, validates names and rejects ambiguous panels',async()=>{
  const {body,parts}=await identifiedPartsFixture(),prepared=await prepareGeneration(body,materials.find(m=>m.id==='velvet'))
  let calls=0
  const result=await identifyPartTypes(prepared,{key:'private-fixture',fetchImpl:async(url,options)=>{
    calls++;assert.ok(!url.includes('private-fixture'));assert.equal(options.headers['x-goog-api-key'],'private-fixture')
    const sent=JSON.parse(options.body),references=sent.contents[0].parts
    assert.equal(references.length,3);assert.equal(sent.generationConfig.responseMimeType,'application/json')
    for(const reference of references.slice(1)){
      const metadata=await sharp(Buffer.from(reference.inlineData.data,'base64')).metadata()
      assert.ok(metadata.width<=1280&&metadata.height<=1280)
    }
    return response(named)
  }})
  assert.equal(calls,1)
  const cushions=classifiedCushions(parts,result)
  assert.deepEqual(cushions.map(p=>[p.id,p.type,p.materialId]),[['pillow','Pillow','leather'],['seat','Seat cushion','linen']])
  assert.equal(cushions[0].points,parts[0].points)
  const uncertain=await identifyPartTypes(prepared,{key:'offline',fetchImpl:async()=>response({...named,parts:named.parts.map(p=>({...p,certainty:'uncertain'}))})})
  assert.deepEqual(classifiedCushions(parts,uncertain),[])
  for(const bad of [{...named,parts:named.parts.slice(1)},{...named,parts:[named.parts[0],named.parts[0],named.parts[2]]},{...named,parts:named.parts.map(p=>({...p,type:'<script>'}))}]){
    await assert.rejects(identifyPartTypes(prepared,{key:'offline',fetchImpl:async()=>response(bad)}),error=>error.status===502)
  }
  let failures=0
  await assert.rejects(identifyPartTypes(prepared,{key:'private-fixture',fetchImpl:async()=>{failures++;return new Response('private-fixture',{status:429})}}),error=>error.status===429&&!error.message.includes('private-fixture'))
  assert.equal(failures,1,'quota failure must never retry')
})

test('only recognised cushions separate; arms, upholstery body and all room pixels stay protected correctly',async()=>{
  const {parts,mask,width,height}=await identifiedPartsFixture(),cushions=classifiedCushions(parts,named)
  const {labels}=buildPartRegions(mask,width,height,cushions)
  assert.equal(labels[Math.floor(.4*height)*width+Math.floor(.68*width)],1,'arm remains main upholstery')
  assert.deepEqual(furnitureSelectionTarget(cushions,mask,width,height,.2,.4),{kind:'part',id:'pillow'})
  assert.deepEqual(furnitureSelectionTarget(cushions,mask,width,height,.68,.4),{kind:'main'})
  const overRoom=[{...parts[0],points:[{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}]}]
  assert.deepEqual(furnitureSelectionTarget(overRoom,mask,width,height,.01,.01),{kind:'protected'})
  assert.throws(()=>classifiedCushions(parts,{parts:named.parts.slice(1)}),/every/)
})

test('identification jobs remain owner-private and duplicate-safe, with no image editing or paid fallback',async t=>{
  let calls=0
  const {body}=await identifiedPartsFixture(),service=createStudioGenerationService({getKey:async()=> 'offline',isConfigured:async()=>true,identify:async()=>{calls++;return named},edit:()=>{throw Error('No image edit allowed')}})
  t.after(()=>service.dispose())
  const key=randomUUID(),job=await service.identify('owner',body,key,materials)
  for(let i=0;i<100&&service.get('owner',job.id).status!=='complete';i++)await new Promise(resolve=>setTimeout(resolve,5))
  assert.equal(service.get('owner',job.id).operation,'identify-parts')
  assert.throws(()=>service.get('other-owner',job.id),error=>error.status===404)
  assert.equal((await service.identify('owner',body,key,materials)).id,job.id)
  await assert.rejects(service.identify('owner',{...body,materialId:'linen'},key,materials),error=>error.status===409)
  assert.equal(calls,1)
})
