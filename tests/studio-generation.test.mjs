import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, unlink, rmdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { createStudioGenerationService, prepareGeneration, editWithOpenAI, editWithGoogle, compositeGeneration, generationSize } from '../server/studio-generation.mjs'
import { createAiSetupHandler } from '../server/configure-ai.mjs'
import { saveAiCredential, getAiCredential, getAiProvider } from '../server/ai-credentials.mjs'
import { createApiHandler } from '../server/index.mjs'
import { openDatabase } from '../server/database.mjs'
import { materials } from '../src/data/materials.js'
import { generateUpholstery } from '../src/studio/generative.js'

const material=materials.find(item=>item.id==='velvet'),fakeKey='sk-test-credential-never-send-to-a-provider'
const url=bytes=>`data:image/png;base64,${bytes.toString('base64')}`
async function imageFixture(){
  const width=256,height=192
  const photo=await sharp({create:{width,height,channels:4,background:'#d5cfc5'}}).png().toBuffer()
  const pixels=Buffer.alloc(width*height*4,255)
  for(let y=35;y<160;y++)for(let x=35;x<220;x++)pixels[(y*width+x)*4+3]=0
  const mask=await sharp(pixels,{raw:{width,height,channels:4}}).png().toBuffer()
  const changed=await sharp({create:{width,height,channels:4,background:'#315a4b'}}).png().toBuffer()
  return {body:{materialId:material.id,imageData:url(photo),maskData:url(mask)},photo,mask,changed,width,height}
}
const pause=()=>new Promise(resolve=>setTimeout(resolve,8))
async function complete(service,owner,id){
  for(let n=0;n<200;n++){const job=service.get(owner,id);if(['complete','failed','cancelled'].includes(job.status))return job;await pause()}
  throw new Error('The local test job did not settle')
}

test('AI editing receives original photo, transparent mask and a separate tinted reference without source overlays',async()=>{
  const fixture=await imageFixture(),prepared=await prepareGeneration(fixture.body,material)
  let sent
  const result=await editWithOpenAI(prepared,material,{key:fakeKey,owner:'hashed-owner',fetchImpl:async(endpoint,options)=>{
    assert.equal(endpoint,'https://api.openai.com/v1/images/edits')
    sent=JSON.parse(options.body)
    assert.equal(options.headers.Authorization,`Bearer ${fakeKey}`)
    return new Response(JSON.stringify({data:[{b64_json:fixture.changed.toString('base64')}]}),{status:200})
  }})
  assert.equal(sent.images.length,2);assert.ok(sent.mask.image_url.startsWith('data:image/png;base64,'));assert.notEqual(sent.images[0].image_url,sent.images[1].image_url)
  assert.match(sent.prompt,/Replace the original fabric completely/);assert.equal(sent.input_fidelity,undefined)
  assert.equal(sent.quality,'high');assert.equal(sent.n,1)
  assert.equal(result.width,256);assert.equal(result.height,192)
})

test('AI compositing preserves unselected room pixels and replaces selected fabric pixels exactly',async()=>{
  const fixture=await imageFixture(),prepared=await prepareGeneration(fixture.body,material)
  const result=await compositeGeneration(prepared,{image:fixture.changed,width:256,height:192,model:'test'})
  const original=await sharp(fixture.photo).ensureAlpha().raw().toBuffer(),output=await sharp(Buffer.from(result.imageData.split(',')[1],'base64')).ensureAlpha().raw().toBuffer()
  assert.deepEqual(output.subarray(0,4),original.subarray(0,4))
  const at=(90*256+90)*4
  assert.deepEqual([...output.subarray(at,at+3)],[49,90,75])
  assert.notDeepEqual(output.subarray(at,at+3),original.subarray(at,at+3))
})

