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
