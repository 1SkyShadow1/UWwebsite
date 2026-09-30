// 8th Wall supplies camera frames; segmentation and recolouring remain local.
// This does not claim to reconstruct furniture geometry or provide world anchors.
export function unpackCameraPixels({ pixels, rows, cols, rowBytes }) {
  if (!pixels || !rows || !cols || rowBytes < cols*4 || pixels.length < rows*rowBytes) return null
  const packed=new Uint8ClampedArray(rows*cols*4)
  for(let y=0;y<rows;y++)packed.set(pixels.subarray(y*rowBytes,y*rowBytes+cols*4),y*cols*4)
  return {data:packed,width:cols,height:rows}
}

function resolveEightWallScriptUrl(customUrl) {
  const candidate = (customUrl || import.meta.env?.VITE_EIGHTH_WALL_SCRIPT_URL || '').trim()
  if (!candidate || /ngrok|58000/i.test(candidate)) {
    return '/vendor/8thwall/xr.js'
  }
  return candidate
}

function resolveSlamChunkSpec() {
  const slamUrl = (import.meta.env?.VITE_EIGHTH_WALL_SLAM_URL || '').trim()
  if (!slamUrl || /ngrok|58000/i.test(slamUrl)) {
    return 'slam'
  }
  return `slam: ${slamUrl}`
}

function hasNonZeroPixels(data) {
  if (!data || data.length < 4) return false
  const step = Math.max(4, Math.floor(data.length / 64) & ~3)
  for (let i = 0; i < data.length; i += step) {
    if (data[i] !== 0 || data[i + 1] !== 0 || data[i + 2] !== 0) return true
  }
  return false
}

let loading
export function loadEngine(customUrl){
  if(window.XR8){
    return (window.XR8.XrController || !window.XR8.loadChunk
      ? Promise.resolve(window.XR8)
      : window.XR8.loadChunk('slam').catch(()=>{}).then(()=>window.XR8))
  }
  if(loading)return loading
  loading=new Promise((resolve,reject)=>{
    const existing=document.querySelector('script[data-xr-engine]')
    const script=existing || document.createElement('script')
    let settled=false
    const finish=async(error)=>{
      if(settled)return
      settled=true
      clearTimeout(timer)
      window.removeEventListener('xrloaded',ready)
      window.removeEventListener('XRloaded',ready)
      if(error){reject(error);return}
      try{
        if(window.XR8 && !window.XR8.XrController && window.XR8.loadChunk){
          await window.XR8.loadChunk('slam').catch(()=>{})
        }
        resolve(window.XR8)
      }catch(chunkErr){
        resolve(window.XR8)
      }
    }
    const ready=()=>{if(window.XR8)finish()}
    const timer=setTimeout(()=>finish(new Error('8th Wall could not load. Try the standard camera.')),15000)
    window.addEventListener('xrloaded',ready)
    window.addEventListener('XRloaded',ready)
    if(!existing){
      script.src=resolveEightWallScriptUrl(customUrl)
      script.async=true
      script.crossOrigin='anonymous'
      script.dataset.xrEngine='true'
      script.dataset.preloadChunks=resolveSlamChunkSpec()
      script.onload=ready
      script.onerror=()=>finish(new Error('8th Wall engine unavailable.'))
      document.head.appendChild(script)
    }else if(window.XR8){
      ready()
    }
  }).catch(error=>{loading=null;throw error})
  return loading
}

