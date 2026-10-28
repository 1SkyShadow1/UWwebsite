import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { randomUUID, randomBytes } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import sharp from 'sharp'
import { createVercelHandler } from '../server/vercel.mjs'
import { createPostgresStore } from '../server/postgres-store.mjs'
import { hostedPostgresOptions } from '../server/postgres-connection.mjs'
import { Client } from 'pg'
import { prepareGeneration } from '../server/studio-generation.mjs'
import { readProgressJson } from '../src/lib/progress-json.js'
import { identifiedPartsFixture } from './helpers/identified-parts.mjs'

test('Supabase pooler URLs retain CA and hostname verification when pg parses integration SSL parameters',()=>{
  for(const host of ['aws-0-eu-west-1.pooler.supabase.com','db.exampleproject.supabase.co']){
    const options=hostedPostgresOptions({POSTGRES_URL:`postgres://postgres:test-only@${host}:6543/postgres?sslmode=no-verify&sslrootcert=ignored&uselibpqcompat=true`})
    const client=new Client(options)
    assert.equal(client.connectionParameters.ssl.rejectUnauthorized,true)
    assert.match(client.connectionParameters.ssl.ca,/-----BEGIN CERTIFICATE-----/)
    assert.equal(client.connectionParameters.ssl.checkServerIdentity,undefined)
    assert.equal(client.connectionParameters.host,host)
    assert.equal(client.connectionParameters.password,'test-only')
  }
  const neon='postgres://postgres:test-only@pooler.example.neon.tech/postgres?sslmode=verify-full'
  assert.equal(hostedPostgresOptions({DATABASE_URL:neon}).connectionString,neon)
  assert.equal(hostedPostgresOptions({}),null)
  assert.throws(()=>hostedPostgresOptions({DATABASE_URL:'invalid-secret-value'}),error=>!error.message.includes('invalid-secret-value'))
})

test('hosted cushion identification is private, durable and never duplicates or starts an image edit',async t=>{
  const {server,call}=await fixture(t),{body}=await identifiedPartsFixture()
  let recognitions=0
  const options={env:{GEMINI_API_KEY:'offline-google',POLLINATIONS_API_KEY:'offline-pollinations'},pollMs:2,
    identify:async(prepared,{key})=>{recognitions++;assert.equal(key,'offline-google');return {furniture:'Couch',parts:prepared.components.map((part,i)=>({id:part.id,type:['Pillow','Seat cushion','Arm'][i]}))}},
    edit:()=>{throw Error('Identification must not generate an image')}}
  const first=await server(options),second=await server(options),headers={'Idempotency-Key':randomUUID()}
  const capability=await call(first,'/api/studio/capabilities')
  assert.equal(capability.data.generation.partSelectionMode,'cushions-and-main')
  assert.equal(capability.data.generation.partIdentification.automaticByDefault,false)
  const result=await call(first,'/api/studio/parts/identify',{method:'POST',body,headers})
  assert.equal(result.status,202);assert.equal(result.data.status,'complete');assert.equal(result.data.operation,'identify-parts')
  const retry=await call(second,'/api/studio/parts/identify',{method:'POST',body,headers})
  assert.equal(retry.data.id,result.data.id);assert.equal(recognitions,1)
  assert.equal((await call(second,`/api/studio/generations/${result.data.id}`,{key:randomUUID()+randomUUID()})).status,404)
  assert.equal((await call(second,'/api/studio/generations',{method:'POST',body,headers})).status,409)
  assert.equal(result.data.imageData,undefined);assert.equal(result.data.regionData,undefined)
  assert.ok(!JSON.stringify(result.data).includes('offline-google'))
})

