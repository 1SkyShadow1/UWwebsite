import { REGION_COLORS } from './part-regions.js'

function pause(ms,signal){
  return new Promise((resolve,reject)=>{
    if(signal?.aborted)return reject(signal.reason)
    const stop=()=>{clearTimeout(timer);reject(signal.reason)}
    const timer=setTimeout(()=>{signal?.removeEventListener('abort',stop);resolve()},ms)
    signal?.addEventListener('abort',stop,{once:true})
  })
}

export async function generateUpholstery(request,body,{signal,key,onStatus=()=>{},pollMs=650,endpoint='/api/studio/generations',timeoutMs=285000}={}){
  let id
  const cancel=()=>{if(id)void request(`/api/studio/generations/${id}`,{method:'DELETE'}).catch(()=>{})}
  signal?.addEventListener('abort',cancel,{once:true})
  try{
    let job=await request(endpoint,{method:'POST',body,signal,timeoutMs,headers:{'Idempotency-Key':key,Accept:'application/x-ndjson'},onProgress:progress=>{id=progress.id;if(progress.stage)onStatus(progress.stage)}})
    id=job.id
    if(signal?.aborted){cancel();throw signal.reason}
    const start=Date.now()
    for(;;){
      onStatus(job.stage || 'AI is fitting the new fabric…')
      if(job.status==='complete')return job
      if(['failed','cancelled','expired'].includes(job.status)){const error=new Error(job.error || 'The AI edit could not finish. Try again.');error.terminal=true;throw error}
      if(Date.now()-start>300000){cancel();throw new Error('The AI edit is taking too long. Your original is still here; try again later.')}
      await pause(pollMs,signal)
      job=await request(`/api/studio/generations/${id}`,{signal,timeoutMs:60000})
    }
  }finally{signal?.removeEventListener('abort',cancel)}
}

export function selectionMaskCanvas(mask,width,height){
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height
  const context=canvas.getContext('2d'),pixels=context.createImageData(width,height)
  for(let p=0;p<mask.length;p++){
    const i=p*4;pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=255
    pixels.data[i+3]=Math.round((1-Math.max(0,Math.min(1,mask[p])))*255)
  }
  context.putImageData(pixels,0,0)
  return canvas
}

export function generationInputs(photo,mask,maskWidth,maskHeight,{regionLabels,generationMode}={}){
  const width=photo.naturalWidth || photo.width,height=photo.naturalHeight || photo.height,maximumEdge=generationMode==='quick'?1280:2048,scale=Math.min(1,maximumEdge/Math.max(width,height))
  const source=document.createElement('canvas');source.width=Math.max(1,Math.round(width*scale));source.height=Math.max(1,Math.round(height*scale))
  source.getContext('2d').drawImage(photo,0,0,source.width,source.height)
  const small=selectionMaskCanvas(mask,maskWidth,maskHeight),maskCanvas=document.createElement('canvas');maskCanvas.width=source.width;maskCanvas.height=source.height
  maskCanvas.getContext('2d').drawImage(small,0,0,source.width,source.height)
  const maskData=maskCanvas.toDataURL('image/png')
  let regionData
  if(regionLabels){
    if(regionLabels.length!==maskWidth*maskHeight)throw new Error('The part selection no longer matches this photograph.')
    const region=document.createElement('canvas');region.width=maskWidth;region.height=maskHeight
    const ctx=region.getContext('2d'),pixels=ctx.createImageData(maskWidth,maskHeight)
    for(let p=0;p<regionLabels.length;p++){
      const color=REGION_COLORS[regionLabels[p]]
      if(!color)throw new Error('An outlined part could not be encoded.')
      const i=p*4;pixels.data[i]=color[0];pixels.data[i+1]=color[1];pixels.data[i+2]=color[2];pixels.data[i+3]=255
    }
    ctx.putImageData(pixels,0,0)
    const enlarged=document.createElement('canvas');enlarged.width=source.width;enlarged.height=source.height
    const output=enlarged.getContext('2d');output.imageSmoothingEnabled=false;output.drawImage(region,0,0,enlarged.width,enlarged.height)
    regionData=enlarged.toDataURL('image/png')
  }
  for(const quality of [.94,.86,.76]){
    const imageData=source.toDataURL('image/jpeg',quality)
    if(imageData.length+maskData.length+(regionData?.length || 0)<3_850_000)return {imageData,maskData,...(regionData?{regionData}:{})}
  }
  throw new Error('This photograph is too detailed for the hosted upload limit. Use a smaller or more tightly cropped photograph.')
}

// The server has already preserved the room and fitted the generated upholstery.
// Export that finished image directly; no material shader or second mask pass.
export function drawGeneratedResult(context,result){
  context.drawImage(result,0,0,context.canvas.width,context.canvas.height)
}
