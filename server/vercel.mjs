import { Pool } from 'pg'
import { Readable } from 'node:stream'
import { AsyncLocalStorage } from 'node:async_hooks'
import { createApiHandler, ownerFor } from './index.mjs'
import { createPostgresStore } from './postgres-store.mjs'
import { createPersistentGeneration } from './persistent-generation.mjs'
import { createStudioGenerationService } from './studio-generation.mjs'

const json=(res,status,payload)=>{
  res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'})
  res.end(JSON.stringify(payload))
}
const publicPaths=new Set(['/api/health','/api/config/storage','/api/config/ar','/api/materials','/api/furniture','/api/studio/capabilities','/api/estimates'])
const privatePaths=new Set(['/api/studio/designs','/api/shortlist','/api/selections','/api/projects','/api/enquiries','/api/visualiser/sessions','/api/visualiser/preview'])

function bufferResponse(real){
  const headers=new Map()
  return {
    statusCode:200,headersSent:false,body:'',
    setHeader(name,value){headers.set(name.toLowerCase(),value)},
    writeHead(status,values={}){this.statusCode=status;for(const [name,value]of Object.entries(values))this.setHeader(name,value);this.headersSent=true},
    end(value=''){this.body+=value},
    flush(){for(const [name,value]of headers)real.setHeader(name,value);real.writeHead(this.statusCode);real.end(this.body)},
  }
}

export function createVercelHandler({env=process.env,pool,edit,pollMs}={}){
  const connectionString=env.DATABASE_URL || env.POSTGRES_URL
  pool ||= connectionString?new Pool({connectionString,max:3,idleTimeoutMillis:10000,connectionTimeoutMillis:10000,allowExitOnIdle:true}):null
  pool?.on?.('error',()=>console.error('The hosted database pool lost an idle connection.'))
  const limit=Number(env.AI_DAILY_GENERATION_LIMIT || 20)
  if(!Number.isInteger(limit)||limit<1||limit>1000)throw new Error('Set AI_DAILY_GENERATION_LIMIT to a whole number from 1 to 1000.')
  const store=pool?createPostgresStore(pool,{dailyLimit:limit}):null
  const provider=async()=>env.AI_IMAGE_PROVIDER==='openai'?'openai':'google'
  const key=async({provider:chosen}={})=>(chosen || await provider())==='google'?(env.GEMINI_API_KEY || env.GOOGLE_API_KEY)?.trim():env.OPENAI_API_KEY?.trim()
  const configured=async()=>Boolean(await key())
  const local=createStudioGenerationService({getProvider:provider,getKey:key,isConfigured:configured,edit})
  const generationService=createPersistentGeneration({store,configured,local,getProvider:provider,pollMs})
  const repositories=new AsyncLocalStorage()
  const repository=new Proxy({}, {get(_target,name){const database=repositories.getStore();if(!database)throw new Error('No request database');return database[name].bind(database)}})
  const api=createApiHandler({database:repository,corsOrigin:env.CORS_ORIGIN,generationService})

  return async function vercelApi(incoming,res){
    let req=incoming
    try{
      const url=new URL(req.url,'http://localhost')
      const rewritten=req.query?.__path || url.searchParams.get('__path')
      if(rewritten){url.pathname=`/api/${rewritten}`;url.searchParams.delete('__path')}
      req.url=url.pathname+url.search
      // Vercel may already have consumed JSON into req.body. Reconstitute the
      // bounded byte stream so the shared validators run identically everywhere.
      if(req.body!==undefined){
        const bytes=Buffer.from(typeof req.body==='string'?req.body:JSON.stringify(req.body))
        if(bytes.length>4_000_000)return json(res,413,{error:'This upload exceeds the hosted 4 MB limit. Choose a smaller photograph.'})
        req=Object.assign(Readable.from([bytes]),{url:req.url,method:req.method,headers:req.headers,socket:req.socket})
      }else if(Number(req.headers['content-length'])>4_000_000)return json(res,413,{error:'This upload exceeds the hosted 4 MB limit. Choose a smaller photograph.'})
      const path=url.pathname
      if(path==='/api/health'&&req.method==='GET')return json(res,200,{ok:true,service:'upholstery-warehouse-api',persistence:'postgresql',storageConfigured:Boolean(store),time:new Date().toISOString()})
      const needsStorage=privatePaths.has(path)||/^\/api\/projects\/[a-f0-9-]{36}$/.test(path)||path.startsWith('/api/visualiser/preview/')
      if(publicPaths.has(path)||req.method==='OPTIONS'||path.startsWith('/api/studio/generations')||!needsStorage){
        res.uwStreamJson=true
        return await api(req,res)
      }
      // Validate origins and ownership before opening any database transaction.
      const origin=req.headers.origin
      if(origin){
        let sameHost=false
        try{sameHost=new URL(origin).host===req.headers.host}catch{}
        if(!sameHost&&origin!==env.CORS_ORIGIN)return json(res,403,{error:'This origin is not allowed.'})
      }
      const owner=ownerFor(req)
      if(!store)return json(res,503,{error:'Hosted storage is not connected. Add a PostgreSQL database to this Vercel project and redeploy.',code:'STORAGE_NOT_CONFIGURED'})
      const buffered=bufferResponse(res)
      await store.withOwner(owner,async database=>{
        await repositories.run(database,()=>api(req,buffered))
        return {commit:['POST','PUT','DELETE'].includes(req.method)&&buffered.statusCode<400}
      })
      buffered.flush()
    }catch(error){
      if(!res.headersSent)json(res,error.status || 503,{error:error.status?error.message:'The hosted database connection is unavailable. Your browser copy is still here; check the Vercel database settings.'})
      else res.end()
    }
  }
}