// PGlite runs real PostgreSQL in-process. Its single connection is serialized
// here; production uses pg.Pool and PostgreSQL's own row/advisory locks.
async function fixture(t){
  const database=new PGlite()
  await database.waitReady
  let tail=Promise.resolve()
  const pool={
    async connect(){const previous=tail;let release;tail=new Promise(resolve=>{release=resolve});await previous;return {query:(...args)=>database.query(...args),release}},
    async query(...args){const client=await this.connect();try{return await client.query(...args)}finally{client.release()}},
  }
  const servers=[]
  async function server(options={}){
    const handler=createVercelHandler({pool,...options})
    const httpServer=http.createServer(handler);await new Promise(resolve=>httpServer.listen(0,'127.0.0.1',resolve));servers.push(httpServer)
    return `http://127.0.0.1:${httpServer.address().port}`
  }
  t.after(async()=>{await Promise.all(servers.map(item=>new Promise(resolve=>item.close(resolve))));await database.close()})
  const owner=randomUUID()+randomUUID()
  const call=async(base,path,{method='GET',body,key=owner,headers={}}={})=>{
    const response=await fetch(base+path,{method,headers:{Authorization:`Bearer ${key}`,...(body?{'Content-Type':'application/json'}:{}),...headers},body:body?JSON.stringify(body):undefined})
    return {status:response.status,headers:response.headers,...await response.json()}
  }
  return {pool,server,call,owner}
}

test('Vercel routes capabilities, selections and shortlist; private changes survive different function instances',async t=>{
  const {server,call}=await fixture(t),first=await server({env:{}}),second=await server({env:{}})
  assert.equal((await call(first,'/api/studio/capabilities')).status,200)
  assert.deepEqual((await call(first,'/api/selections')).data.cart,[])
  const swatches=await call(first,'/api/shortlist',{method:'PUT',body:{materialIds:['velvet']}});assert.equal(swatches.status,200)
  assert.deepEqual((await call(second,'/api/shortlist')).data.materialIds,['velvet'])
  assert.deepEqual((await call(second,'/api/shortlist',{key:randomUUID()+randomUUID()})).data.materialIds,[])
  const operation={mutationId:randomUUID(),productId:'alba-swivel',type:'delta',value:1}
  assert.equal((await call(first,'/api/selections',{method:'POST',body:{operations:[operation]}})).status,200)
  await call(second,'/api/selections',{method:'POST',body:{operations:[operation]}})
  assert.equal((await call(second,'/api/selections')).data.cart[0].quantity,1)
  const additions=await Promise.all([first,second].map(base=>call(base,'/api/selections',{method:'POST',body:{operations:[{...operation,mutationId:randomUUID()}]}})))
  assert.ok(additions.every(result=>result.status===200))
  assert.equal((await call(second,'/api/selections',{method:'POST',body:{operations:[{...operation,value:2}]}})).status,409)
  assert.equal((await call(first,'/api/selections')).data.cart[0].quantity,3)
  assert.equal((await call(first,'/api/shortlist',{method:'PUT',body:{materialIds:['missing']}})).status,400)
  assert.deepEqual((await call(second,'/api/shortlist')).data.materialIds,['velvet'])
  assert.equal((await call(first,'/api/shortlist',{headers:{Origin:'https://unapproved.example'}})).status,403)
  assert.equal((await call(first,'/api/handler?__path=studio/capabilities')).status,200)
  assert.equal((await call(first,'/api/does-not-exist')).status,404)
})

test('Vercel reports missing hosted storage and keys explicitly without writing temporary SQLite files',async t=>{
  const {server,call}=await fixture(t),base=await server({pool:null,env:{}})
  const health=await call(base,'/api/health');assert.equal(health.status,200);assert.equal(health.storageConfigured,false)
  const config=await call(base,'/api/studio/capabilities');assert.equal(config.data.generation.configured,false);assert.match(config.data.generation.setupMessage,/DATABASE_URL/)
  const selection=await call(base,'/api/selections');assert.equal(selection.status,503);assert.equal(selection.code,'STORAGE_NOT_CONFIGURED')
})