export async function startEightWallCamera({ onFrame, onStatus, signal }) {
  const XR8=await loadEngine()
  if(signal?.aborted)throw new Error('Camera start cancelled')
  if(!XR8?.CameraPixelArray)throw new Error('This 8th Wall runtime cannot supply camera pixels.')

  const host=document.createElement('div')
  host.style.cssText='position:fixed;left:-10000px;top:0;width:640px;height:480px;overflow:hidden;pointer-events:none;opacity:0.01'
  const canvas=document.createElement('canvas')
  canvas.width=640;canvas.height=480
  canvas.style.cssText='width:640px;height:480px;display:block'
  host.appendChild(canvas)
  document.body.appendChild(host)

  const fallbackCanvas=document.createElement('canvas')
  const fallbackCtx=fallbackCanvas.getContext('2d',{willReadFrequently:true})
  let liveVideo=null

  const name='uw-furniture-surface'
  let stopped=false
  const cleanupModules=()=>{
    for(const mod of [name,'camerapixelarray','gltexturerenderer','reality']){
      try{XR8.removeCameraPipelineModule?.(mod)}catch{}
    }
  }
  const stop=()=>{
    if(stopped)return
    stopped=true
    try{XR8.stop?.()}catch{}
    cleanupModules()
    host.querySelectorAll('video').forEach(v=>{
      try{v.srcObject?.getTracks?.().forEach(t=>t.stop())}catch{}
      v.srcObject=null
    })
    host.remove()
    signal?.removeEventListener('abort',stop)
  }
  signal?.addEventListener('abort',stop,{once:true})

  const ensureVideoPlaying=()=>{
    queueMicrotask(()=>{
      const video=host.querySelector('video')
      if(!video||stopped)return
      liveVideo=video
      video.muted=true
      video.playsInline=true
      video.setAttribute('playsinline','true')
      video.style.cssText='position:fixed;left:-10000px;top:0;width:2px;height:2px;opacity:0.01;pointer-events:none;display:block'
      video.play?.().catch(()=>{})
    })
  }

  const readVideoFallbackFrame=()=>{
    const v=liveVideo||host.querySelector('video')
    if(!v||v.readyState<2||!v.videoWidth||!v.videoHeight)return null
    const maxDim=640
    const scale=Math.min(1,maxDim/Math.max(v.videoWidth,v.videoHeight))
    const w=Math.max(1,Math.round(v.videoWidth*scale))
    const h=Math.max(1,Math.round(v.videoHeight*scale))
    if(fallbackCanvas.width!==w||fallbackCanvas.height!==h){
      fallbackCanvas.width=w;fallbackCanvas.height=h
    }
    fallbackCtx.drawImage(v,0,0,w,h)
    return fallbackCtx.getImageData(0,0,w,h)
  }

  try {
    try{XR8.stop?.()}catch{}
    cleanupModules()

    const isMobile=Boolean(XR8.XrDevice?.isDeviceBrowserCompatible?.({allowedDevices:XR8.XrConfig?.device?.().MOBILE}))
    const hasCustomSlam=Boolean((import.meta.env?.VITE_EIGHTH_WALL_SLAM_URL||'').trim()&&!/ngrok|58000/i.test(import.meta.env.VITE_EIGHTH_WALL_SLAM_URL))
    XR8.XrController?.configure?.({disableWorldTracking:!isMobile||!hasCustomSlam,enableLighting:true})

    await new Promise((resolve,reject)=>{
      let ready=false
      const startTimer=setTimeout(()=>{
        if(!ready)reject(new Error('8th Wall camera timed out waiting for video stream.'))
      },15000)

      const finishReady=()=>{
        if(ready)return
        ready=true
        clearTimeout(startTimer)
        resolve()
      }
      const failStart=(err)=>{
        if(ready){
          onStatus?.(`8th Wall: ${err.message||'camera interrupted'}.`)
          stop()
          return
        }
        ready=true
        clearTimeout(startTimer)
        reject(err)
      }

      const modules=[
        XR8.GlTextureRenderer?.pipelineModule?.(),
        XR8.CameraPixelArray.pipelineModule({luminance:false,maxDimension:640}),
        {
          name,
          onStart:()=>{
            ensureVideoPlaying()
            finishReady()
          },
          onProcessCpu:({processGpuResult})=>{
            if(stopped)return
            const raw=processGpuResult?.camerapixelarray
            const frame=raw?unpackCameraPixels(raw):null
            if(frame&&hasNonZeroPixels(frame.data)){
              onFrame(new ImageData(frame.data,frame.width,frame.height))
              return
            }
            const fallback=readVideoFallbackFrame()
            if(fallback)onFrame(fallback)
          },
          onCameraStatusChange:({status,reason,video})=>{
            if(stopped)return
            if(video)liveVideo=video
            if(status==='requesting'){
              onStatus?.('8th Wall camera: requesting camera permission…')
            }else if(status==='hasStream'){
              onStatus?.('8th Wall camera: connecting live video stream…')
              ensureVideoPlaying()
            }else if(status==='hasVideo'){
              ensureVideoPlaying()
              finishReady()
            }else if(status==='hasDesktop3D'){
              failStart(new Error('Camera feed unavailable in Desktop 3D mode.'))
            }else if(status==='failed'){
              const msg=reason==='DENY_CAMERA'
                ? 'Camera permission was declined. Enable it in browser settings or upload a photograph.'
                : reason==='NO_CAMERA'
                ? 'No camera was found on this device. Upload a photograph instead.'
                : `8th Wall camera could not start (${reason||'check camera permissions'}).`
              failStart(new Error(msg))
            }
          },
          onException:error=>{
            failStart(new Error(error?.message||'8th Wall camera unavailable. Try standard camera.'))
          },
        },
      ].filter(Boolean)

      XR8.addCameraPipelineModules(modules)
      const cameraDirection=isMobile
        ? (XR8.XrConfig?.camera?.().BACK||'back')
        : (XR8.XrConfig?.camera?.().ANY||'any')
      XR8.run({
        canvas,
        allowedDevices:XR8.XrConfig?.device?.().ANY||'any',
        cameraConfig:{direction:cameraDirection},
      })
    })

    if(signal?.aborted){stop();throw new Error('Camera start cancelled')}
    return{stop}
  }catch(error){stop();throw error}
}
