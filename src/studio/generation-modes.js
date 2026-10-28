export const GENERATION_MODES=Object.freeze({
  quick:{label:'Quick',defaultSize:'1K',sizes:['1K'],description:'Fast 1K fabric edits. No second AI pass. More distinct fabrics take longer.'},
  realism:{label:'Realism',defaultSize:'2K',sizes:['1K','2K','4K'],description:'Direct Gemini editing for material detail. Starts at 2K; takes longer and can use more credits.'},
})

export function validateGenerationMode(value){
  if(value!==undefined&&!Object.hasOwn(GENERATION_MODES,value))throw Object.assign(new Error('Choose Quick or Realism for this AI edit.'),{status:400})
  return value
}