test('AI input validation rejects damaged files, mismatched masks and whole-room edits before provider calls',async()=>{
  const fixture=await imageFixture()
  await assert.rejects(prepareGeneration({...fixture.body,imageData:'https://untrusted.example/image.png'},material),/photograph/i)
  const mismatch=await sharp({create:{width:128,height:128,channels:4,background:'#fff0'}}).png().toBuffer()
  await assert.rejects(prepareGeneration({...fixture.body,maskData:url(mismatch)},material),/match/)
  const whole=await sharp({create:{width:256,height:192,channels:4,background:'#fff0'}}).png().toBuffer()
  await assert.rejects(prepareGeneration({...fixture.body,maskData:url(whole)},material),/room unselected/)
  const size=generationSize(1200,900);assert.ok(size.width*size.height<=8_294_400);assert.equal(size.width%16,0);assert.equal(size.height%16,0)
  assert.deepEqual(generationSize(1200,900,1024),{width:1024,height:768})
  assert.throws(()=>generationSize(5000,500),/3:1/)
  assert.throws(()=>generationSize(3000,1000,1024),/closer to square/)
})

test('generation retries are duplicate-safe, results stay owner-private and cancellation frees the job',async t=>{
  const fixture=await imageFixture();let calls=0
  const service=createStudioGenerationService({getKey:async()=>fakeKey,isConfigured:async()=>true,edit:async()=>{calls++;return {image:fixture.changed,width:256,height:192,model:'test'}}})
  t.after(()=>service.dispose())
  const key=randomUUID(),[first,retry]=await Promise.all([service.start('owner',fixture.body,key,materials),service.start('owner',fixture.body,key,materials)])
  assert.equal(first.id,retry.id)
  assert.throws(()=>service.get('another-owner',first.id),/unavailable/)
  await assert.rejects(service.start('owner',{...fixture.body,materialId:'leather'},key,materials),/another edit/)
  const result=await complete(service,'owner',first.id);assert.equal(result.status,'complete');assert.equal(calls,1);assert.ok(result.imageData)
  const next=await service.start('owner',fixture.body,randomUUID(),materials)
  assert.equal(service.cancel('owner',next.id).status,'cancelled')
  const cancelled=await complete(service,'owner',next.id);assert.equal(cancelled.status,'cancelled')
})

test('AI provider errors and timeouts are recoverable and never echo credentials or provider diagnostics',async t=>{
  const fixture=await imageFixture(),prepared=await prepareGeneration(fixture.body,material)
  await assert.rejects(editWithOpenAI(prepared,material,{key:fakeKey,fetchImpl:async()=>new Response(`secret ${fakeKey}`,{status:401})}),error=>error.status===503&&!error.message.includes(fakeKey))
  await assert.rejects(editWithOpenAI(prepared,material,{key:fakeKey,fetchImpl:async()=>new Response('{}',{status:429})}),error=>error.status===429)
  for(const [code,message]of [['insufficient_quota',/billing quota/],['rate_limit_exceeded',/limiting requests/]]){
    await assert.rejects(editWithOpenAI(prepared,material,{key:fakeKey,fetchImpl:async()=>new Response(JSON.stringify({error:{code,message:fakeKey}}),{status:429})}),error=>error.status===429&&message.test(error.message)&&!error.message.includes(fakeKey))
  }
  let enteredProvider=false
  const service=createStudioGenerationService({isConfigured:async()=>true,getKey:async()=>fakeKey,timeoutMs:1000,edit:()=>{enteredProvider=true;return new Promise(()=>{})}});t.after(()=>service.dispose())
  const job=await service.start('owner',fixture.body,randomUUID(),materials),result=await complete(service,'owner',job.id)
  assert.equal(enteredProvider,true);assert.equal(result.status,'failed');assert.match(result.error,/too long/)
})

