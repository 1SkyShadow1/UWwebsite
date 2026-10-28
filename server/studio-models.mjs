import { validateGenerationMode } from '../src/studio/generation-modes.js'

export const POLLINATIONS_QUICK_MODEL='black-forest-labs/flux.2-klein-4b'
export const POLLINATIONS_DETAIL_MODEL='black-forest-labs/flux-3-image-klein'
const profiles=Object.freeze({
  [POLLINATIONS_QUICK_MODEL]:{nativeSizes:['1K'],maximumPixels:2_400_000},
  [POLLINATIONS_DETAIL_MODEL]:{nativeSizes:['1K','2K','4K'],maximumPixels:20_000_000},
  'google/gemini-3.1-flash-image':{nativeSizes:['1K','2K','4K'],maximumPixels:20_000_000},
})
export function pollinationsModelProfile(model=POLLINATIONS_QUICK_MODEL){
  if(!Object.hasOwn(profiles,model))throw Object.assign(new Error('Choose a supported multi-reference editing model for POLLINATIONS_IMAGE_MODEL. See the deployment guide.'),{status:503})
  return profiles[model]
}
export function generationModel(provider,nativeSize='1K',env=process.env){
  if(provider==='pollinations')return env.POLLINATIONS_IMAGE_MODEL || (nativeSize==='1K'?POLLINATIONS_QUICK_MODEL:POLLINATIONS_DETAIL_MODEL)
  return provider==='google'?(env.GOOGLE_IMAGE_MODEL || 'gemini-3.1-flash-image'):(env.OPENAI_IMAGE_MODEL || 'gpt-image-2.5-sunburst')
}
export function pollinationsDetails(env=process.env){
  const details=['1K','2K','4K'].map(size=>({size,model:generationModel('pollinations',size,env)}))
  return details.filter(item=>pollinationsModelProfile(item.model).nativeSizes.includes(item.size))
}

// Explicit modes cannot silently switch providers or increase Quick's size.
// Requests from older clients retain the configured provider and size routing.
export function generationRoute(body,defaultProvider,env=process.env,quality='high'){
  const mode=validateGenerationMode(body.generationMode)
  if(body.nativeSize!==undefined&&!['1K','2K','4K'].includes(body.nativeSize))throw Object.assign(new Error('Choose a supported AI image detail.'),{status:400})
  if(mode==='quick'&&body.nativeSize&&body.nativeSize!=='1K')throw Object.assign(new Error('Quick mode stays at 1K for speed. Choose Realism for 2K or 4K.'),{status:400})
  const provider=mode==='quick'?'pollinations':mode==='realism'?'google':defaultProvider
  const nativeSize=quality==='low'?'1K':body.nativeSize || (mode==='realism'?'2K':'1K')
  const model=mode==='quick'?POLLINATIONS_QUICK_MODEL:generationModel(provider,nativeSize,env)
  if(provider==='pollinations'&&!pollinationsModelProfile(model).nativeSizes.includes(nativeSize))throw Object.assign(new Error('Choose a supported AI image detail for the connected Pollinations model.'),{status:400})
  return {provider,model,nativeSize,generationMode:mode}
}
