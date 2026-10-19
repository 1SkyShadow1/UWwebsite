function pause(ms,signal){
  return new Promise((resolve,reject)=>{
    if(signal?.aborted)return reject(signal.reason)
    const stop=()=>{clearTimeout(timer);reject(signal.reason)}
    const timer=setTimeout(()=>{signal?.removeEventListener('abort',stop);resolve()},ms)
    signal?.addEventListener('abort',stop,{once:true})
  })
}

export async function generateUpholstery(request,body,{signal,key,onStatus=()=>{},pollMs=1600}={}){
  let id
  const cancel=()=>{if(id)void request(`/api/studio/generations/${id}`,{method:'DELETE'}).catch(()=>{})}
  signal?.addEventListener('abort',cancel,{once:true})
  try{
    let job=await request('/api/studio/generations',{method:'POST',body,signal,timeoutMs:285000,headers:{'Idempotency-Key':key}})
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

export function generationInputs(photo,mask,maskWidth,maskHeight){
  const width=photo.naturalWidth || photo.width,height=photo.naturalHeight || photo.height,scale=Math.min(1,2048/Math.max(width,height))
  const source=document.createElement('canvas');source.width=Math.max(1,Math.round(width*scale));source.height=Math.max(1,Math.round(height*scale))
  source.getContext('2d').drawImage(photo,0,0,source.width,source.height)
  const small=selectionMaskCanvas(mask,maskWidth,maskHeight),maskCanvas=document.createElement('canvas');maskCanvas.width=source.width;maskCanvas.height=source.height
  maskCanvas.getContext('2d').drawImage(small,0,0,source.width,source.height)
  const maskData=maskCanvas.toDataURL('image/png')
  for(const quality of [.94,.86,.76]){
    const imageData=source.toDataURL('image/jpeg',quality)
    if(imageData.length+maskData.length<3_900_000)return {imageData,maskData}
  }
  throw new Error('This photograph is too detailed for the hosted upload limit. Use a smaller or more tightly cropped photograph.')
}

// The server has already preserved the room and fitted the generated upholstery.
// Export that finished image directly; no material shader or second mask pass.
export function drawGeneratedResult(context,result){
  context.drawImage(result,0,0,context.canvas.width,context.canvas.height)
}