test('real HTTP generation endpoints enforce auth, idempotency, private results and explicit provider configuration',async t=>{
  const fixture=await imageFixture(),database=openDatabase(':memory:')
  const service=createStudioGenerationService({isConfigured:async()=>true,getKey:async()=>fakeKey,edit:async()=>({image:fixture.changed,width:256,height:192,model:'test'})})
  const server=http.createServer(createApiHandler({database,generationService:service}));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
  t.after(async()=>{service.dispose();await new Promise(resolve=>server.close(resolve));database.close()})
  const base=`http://127.0.0.1:${server.address().port}`,owner=randomUUID()+randomUUID(),key=randomUUID()
  const call=async(path,{method='GET',body,token=owner,requestKey=key}={})=>{const response=await fetch(base+path,{method,headers:{...(token?{Authorization:`Bearer ${token}`}:{}) ,'Content-Type':'application/json','Idempotency-Key':requestKey},body:body?JSON.stringify(body):undefined});return {status:response.status,...await response.json()}}
  assert.equal((await call('/api/studio/generations',{method:'POST',body:fixture.body,token:null})).status,401)
  const first=await call('/api/studio/generations',{method:'POST',body:fixture.body});assert.equal(first.status,202)
  const retry=await call('/api/studio/generations',{method:'POST',body:fixture.body});assert.equal(first.data.id,retry.data.id)
  assert.equal((await call(`/api/studio/generations/${first.data.id}`,{token:randomUUID()})).status,404)
  const result=await complete(service,(await import('node:crypto')).createHash('sha256').update(owner).digest('hex'),first.data.id)
  const returned=await call(`/api/studio/generations/${first.data.id}`);assert.equal(returned.data.status,'complete');assert.equal(returned.data.width,result.width)
  assert.equal(database.listAll('studio-generation').length,0)
  const config=await call('/api/studio/capabilities');assert.equal(config.data.generation.configured,true);assert.ok(!JSON.stringify(config).includes(fakeKey))
  const disconnected=createStudioGenerationService({isConfigured:async()=>false})
  await assert.rejects(disconnected.start('owner',fixture.body,randomUUID(),materials),error=>error.status===503)
})

test('local key setup rejects other origins, rebinding hosts, missing tokens and malformed token bytes',async t=>{
  const token='a'.repeat(64);let saved=0
  const server=http.createServer(createAiSetupHandler({token,save:async key=>{assert.equal(key,fakeKey);saved++}}));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
  t.after(()=>new Promise(resolve=>server.close(resolve)))
  const base=`http://127.0.0.1:${server.address().port}`
  assert.equal((await fetch(`${base}/?token=wrong`)).status,403)
  assert.equal((await fetch(`${base}/?token=${encodeURIComponent('é'.repeat(64))}`)).status,403)
  const form=await fetch(`${base}/?token=${token}`);assert.equal(form.status,200);assert.match(form.headers.get('content-security-policy'),/frame-ancestors 'none'/)
  const send=(headers={})=>fetch(base+'/connect',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',...headers},body:JSON.stringify({key:fakeKey})})
  assert.equal((await send({Origin:'https://other.example'})).status,403)
  const rebinding=await new Promise(resolve=>{
    const req=http.request(base+'/connect',{method:'POST',headers:{Host:`evil.example:${server.address().port}`,Authorization:`Bearer ${token}`,'Content-Type':'application/json'}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode))})
    req.end(JSON.stringify({key:fakeKey}))
  })
  assert.equal(rebinding,403)
  const response=await send();assert.equal(response.status,200);assert.equal(saved,1);assert.ok(!(await response.text()).includes(fakeKey))
})

test('Windows local credentials round-trip through DPAPI without plaintext on disk',{skip:process.platform!=='win32'},async t=>{
  const directory=await mkdtemp(join(tmpdir(),'uw-ai-credential-test-')),path=join(directory,'credential.json')
  t.after(async()=>{await unlink(path).catch(()=>{});await rmdir(directory)})
  await saveAiCredential(fakeKey,{path})
  assert.ok(!(await readFile(path,'utf8')).includes(fakeKey))
  assert.equal(await getAiCredential({path,env:{}}),fakeKey)
  await saveAiCredential(fakeKey,{path,provider:'google'})
  assert.equal(await getAiProvider({path,env:{}}),'google')
  assert.equal(await getAiCredential({path,env:{}}),fakeKey)
  assert.equal(await getAiCredential({path,env:{},provider:'openai'}),null)
  assert.equal(await getAiCredential({path,env:{OPENAI_API_KEY:'other-key'}}),fakeKey)
})