test('Supabase client roles cannot access private records even with permissive default table grants',async t=>{
  const {pool,server,call}=await fixture(t)
  await pool.query('CREATE ROLE anon')
  await pool.query('CREATE ROLE authenticated')
  await pool.query('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated')
  const base=await server({env:{}})
  assert.equal((await call(base,'/api/shortlist',{method:'PUT',body:{materialIds:['velvet']}})).status,200)
  for(const table of ['uw_owner_records','uw_image_jobs']){
    const {rows}=await pool.query('SELECT relrowsecurity FROM pg_class WHERE oid=$1::regclass',[`public.${table}`])
    assert.equal(rows[0].relrowsecurity,true)
    for(const role of ['anon','authenticated']){
      const privileges=await pool.query("SELECT has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE') AS allowed",[role,`public.${table}`])
      assert.equal(privileges.rows[0].allowed,false)
    }
    // RLS remains a second boundary if a later integration grants SELECT.
    await pool.query(`GRANT SELECT ON public.${table} TO anon`)
    const client=await pool.connect()
    try{
      await client.query('SET ROLE anon')
      assert.equal((await client.query(`SELECT * FROM public.${table}`)).rows.length,0)
    }finally{await client.query('RESET ROLE');client.release()}
  }
})

test('durable AI claims enforce retry safety, owner isolation, rolling quotas and cancellation',async t=>{
  const {pool}=await fixture(t);let time=Date.now()
  const store=createPostgresStore(pool,{now:()=>time,dailyLimit:2})
  const key=randomUUID(),first=await store.claim('owner',key,'digest')
  assert.equal(first.fresh,true)
  assert.equal((await store.claim('owner',key,'digest')).fresh,false)
  await assert.rejects(store.claim('owner',key,'other'),error=>error.status===409)
  await assert.rejects(store.get('other-owner',first.job.id),error=>error.status===404)
  await store.cancel('owner',first.job.id)
  assert.equal((await store.finish('owner',first.job.id,{id:first.job.id,status:'complete',imageData:'must-not-return'})).status,'cancelled')
  const next=await store.claim('owner',randomUUID(),'second')
  await store.finish('owner',next.job.id,{id:next.job.id,status:'complete',imageData:'temporary'})
  time+=16*60*1000
  await assert.rejects(store.get('owner',next.job.id),error=>error.status===404)
  await assert.rejects(store.claim('owner',randomUUID(),'third'),error=>error.status===429)
  const rows=await pool.query('SELECT result FROM uw_image_jobs');assert.ok(rows.rows.every(row=>!row.result.imageData))
})

test('hosted AI completes before the response and a retry on another instance returns the same result without another provider call',async t=>{
  const {server,call}=await fixture(t);let providerCalls=0
  const width=512,height=384
  const image=await sharp(randomBytes(width*height*3),{raw:{width,height,channels:3}}).png().toBuffer()
  const pixels=Buffer.alloc(width*height*4,255);for(let y=60;y<320;y++)for(let x=60;x<440;x++)pixels[(y*width+x)*4+3]=0
  const mask=await sharp(pixels,{raw:{width,height,channels:4}}).png().toBuffer()
  const options={env:{GEMINI_API_KEY:'test-only-never-send'},pollMs:2,edit:async prepared=>{providerCalls++;return {image:prepared.image,width,height,model:'offline-fixture'}}}
  const first=await server(options),second=await server(options),key=randomUUID()
  const request={method:'POST',headers:{'Idempotency-Key':key},body:{materialId:'velvet',imageData:`data:image/png;base64,${image.toString('base64')}`,maskData:`data:image/png;base64,${mask.toString('base64')}`}}
  const result=await call(first,'/api/studio/generations',request)
  assert.equal(result.status,202);assert.equal(result.data.status,'complete');assert.ok(result.data.imageData)
  assert.equal(result.headers.get('transfer-encoding'),'chunked')
  const retry=await call(second,'/api/studio/generations',request)
  assert.equal(retry.data.id,result.data.id);assert.equal(providerCalls,1)
  assert.equal((await call(second,`/api/studio/generations/${result.data.id}`)).data.status,'complete')
})

