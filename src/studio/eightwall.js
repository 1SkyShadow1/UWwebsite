// 8th Wall supplies camera frames; segmentation and recolouring remain local.
// This does not claim to reconstruct furniture geometry or provide world anchors.
export function unpackCameraPixels({ pixels, rows, cols, rowBytes }) {
  if (!pixels || !rows || !cols || rowBytes < cols*4 || pixels.length < rows*rowBytes) return null
  const packed=new Uint8ClampedArray(rows*cols*4)
  for(let y=0;y<rows;y++)packed.set(pixels.subarray(y*rowBytes,y*rowBytes+cols*4),y*cols*4)
  return {data:packed,width:cols,height:rows}
}

let loading
function loadEngine(){
  if(window.XR8)return Promise.resolve(window.XR8)
  if(loading)return loading
  loading=new Promise((resolve,reject)=>{
    const script=document.createElement('script')
    const finish=(error)=>{clearTimeout(timer);window.removeEventListener('xrloaded',ready);error?reject(error):resolve(window.XR8)}
    const ready=()=>window.XR8&&finish()
    const timer=setTimeout(()=>finish(new Error('8th Wall could not load. Try the standard camera.')),15000)
    script.src='/vendor/8thwall/xr.js';script.async=true;script.crossOrigin='anonymous'
    script.onload=ready;script.onerror=()=>finish(new Error('8th Wall engine unavailable.'))
    window.addEventListener('xrloaded',ready);document.head.appendChild(script)
  }).catch(error=>{loading=null;throw error})
  return loading
}

export async function startEightWallCamera({ onFrame, onStatus, signal }) {
  const XR8=await loadEngine()
  if(signal.aborted)throw new Error('Camera start cancelled')
  if(!XR8.CameraPixelArray)throw new Error('This 8th Wall runtime cannot supply camera pixels.')
  const canvas=document.createElement('canvas');canvas.width=640;canvas.height=480
  canvas.style.cssText='position:fixed;left:-10000px;top:0;width:640px;height:480px;pointer-events:none'
  document.body.appendChild(canvas)
  const name='uw-furniture-surface'
  let stopped=false
  const stop=()=>{if(stopped)return;stopped=true;XR8.stop();XR8.removeCameraPipelineModule(name);XR8.removeCameraPipelineModule('camerapixelarray');canvas.remove();signal.removeEventListener('abort',stop)}
  signal.addEventListener('abort',stop,{once:true})
  try {
    XR8.addCameraPipelineModules([
      XR8.CameraPixelArray.pipelineModule({luminance:false,maxDimension:640}),
      {name,onProcessCpu:({processGpuResult})=>{
        const raw=processGpuResult?.camerapixelarray
        if(!raw||stopped)return
        const frame=unpackCameraPixels(raw)
        if(frame)onFrame(new ImageData(frame.data,frame.width,frame.height))
      },onCameraStatusChange:({status})=>onStatus(`8th Wall camera: ${status}`),onException:error=>{onStatus(`8th Wall: ${error?.message || 'camera unavailable'}. Try standard camera.`);stop()}},
    ])
    await XR8.run({canvas,allowedDevices:XR8.XrConfig.device().ANY})
    if(signal.aborted){stop();throw new Error('Camera start cancelled')}
    return{stop}
  }catch(error){stop();throw error}
}
