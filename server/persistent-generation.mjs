import { createStudioGenerationService, prepareGeneration, generationDigest, StudioGenerationError } from './studio-generation.mjs'
import { aiProviderVariable } from './ai-providers.mjs'

const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms))

export function createPersistentGeneration({store,configured,local=createStudioGenerationService(),getProvider=async()=>'google',pollMs=350,env=process.env,prepare=prepareGeneration}){
  async function finishClaim(owner,claim,launch,{signal,onProgress=()=>{}}={}){
    if(!claim.fresh)return claim.job
    const id=claim.job.id;let localId
    try{
      if(signal?.aborted)return await store.cancel(owner,id)
      const job=await launch();localId=job.id
      let previousStage
      for(;;){
        const saved=await store.get(owner,id)
        if(signal?.aborted||saved.status==='cancelled'){local.cancel(owner,localId);return await store.cancel(owner,id)}
        const result=local.get(owner,localId)
        if(['complete','failed','cancelled','expired'].includes(result.status))return await store.finish(owner,id,{...result,id})
        if(result.stage!==previousStage){previousStage=result.stage;onProgress({id,status:result.status,stage:result.stage})}
        await delay(pollMs)
      }
    }catch(error){
      if(localId)try{local.cancel(owner,localId)}catch{}
      await store.finish(owner,id,{id,status:'failed',error:error.status?error.message:'The hosted AI operation was interrupted. Check the provider before retrying.'}).catch(()=>{})
      throw error
    }
  }
  return {
    async capabilities(){
      const capabilities=await local.capabilities()
      const connected=await configured(),variable=aiProviderVariable(await getProvider())
      return {...capabilities,partIdentification:{...capabilities.partIdentification,configured:Boolean(store)&&capabilities.partIdentification?.configured},modes:capabilities.modes?.map(mode=>({...mode,configured:Boolean(store)&&mode.configured,setupMessage:!store?'Hosted storage is not connected. Configure DATABASE_URL in Vercel.':mode.setupMessage})),configured:Boolean(store)&&connected,persistence:'postgresql',setupMessage:!store?'Hosted storage is not connected. Configure DATABASE_URL in Vercel.':!connected?`Add the server-only ${variable} environment variable in Vercel and redeploy.`:undefined}
    },
    async start(owner,body,key,materials,{signal,onProgress=()=>{}}={}){
      if(!store)throw new StudioGenerationError(503,'Connect PostgreSQL storage in Vercel before generating.')
      if(!/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(key || ''))throw new StudioGenerationError(400,'Use a unique generation request reference.')
      const material=materials.find(item=>item.id===body.materialId)
      if(!material)throw new StudioGenerationError(400,'Choose a known fabric before generating.')
      const route=await local.plan(body)
      // Reject invalid inputs before reserving a durable, potentially paid job.
      const prepared=await prepare({...body,nativeSize:route.nativeSize},material)
      const digest=generationDigest(route.provider,body,route.model)
      const claim=await store.claim(owner,key,digest)
      return finishClaim(owner,claim,()=>local.start(owner,body,key,materials,{prepared,route}),{signal,onProgress})
    },
    async identify(owner,body,key,materials,options={}){
      if(!store)throw new StudioGenerationError(503,'Connect PostgreSQL storage before using AI part identification.')
      if(!/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(key || ''))throw new StudioGenerationError(400,'Use a unique part identification reference.')
      const route=await local.planIdentification(),material=materials.find(item=>item.id===body.materialId)
      if(!material)throw new StudioGenerationError(400,'Choose a known fabric before identifying parts.')
      const prepared=await prepare(body,material)
      if(!prepared.components.length)throw new StudioGenerationError(400,'Find sections or outline a pillow or cushion first.')
      const claim=await store.claim(owner,key,'identify-parts:'+generationDigest('google',body,route.model))
      return finishClaim(owner,claim,()=>local.identify(owner,body,key,materials,{prepared,route}),options)
    },
    async get(owner,id){if(!store)throw new StudioGenerationError(503,'Hosted storage is not connected.');return store.get(owner,id)},
    async cancel(owner,id){if(!store)throw new StudioGenerationError(503,'Hosted storage is not connected.');return store.cancel(owner,id)},
    dispose(){local.dispose()},
  }
}