test('hosted Pollinations uses its own secret, reports its detail limit and rejects unsupported edits before a durable claim',async t=>{
  const {server,call,pool}=await fixture(t)
  const missing=await server({env:{AI_IMAGE_PROVIDER:'pollinations'}})
  const disconnected=await call(missing,'/api/studio/capabilities')
  assert.match(disconnected.data.generation.setupMessage,/POLLINATIONS_API_KEY/)
  const secret='sk_fixture-only-never-send',env={POLLINATIONS_API_KEY:secret,GEMINI_API_KEY:'unused-google-fixture',POLLINATIONS_IMAGE_MODEL:'black-forest-labs/flux.2-klein-4b'}
  const width=256,height=192
  const image=await sharp({create:{width,height,channels:4,background:'#ccc'}}).png().toBuffer()
  const pixels=Buffer.alloc(width*height*4,255)
  for(let y=30;y<160;y++)for(let x=30;x<225;x++)pixels[(y*width+x)*4+3]=0
  const mask=await sharp(pixels,{raw:{width,height,channels:4}}).png().toBuffer()
  let calls=0
  const options={env,pollMs:2,edit:async(prepared,_material,{key,model})=>{
    calls++;assert.equal(key,secret);assert.equal(model,'black-forest-labs/flux.2-klein-4b')
    return {image:prepared.image,width,height,model:'offline-fixture'}
  }}
  const first=await server(options),second=await server(options)
  const capabilities=await call(first,'/api/studio/capabilities')
  assert.equal(capabilities.data.generation.provider,'Pollinations')
  assert.deepEqual(capabilities.data.generation.supportedNativeSizes,['1K'])
  assert.ok(!JSON.stringify(capabilities).includes(secret))
  const body={materialId:'velvet',imageData:`data:image/png;base64,${image.toString('base64')}`,maskData:`data:image/png;base64,${mask.toString('base64')}`,nativeSize:'4K'}
  assert.equal((await call(first,'/api/studio/generations',{method:'POST',body,headers:{'Idempotency-Key':randomUUID()}})).status,400)
  assert.equal((await pool.query("SELECT to_regclass('public.uw_image_jobs') AS table_name")).rows[0].table_name,null)
  const request={method:'POST',body:{...body,nativeSize:'1K'},headers:{'Idempotency-Key':randomUUID()}}
  const result=await call(first,'/api/studio/generations',request),retry=await call(second,'/api/studio/generations',request)
  assert.equal(result.data.status,'complete');assert.equal(result.data.id,retry.data.id);assert.equal(calls,1)
})

test('hosted 2K edits reuse validated inputs and stream owner-private progress before returning a duplicate-safe result',async t=>{
  const {server,owner}=await fixture(t)
  const width=256,height=192,image=await sharp({create:{width,height,channels:3,background:'#aaa'}}).png().toBuffer()
  const pixels=Buffer.alloc(width*height*4,255);for(let y=30;y<160;y++)for(let x=30;x<225;x++)pixels[(y*width+x)*4+3]=0
  const mask=await sharp(pixels,{raw:{width,height,channels:4}}).png().toBuffer()
  let preparedOnce,calls=0
  const base=await server({env:{POLLINATIONS_API_KEY:'offline'},pollMs:10,prepare:async(...args)=>{preparedOnce=await prepareGeneration(...args);return preparedOnce},edit:async(prepared,_material,{model})=>{
    assert.equal(prepared,preparedOnce);assert.equal(model,'black-forest-labs/flux-3-image-klein');calls++
    await new Promise(resolve=>setTimeout(resolve,60))
    return {image,width,height,model}
  }})
  const body={materialId:'velvet',nativeSize:'2K',imageData:`data:image/png;base64,${image.toString('base64')}`,maskData:`data:image/png;base64,${mask.toString('base64')}`},key=randomUUID()
  const headers={Authorization:`Bearer ${owner}`,'Content-Type':'application/json',Accept:'application/x-ndjson','Idempotency-Key':key}
  const response=await fetch(base+'/api/studio/generations',{method:'POST',headers,body:JSON.stringify(body)}),progress=[]
  assert.match(response.headers.get('content-type'),/application\/x-ndjson/)
  const result=await readProgressJson(response,value=>progress.push(value))
  assert.equal(result.data.status,'complete');assert.ok(progress.length>0);assert.ok(progress[0].id)
  assert.ok(!JSON.stringify(progress).includes('imageData'))
  const retry=await fetch(base+'/api/studio/generations',{method:'POST',headers,body:JSON.stringify(body)}).then(response=>response.json())
  assert.equal(retry.data.id,result.data.id);assert.equal(calls,1)
})

