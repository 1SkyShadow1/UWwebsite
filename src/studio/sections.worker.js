import { SamModel, AutoProcessor, RawImage, env } from '@huggingface/transformers'
import { chooseSections, sectionSeeds } from './section-detection.js'

env.allowRemoteModels=false;env.allowLocalModels=true;env.localModelPath='/models/'
env.backends.onnx.wasm.numThreads=1;env.backends.onnx.wasm.proxy=false
env.backends.onnx.wasm.wasmPaths={mjs:'/vendor/onnx/ort-wasm-simd-threaded.mjs',wasm:'/vendor/onnx/ort-wasm-simd-threaded.wasm'}
let modelPromise,busy=false
const getModel=()=>modelPromise ||= Promise.all([
  SamModel.from_pretrained('slimsam-77-uniform',{device:'wasm',dtype:'q8',progress_callback:progress=>{if(progress.status==='progress')self.postMessage({progress:Math.round(progress.progress || 0)})}}),
  AutoProcessor.from_pretrained('slimsam-77-uniform'),
]).catch(error=>{modelPromise=null;throw error})

self.onmessage=async({data})=>{
  if(busy){self.postMessage({id:data.id,error:'Section detection is already running.'});return}
  busy=true
  let inputs,output,tensor
  try{
    const [model,processor]=await getModel(),image=new RawImage(new Uint8ClampedArray(data.pixels),data.width,data.height,4),upholstery=new Float32Array(data.mask)
    const seeds=sectionSeeds(upholstery,data.width,data.height)
    if(!seeds.length){self.postMessage({id:data.id,sections:[]});return}
    self.postMessage({progress:'Analysing cushion and panel boundaries on this device. This may take a minute; you can stop detection and outline a part manually.'})
    inputs=await processor(image,{input_points:[seeds.map(point=>[[point.x,point.y]])]})
    output=await model(inputs)
    const masks=await processor.post_process_masks(output.pred_masks,inputs.original_sizes,inputs.reshaped_input_sizes)
    tensor=masks[0]
    self.postMessage({progress:'Tracing section outlines and excluding the room…'})
    const size=data.width*data.height,candidates=[]
    for(let point=0;point<seeds.length;point++)for(let variant=0;variant<3;variant++){
      const index=point*3+variant
      candidates.push({point:seeds[point],score:output.iou_scores.data[index],values:tensor.data.subarray(index*size,(index+1)*size)})
    }
    const sections=chooseSections(candidates,upholstery,data.width,data.height,data.limit)
    self.postMessage({id:data.id,sections:sections.map(({score,points,values,width,height,signature})=>({score,points,values,width,height,signature}))},sections.map(section=>section.values.buffer))
  }catch(error){self.postMessage({id:data.id,error:error.message || 'Automatic sections could not be detected. You can outline a part manually.'})}
  finally{
    for(const value of Object.values(inputs || {}))value?.dispose?.()
    for(const value of Object.values(output || {}))value?.dispose?.()
    tensor?.dispose?.();busy=false
  }
}