test('Google image editing sends an opaque selection guide, one photo and one swatch without putting the key in the URL',async()=>{
  const fixture=await imageFixture(),prepared=await prepareGeneration(fixture.body,material)
  let sent
  const result=await editWithGoogle(prepared,material,{key:fakeKey,quality:'low',fetchImpl:async(endpoint,options)=>{
    assert.match(endpoint,/^https:\/\/generativelanguage\.googleapis\.com\/v1\/models\/gemini-3\.1-flash-image:generateContent$/)
    assert.ok(!endpoint.includes(fakeKey));assert.equal(options.headers['x-goog-api-key'],fakeKey)
    sent=JSON.parse(options.body)
    return new Response(JSON.stringify({candidates:[{content:{parts:[{thought:true,inlineData:{mimeType:'image/png',data:'not-the-result'}},{inlineData:{mimeType:'image/png',data:fixture.changed.toString('base64')}}]}}]}))
  }})
  assert.equal(sent.contents[0].parts.length,4);assert.equal(sent.generationConfig.responseFormat.image.imageSize,'1K')
  const guide=Buffer.from(sent.contents[0].parts[3].inline_data.data,'base64')
  const pixels=await sharp(guide).toColourspace('b-w').raw().toBuffer()
  assert.equal(pixels[0],0);assert.equal(pixels[90*256+90],255)
  assert.equal(result.width,256);assert.equal(result.height,192)
  for(const status of [400,403,404,429,500])await assert.rejects(editWithGoogle(prepared,material,{key:fakeKey,fetchImpl:async()=>new Response(fakeKey,{status})}),error=>error.status>=400&&!error.message.includes(fakeKey))
  await assert.rejects(editWithGoogle(prepared,material,{key:fakeKey,fetchImpl:async()=>new Response(JSON.stringify({candidates:[{content:{parts:[{text:fakeKey}]}}]}))}),/did not return/)
})

test('Google connection metadata and job dispatch select the Google model while keeping owner isolation',async t=>{
  const fixture=await imageFixture();let providerSeen
  const service=createStudioGenerationService({getProvider:async()=>'google',isConfigured:async()=>true,getKey:async options=>{assert.equal(options.provider,'google');return fakeKey},edit:async(_prepared,_material,options)=>{providerSeen=options.model;return {image:fixture.changed,width:256,height:192,model:options.model}}})
  t.after(()=>service.dispose())
  const capabilities=await service.capabilities();assert.equal(capabilities.provider,'Google Gemini');assert.equal(capabilities.requestedNativeSize,'1K')
  const job=await service.start('owner',fixture.body,randomUUID(),materials)
  assert.equal((await complete(service,'owner',job.id)).status,'complete');assert.equal(providerSeen,'gemini-3.1-flash-image')
  assert.throws(()=>service.get('another-owner',job.id),/unavailable/)
})

test('the Studio generation client polls completed images and preserves terminal failures for explicit retry',async()=>{
  let polls=0
  const result=await generateUpholstery(async(path)=>path==='/api/studio/generations'?{id:'job',status:'generating'}:(polls++,{id:'job',status:'complete',imageData:'test'}),{}, {key:randomUUID(),pollMs:1})
  assert.equal(result.imageData,'test');assert.equal(polls,1)
  await assert.rejects(generateUpholstery(async()=>({id:'job',status:'failed',error:'Provider limit'}),{},{key:randomUUID(),pollMs:1}),error=>error.terminal===true)
  const controller=new AbortController();let cancelled=0
  await assert.rejects(generateUpholstery(async(path,options)=>{
    if(options.method==='DELETE'){cancelled++;return {status:'cancelled'}}
    return {id:'cancelled-job',status:'generating'}
  },{},{signal:controller.signal,key:randomUUID(),onStatus:()=>controller.abort()}),error=>error.name==='AbortError')
  assert.equal(cancelled,1)
})
