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
