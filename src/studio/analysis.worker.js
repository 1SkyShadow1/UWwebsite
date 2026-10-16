import { analyseSurface } from './surface-analysis.js'

self.onmessage=({data})=>{
  try{
    const source={width:data.width,height:data.height,data:new Uint8ClampedArray(data.pixels)}
    const analysis=analyseSurface(source,new Float32Array(data.mask),data.depth,{preserveCreases:data.preserveCreases})
    self.postMessage({id:data.id,analysis},[analysis.data.buffer,analysis.geometry.buffer])
  }catch(error){self.postMessage({id:data.id,error:error.message || 'Surface lighting could not be analysed.'})}
}
