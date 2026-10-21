import { createStudioGenerationService, prepareGeneration, generationDigest, StudioGenerationError } from './studio-generation.mjs'
import { aiProviderVariable } from './ai-providers.mjs'
import { generationModel } from './studio-models.mjs'

const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms))

export function createPersistentGeneration({store,configured,local=createStudioGenerationService(),getProvider=async()=>'google',pollMs=350,env=process.env,prepare=prepareGeneration}){
  return {
    async capabilities(){
      const capabilities=await local.capabilities()
      const connected=await configured(),variable=aiProviderVariable(await getProvider())
      return {...capabilities,configured:Boolean(store)&&connected,persistence:'postgresql',setupMessage:!store?'Hosted storage is not connected. Configure DATABASE_URL in Vercel.':!connected?`Add the server-only ${variable} environment variable in Vercel and redeploy.`:undefined}
    },
    async start(owner,body,key,materials,{signal,onProgress=()=>{}}={}){
      if(!store)throw new StudioGenerationError(503,'Connect PostgreSQL storage in Vercel before generating.')
      if(!await configured())throw new StudioGenerationError(503,`Add the server-only ${aiProviderVariable(await getProvider())} environment variable in Vercel and redeploy.`)
      if(!/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(key || ''))throw new StudioGenerationError(400,'Use a unique generation request reference.')
      const material=materials.find(item=>item.id===body.materialId)
      if(!material)throw new StudioGenerationError(400,'Choose a known fabric before generating.')
      const capabilities=await local.capabilities()
      if(body.nativeSize&&!capabilities.supportedNativeSizes?.includes(body.nativeSize))throw new StudioGenerationError(400,'Choose a supported AI image detail for the connected model.')
      if(body.components?.length&&!capabilities.maximumParts)throw new StudioGenerationError(400,'This connection does not support separate fabrics.')
      // Reject invalid inputs before reserving a durable, potentially paid job.
      const prepared=await prepare(body,material)
      const provider=await getProvider()
      const digest=generationDigest(provider,body,generationModel(provider,body.nativeSize || '1K',env))
      const claim=await store.claim(owner,key,digest)
      if(!claim.fresh)return claim.job
      const id=claim.job.id
      let localId
      try{
        if(signal?.aborted)return await store.cancel(owner,id)
        const job=await local.start(owner,body,key,materials,{prepared})
        localId=job.id
        let previousStage
        for(;;){
          const saved=await store.get(owner,id)
          if(signal?.aborted||saved.status==='cancelled'){
            local.cancel(owner,localId)
            return await store.cancel(owner,id)
          }
          const result=local.get(owner,localId)
          if(['complete','failed','cancelled','expired'].includes(result.status))return await store.finish(owner,id,{...result,id})
          if(result.stage!==previousStage){previousStage=result.stage;onProgress({id,status:result.status,stage:result.stage})}
          await delay(pollMs)
        }
      }catch(error){
        if(localId)try{local.cancel(owner,localId)}catch{}
        const failed={id,status:'failed',error:error.status?error.message:'The hosted AI edit was interrupted. Check the provider before retrying.'}
        await store.finish(owner,id,failed).catch(()=>{})
        throw error
      }
    },
    async get(owner,id){if(!store)throw new StudioGenerationError(503,'Hosted storage is not connected.');return store.get(owner,id)},
    async cancel(owner,id){if(!store)throw new StudioGenerationError(503,'Hosted storage is not connected.');return store.cancel(owner,id)},
    dispose(){local.dispose()},
  }
}
