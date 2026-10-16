import { createSurfaceRenderer } from './surface-renderer.js'

self.onmessage=async({data})=>{
  let renderer
  try{
    const canvas=new OffscreenCanvas(data.width,data.height)
    renderer=createSurfaceRenderer(canvas)
    renderer.setSource(data.source)
    renderer.setAnalysis({...data.analysis,data:new Uint8Array(data.analysis.data),geometry:new Uint8Array(data.analysis.geometry)},data.analysis.width,data.analysis.height)
    renderer.setMaterial(data.images,data.material)
    renderer.render({compare:0,showMask:false,width:data.width,height:data.height})
    const blob=await canvas.convertToBlob({type:'image/png'})
    self.postMessage({id:data.id,blob})
  }catch(error){self.postMessage({id:data.id,error:error.message || 'The high-resolution renderer could not complete. Try 4K.'})}
  finally{renderer?.dispose();data.source?.close();for(const image of Object.values(data.images || {}))image?.close()}
}
