import { pipeline, RawImage, env } from '@huggingface/transformers'

env.allowRemoteModels=false
env.allowLocalModels=true
env.localModelPath='/models/'
env.backends.onnx.wasm.numThreads=1
env.backends.onnx.wasm.proxy=false
env.backends.onnx.wasm.wasmPaths={mjs:'/vendor/onnx/ort-wasm-simd-threaded.mjs',wasm:'/vendor/onnx/ort-wasm-simd-threaded.wasm'}
let modelPromise,busy=false
const getModel=()=>modelPromise ||= pipeline('depth-estimation','depth-anything-v2-small',{device:'wasm',dtype:'q8',progress_callback:progress=>{if(progress.status==='progress')self.postMessage({progress:Math.round(progress.progress || 0)})}}).catch(error=>{modelPromise=null;throw error})

self.onmessage=async({data})=>{
  if(busy){self.postMessage({id:data.id,error:'The depth engine is already analysing a frame.'});return}
  busy=true
  try{
    const estimator=await getModel()
    const result=await estimator(new RawImage(new Uint8ClampedArray(data.pixels),data.width,data.height,4))
    const prediction=result.predicted_depth, dims=prediction.dims
    const width=dims[dims.length-1],height=dims[dims.length-2],values=new Float32Array(prediction.data)
    self.postMessage({id:data.id,width,height,values},[values.buffer])
  }catch(error){self.postMessage({id:data.id,error:error.message || 'AI depth analysis is unavailable.'})}
  finally{busy=false}
}