test('saved part-fabric recipes survive function instances without saving photographs, masks or outlines',async t=>{
  const {server,call}=await fixture(t),first=await server({env:{}}),second=await server({env:{}})
  const body={materialId:'velvet',formId:'wingback',lighting:'daylight',mode:'photo',quality:'4k',generationMode:'realism',nativeSize:'4K',keepRest:true,name:'Separate cushion materials',components:[{id:'cushion-1',type:'Cushion',materialId:'leather',points:[{x:.1,y:.2}]}],imageData:'private-photo-not-for-storage',regionData:'private-outline-not-for-storage'}
  const headers={'Idempotency-Key':randomUUID()},saved=await call(first,'/api/studio/designs',{method:'POST',body,headers})
  assert.equal(saved.status,201);assert.equal(saved.data.nativeSize,'4K');assert.equal(saved.data.keepRest,true)
  assert.equal(saved.data.generationMode,'realism')
  assert.deepEqual(saved.data.components,[{id:'cushion-1',type:'Cushion',materialId:'leather'}])
  assert.equal(saved.data.imageData,undefined);assert.equal(saved.data.regionData,undefined)
  const restored=await call(second,'/api/studio/designs')
  assert.equal(restored.data[0].id,saved.data.id);assert.deepEqual(restored.data[0].components,saved.data.components)
  assert.equal(restored.data[0].generationMode,'realism')
  for(const generationMode of ['quick','invalid'])assert.equal((await call(first,'/api/studio/designs',{method:'POST',body:{...body,generationMode},headers:{'Idempotency-Key':randomUUID()}})).status,400)
  assert.deepEqual((await call(second,'/api/studio/designs',{key:randomUUID()+randomUUID()})).data,[])
  assert.equal((await call(first,'/api/studio/designs',{method:'POST',body:{...body,components:[{...body.components[0],materialId:'unknown'}]},headers:{'Idempotency-Key':randomUUID()}})).status,400)
})

test('hosted Quick and Realism independently route keys and sizes while retaining durable mode isolation',async t=>{
  const {server,call}=await fixture(t),body=await (async()=>{
    const image=await sharp({create:{width:256,height:192,channels:3,background:'#ddd'}}).png().toBuffer(),pixels=Buffer.alloc(256*192*4,255)
    for(let y=30;y<160;y++)for(let x=30;x<225;x++)pixels[(y*256+x)*4+3]=0
    const mask=await sharp(pixels,{raw:{width:256,height:192,channels:4}}).png().toBuffer()
    return {materialId:'velvet',imageData:`data:image/png;base64,${image.toString('base64')}`,maskData:`data:image/png;base64,${mask.toString('base64')}`}
  })(),calls=[]
  const options={env:{AI_IMAGE_PROVIDER:'pollinations',POLLINATIONS_API_KEY:'offline-pollinations',GEMINI_API_KEY:'offline-google',POLLINATIONS_IMAGE_MODEL:'black-forest-labs/flux.2-klein-4b'},pollMs:2,edit:async(prepared,_material,{key,model})=>{
    calls.push({key,model,size:prepared.nativeSize});return {image:prepared.image,width:256,height:192,model}
  }}
  const first=await server(options),second=await server(options),headers={'Idempotency-Key':randomUUID()}
  const realism=await call(first,'/api/studio/generations',{method:'POST',body:{...body,generationMode:'realism',nativeSize:'2K'},headers})
  assert.equal(realism.data.status,'complete')
  const retry=await call(second,'/api/studio/generations',{method:'POST',body:{...body,generationMode:'realism',nativeSize:'2K'},headers})
  assert.equal(retry.data.id,realism.data.id);assert.equal(calls.length,1)
  assert.equal((await call(second,'/api/studio/generations',{method:'POST',body:{...body,generationMode:'quick',nativeSize:'1K'},headers})).status,409)
  const quick=await call(second,'/api/studio/generations',{method:'POST',body:{...body,generationMode:'quick'},headers:{'Idempotency-Key':randomUUID()}})
  assert.equal(quick.data.status,'complete')
  assert.deepEqual(calls,[{key:'offline-google',model:'gemini-3.1-flash-image',size:'2K'},{key:'offline-pollinations',model:'black-forest-labs/flux.2-klein-4b',size:'1K'}])
})
