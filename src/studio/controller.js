import { applySurface, brushMask } from './compositor.js'
import { startEightWallCamera } from './eightwall.js'

function parseHexColor(hex) {
  const clean = String(hex || '#8c5835').replace('#', '').trim()
  const full = clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean
  const num = parseInt(full, 16)
  if (Number.isNaN(num)) return [140, 88, 53]
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255]
}

export function buildTintedPatternCanvas(image, size, material) {
  const patternCanvas = document.createElement('canvas')
  patternCanvas.width = patternCanvas.height = size
  const patternCtx = patternCanvas.getContext('2d', { willReadFrequently: true })
  patternCtx.drawImage(image, 0, 0, size, size)
  if (material.preserveTextureColor) return patternCanvas

  const [tr, tg, tb] = parseHexColor(material.color)
  const imgData = patternCtx.getImageData(0, 0, size, size)
  const d = imgData.data
  let sumLum = 0
  const totalPixels = size * size
  for (let i = 0; i < d.length; i += 4) {
    sumLum += d[i] * 0.2126 + d[i + 1] * 0.7152 + d[i + 2] * 0.0722
  }
  const avgLum = Math.max(24, sumLum / Math.max(1, totalPixels))
  const isVelvetOrSatin = /velvet|velour|satin|silk|moire/i.test(`${material.texture || ''} ${material.name || ''}`)
  const isLeather = /leather|vinyl|suede/i.test(`${material.texture || ''} ${material.name || ''}`)
  const contrastGain = isVelvetOrSatin ? 1.25 : isLeather ? 1.12 : 1.18

  for (let i = 0; i < d.length; i += 4) {
    const lum = d[i] * 0.2126 + d[i + 1] * 0.7152 + d[i + 2] * 0.0722
    const norm = lum / avgLum
    const relief = Math.max(0.32, Math.min(1.58, 1 + (norm - 1) * contrastGain))
    const spec = norm > 1.06 ? (norm - 1.06) * (isVelvetOrSatin ? 36 : isLeather ? 28 : 18) : 0
    d[i] = Math.max(0, Math.min(255, Math.round(tr * relief + spec)))
    d[i + 1] = Math.max(0, Math.min(255, Math.round(tg * relief + spec)))
    d[i + 2] = Math.max(0, Math.min(255, Math.round(tb * relief + spec)))
  }
  patternCtx.putImageData(imgData, 0, 0)
  return patternCanvas
}

function fallbackColorSegment(source, mask, point) {
  const { width, height, data } = source
  if (!width || !height) return 0
  const sx = Math.min(width - 1, Math.max(0, Math.round(point.x * (width - 1))))
  const sy = Math.min(height - 1, Math.max(0, Math.round(point.y * (height - 1))))

  let sr = 0, sg = 0, sb = 0, sc = 0
  const sampleRadius = Math.max(3, Math.round(Math.min(width, height) * 0.018))
  for (let dy = -sampleRadius; dy <= sampleRadius; dy++) {
    for (let dx = -sampleRadius; dx <= sampleRadius; dx++) {
      const x = Math.min(width - 1, Math.max(0, sx + dx))
      const y = Math.min(height - 1, Math.max(0, sy + dy))
      const idx = (y * width + x) * 4
      sr += data[idx]
      sg += data[idx + 1]
      sb += data[idx + 2]
      sc++
    }
  }
  sr /= sc; sg /= sc; sb /= sc
  const sLum = sr * 0.2126 + sg * 0.7152 + sb * 0.0722
  const sCr = sr - sLum
  const sCb = sb - sLum

  const visited = new Uint8Array(width * height)
  const rawMask = new Float32Array(width * height)
  const queue = new Int32Array(width * height)
  let head = 0, tail = 0
  const startIdx = sy * width + sx
  queue[tail++] = startIdx
  visited[startIdx] = 1

  const maxDist = Math.hypot(width, height) * 0.46
  let count = 0

  while (head < tail) {
    const p = queue[head++]
    const px = p % width
    const py = (p - px) / width
    const i = p * 4
    const r = data[i], g = data[i + 1], b = data[i + 2]
    const lum = r * 0.2126 + g * 0.7152 + b * 0.0722
    const cr = r - lum
    const cb = b - lum
    const chromaDiff = Math.hypot(cr - sCr, cb - sCb)
    const lumDiff = Math.abs(lum - sLum)
    const spatialDist = Math.hypot(px - sx, py - sy)
    if (spatialDist > maxDist) continue

    const score = chromaDiff * 1.35 + lumDiff * 0.55 + (spatialDist / maxDist) * 24
    if (score <= 72) {
      const conf = Math.max(0.15, Math.min(1, 1 - Math.max(0, score - 36) / 38))
      rawMask[p] = conf
      count++
      if (px > 0 && !visited[p - 1]) { visited[p - 1] = 1; queue[tail++] = p - 1 }
      if (px + 1 < width && !visited[p + 1]) { visited[p + 1] = 1; queue[tail++] = p + 1 }
      if (py > 0 && !visited[p - width]) { visited[p - width] = 1; queue[tail++] = p - width }
      if (py + 1 < height && !visited[p + width]) { visited[p + width] = 1; queue[tail++] = p + width }
    }
  }

  // Smooth/feather mask edges with a 3x3 box filter
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const p = y * width + x
      const sum =
        rawMask[p - width - 1] + rawMask[p - width] + rawMask[p - width + 1] +
        rawMask[p - 1] + rawMask[p] * 2 + rawMask[p + 1] +
        rawMask[p + width - 1] + rawMask[p + width] + rawMask[p + width + 1]
      mask[p] = sum / 10
    }
  }
  return count
}

export function mountStudio(materials) {
  const root = document.querySelector('#ai-studio')
  if (!root) return () => {}
  const $ = id => root.querySelector(`#studio-${id}`)
  const canvas = $('canvas'), ctx = canvas.getContext('2d', { willReadFrequently:true })
  const divider=document.createElement('button')
  divider.className='studio-divider';divider.hidden=true;divider.type='button'
  divider.setAttribute('role','slider');divider.setAttribute('aria-label','Original and new material comparison')
  divider.setAttribute('aria-valuemin','0');divider.setAttribute('aria-valuemax','100')
  divider.innerHTML='<span>‹  ›</span>';$('stage').appendChild(divider)
  let comparing=false
  const compareAt=e=>{const r=canvas.getBoundingClientRect();$('compare').value=Math.round(Math.max(0,Math.min(100,(e.clientX-r.left)/r.width*100)));draw()}
  divider.onpointerdown=e=>{e.preventDefault();comparing=true;divider.setPointerCapture(e.pointerId);compareAt(e)}
  divider.onpointermove=e=>{if(comparing)compareAt(e)}
  divider.onpointerup=divider.onpointercancel=()=>{comparing=false}
  divider.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();$('compare').value=e.key==='Home'?0:e.key==='End'?100:Number($('compare').value)+(e.key==='ArrowLeft'?-5:5);draw()}
  const base = document.createElement('canvas'), baseCtx = base.getContext('2d', { willReadFrequently:true })
  const tile = document.createElement('canvas'), tileCtx = tile.getContext('2d', { willReadFrequently:true })
  const params = new URLSearchParams(location.search)
  let material = materials.find(m=>m.id===params.get('material')) || materials.find(m=>m.id==='velvet') || materials[0]
  let source, mask = new Float32Array(0), texture, tool = 'ai', history = [], painting = false, lastPoint
  let stream, video, frame, worker, pending = new Map(), job = 0, busy = false, disposed = false, epoch = 0
  let seed, lastInference = 0, live = false, textureVersion = 0, cameraStarting = false, cachedPatternCanvas = null
  let xrSession
  let xrAbort
  let pbrPreview,pbrMode=false,pbrVersion=0
  const leavePbr=()=>{pbrVersion++;pbrMode=false;pbrPreview?.dispose();pbrPreview=null;$('pbr-panel').hidden=true;$('stage').hidden=false;$('pbr').setAttribute('aria-pressed','false')}
  const status = message => { $('status').textContent = message }
  const stash = () => { history.push(new Float32Array(mask)); if(history.length>15) history.shift() }
  const draw = () => {
    if (!source || pbrMode) return
    const pixels = texture && texture.width === source.width && texture.height === source.height ? applySurface(source, texture, mask, {
      strength:Number($('strength').value)/100, compare:Number($('compare').value)/100, showMask:$('mask-toggle').checked, softness:Number($('softness').value)/100,
    }) : source.data
    ctx.putImageData(new ImageData(new Uint8ClampedArray(pixels), source.width, source.height),0,0)
    $('export').disabled = !mask.some(v=>v>.1)
    divider.hidden=$('comparison').hidden=$('export').disabled
    divider.style.left=`${$('compare').value}%`;divider.setAttribute('aria-valuenow',$('compare').value)
  }
  const rebuildTileFromPattern = () => {
    if (!cachedPatternCanvas || !tile.width || !tile.height) return
    tileCtx.clearRect(0,0,tile.width,tile.height)
    tileCtx.save();tileCtx.translate(tile.width/2,tile.height/2);tileCtx.rotate(Number($('rotation').value)*Math.PI/180)
    tileCtx.fillStyle=tileCtx.createPattern(cachedPatternCanvas,'repeat');const diagonal=Math.hypot(tile.width,tile.height);tileCtx.fillRect(-diagonal,-diagonal,diagonal*2,diagonal*2);tileCtx.restore()
    texture=tileCtx.getImageData(0,0,tile.width,tile.height)
  }
  const resize = (width,height) => {
    const scale = Math.min(1, 1000/Math.max(width,height))
    canvas.width = base.width = tile.width = Math.round(width*scale)
    canvas.height = base.height = tile.height = Math.round(height*scale)
    mask = new Float32Array(canvas.width*canvas.height)
    history=[]
    rebuildTileFromPattern()
  }
  async function setTexture(notifyPbr=true) {
    const version=++textureVersion
    if(notifyPbr)pbrPreview?.setMaterial(material)
    $('selected').innerHTML = `<span class="studio-sample ${material.preserveTextureColor?'original':''}" style="--sample-color:${material.color}"><img src="${material.image}" alt="${material.name}"></span><div><b>${material.name}</b><span>${material.type}</span><small>${material.textureCredit || 'Illustrative material direction'}</small></div>`
    root.querySelectorAll('[data-studio-material]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.studioMaterial===material.id)))
    try {
      const image=new Image()
      image.crossOrigin='anonymous'
      image.src=material.textureImage || material.image
      await image.decode()
      if(disposed || version!==textureVersion)return
      const size=Number($('scale').value)
      cachedPatternCanvas=buildTintedPatternCanvas(image,size,material)
      rebuildTileFromPattern();draw()
    } catch { cachedPatternCanvas=null;texture=null;status('This texture could not load. Choose another material.');draw() }
  }
  const renderSwatches=()=>{
    const q=$('search').value.trim().toLowerCase(), group=$('family').value
    const filtered=materials.filter(m=>(group==='all'||m.group===group)&&`${m.name} ${m.type} ${m.shade}`.toLowerCase().includes(q))
    $('swatches').innerHTML=filtered.map(m=>`<button data-studio-material="${m.id}" aria-pressed="${m.id===material.id}" title="${m.name}"><span class="studio-sample ${m.preserveTextureColor?'original':''}" style="--sample-color:${m.color}"><img src="${m.image}" alt="" loading="lazy"></span><span>${m.name}</span></button>`).join('') || '<p>No materials match. Try a different search.</p>'
  }
  function stopCamera() {
    epoch++;live=false;seed=null;cameraStarting=false;cancelAnimationFrame(frame)
    stream?.getTracks().forEach(t=>t.stop());stream=null
    if(video){video.pause();video.srcObject=null;video=null}
    xrSession?.stop();xrSession=null
    xrAbort?.abort();xrAbort=null
    $('camera').setAttribute('aria-pressed','false');$('xr').setAttribute('aria-pressed','false');$('photo').setAttribute('aria-pressed','true')
    $('stop').hidden=$('capture').hidden=true
    $('engine').textContent='PRIVATE · ON YOUR DEVICE'
  }
  async function loadPhoto(url, autoSelect = true) {
    leavePbr()
    stopCamera();const token=epoch
    try {
      const image=new Image();image.crossOrigin='anonymous';image.src=url;await image.decode()
      if(disposed||token!==epoch)return
      if(image.width*image.height>50_000_000)throw new Error('Choose a photo smaller than 50 megapixels.')
      resize(image.width,image.height);baseCtx.drawImage(image,0,0,base.width,base.height)
      source=baseCtx.getImageData(0,0,base.width,base.height)
      $('empty').hidden=true;$('stage-label').hidden=false
      $('stage-label').textContent='PHOTO / TAP THE UPHOLSTERY'
      await setTexture();draw()
      if (autoSelect && !disposed && token === epoch) {
        const defaultPoint = { x: 0.5, y: 0.54 }
        seed = defaultPoint
        await segment(defaultPoint, false)
      } else {
        status('Choose AI select and tap the fabric. Brush and Erase refine the result.')
      }
    }catch(error){status(error.message||'Could not open this image. Try a JPG, PNG or WebP.')}
  }
  async function upload(file) {
    if(!file)return
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>15*1024*1024){status('Please choose a JPG, PNG or WebP smaller than 15 MB.');return}
    const url=URL.createObjectURL(file)
    try{await loadPhoto(url)}finally{URL.revokeObjectURL(url);$('upload').value=''}
  }
  function getWorker() {
    if(worker)return worker
    worker=new Worker('/vendor/mediapipe/segment.worker.js')
    worker.onmessage=({data})=>{const task=pending.get(data.id);if(!task)return;pending.delete(data.id);clearTimeout(task.timer);data.error?task.reject(new Error(data.error)):task.resolve(data)}
    worker.onerror=()=>{for(const task of pending.values()){clearTimeout(task.timer);task.reject(new Error('Worker segmentation error'))}pending.clear();worker?.terminate();worker=null}
    return worker
  }
  async function segment(point,automatic=false) {
    if(busy||!source)return
    const token=epoch;busy=true
    if(!automatic){$('busy').hidden=false;status('Loading on-device AI and finding the selected object…')}
    try {
      const bitmap=await createImageBitmap(base)
      const data=await new Promise((resolve,reject)=>{
        const id=++job
        const timer=setTimeout(()=>{pending.delete(id);worker?.terminate();worker=null;reject(new Error('AI selection timed out.'))},45000)
        pending.set(id,{resolve,reject,timer});getWorker().postMessage({id,bitmap,point},[bitmap])
      })
      if(disposed||token!==epoch)return
      if(!automatic)stash()
      let cx=0,cy=0,count=0
      const rawMask=new Float32Array(base.width*base.height)
      for(let y=0;y<base.height;y++)for(let x=0;x<base.width;x++) {
        const v=data.values[Math.min(data.height-1,Math.floor(y/base.height*data.height))*data.width+Math.min(data.width-1,Math.floor(x/base.width*data.width))]
        const value=Math.max(0,Math.min(1,(v-.35)/.3))
        rawMask[y*base.width+x]=value
        if(value>.8){cx+=x;cy+=y;count++}
      }
      if (count > 0) {
        // Feather boundary slightly for clean, natural upholstery edges
        const w = base.width, h = base.height
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const p = y * w + x
            if (x === 0 || y === 0 || x === w - 1 || y === h - 1) {
              mask[p] = rawMask[p]
            } else {
              mask[p] = (
                rawMask[p - w] + rawMask[p - 1] + rawMask[p] * 4 + rawMask[p + 1] + rawMask[p + w]
              ) / 8
            }
          }
        }
      } else {
        count = fallbackColorSegment(source, mask, point)
      }
      if(live&&count)seed={x:cx/count/base.width,y:cy/count/base.height}
      if(!automatic)status(count?`${material.name} applied. Tap another area or refine with Brush and Erase.`:'No object found. Tap the centre of the upholstery or use Brush.')
      draw()
    }catch(error){
      if(token===epoch){
        if(!automatic)stash()
        const count = fallbackColorSegment(source, mask, point)
        draw()
        if (count > 0) {
          if (!automatic) status(`${material.name} applied. Refine edges with Brush or Erase.`)
        } else {
          status('Tap the centre of the upholstery or use Brush to paint a selection.')
          if (automatic) seed = null
        }
      }
    }
    finally{busy=false;$('busy').hidden=true}
  }
  function pointFromEvent(e){const r=canvas.getBoundingClientRect();return{x:Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),y:Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))}}
  function paint(point){
    const x=point.x*base.width,y=point.y*base.height,radius=Number($('brush').value)
    if(lastPoint){const dx=x-lastPoint.x,dy=y-lastPoint.y,steps=Math.max(1,Math.ceil(Math.hypot(dx,dy)/(radius*.35)));for(let i=1;i<=steps;i++)brushMask(mask,base.width,base.height,lastPoint.x+dx*i/steps,lastPoint.y+dy*i/steps,radius,tool==='erase')}
    else brushMask(mask,base.width,base.height,x,y,radius,tool==='erase')
    lastPoint={x,y};draw()
  }
  canvas.addEventListener('pointerdown',e=>{
    if(!source||busy)return
    e.preventDefault();const point=pointFromEvent(e)
    if(tool==='ai'){seed=point;segment(point);return}
    if(live){status('Freeze the camera frame before brushing a precise selection.');return}
    stash();painting=true;lastPoint=null;canvas.setPointerCapture(e.pointerId);paint(point)
  })
  canvas.addEventListener('pointermove',e=>{if(painting)paint(pointFromEvent(e))})
  const endPaint=()=>{painting=false;lastPoint=null}
  canvas.addEventListener('pointerup',endPaint);canvas.addEventListener('pointercancel',endPaint)
  async function startCamera(){
    leavePbr()
    if(cameraStarting||live)return
    stopCamera();cameraStarting=true;const token=epoch
    try {
      if(!navigator.mediaDevices?.getUserMedia)throw new Error('Camera requires HTTPS or localhost and a supported browser.')
      const acquired=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment',width:{ideal:960},height:{ideal:720}},audio:false})
      if(disposed||token!==epoch){acquired.getTracks().forEach(t=>t.stop());return}
      stream=acquired;video=document.createElement('video');video.muted=true;video.playsInline=true;video.srcObject=stream;await video.play()
      if(disposed||token!==epoch)return
      resize(video.videoWidth,video.videoHeight);live=true;cameraStarting=false
      $('empty').hidden=true;$('stage-label').hidden=false;$('stage-label').textContent='LIVE SURFACE / EXPERIMENTAL'
      $('stop').hidden=$('capture').hidden=false;$('camera').setAttribute('aria-pressed','true');$('photo').setAttribute('aria-pressed','false')
      await setTexture();status('Tap the upholstery. Keep the furniture in view and move slowly. Freeze to refine.')
      let lastDraw=0
      const tick=time=>{
        if(!live||!video||disposed)return
        if(time-lastDraw<66){frame=requestAnimationFrame(tick);return}lastDraw=time
        baseCtx.drawImage(video,0,0,base.width,base.height);source=baseCtx.getImageData(0,0,base.width,base.height);draw()
        if(seed&&!busy&&time-lastInference>450){lastInference=time;segment(seed,true)}
        frame=requestAnimationFrame(tick)
      };frame=requestAnimationFrame(tick)
    }catch(error){stopCamera();status(error.name==='NotAllowedError'?'Camera permission was declined. Enable it in browser settings or upload a photograph.':error.message)}
  }
  const freeze=()=>{stopCamera();$('stage-label').textContent='FROZEN FRAME / REFINE YOUR SELECTION';status('Frame frozen. Refine the upholstery with Brush and Erase.');draw()}
  $('xr').onclick=async()=>{
    leavePbr()
    if(cameraStarting)return
    if(xrSession){freeze();return}
    stopCamera();cameraStarting=true;const token=epoch;xrAbort=new AbortController()
    status('Starting the self-hosted 8th Wall camera…')
    try{
      await setTexture(false)
      xrSession=await startEightWallCamera({signal:xrAbort.signal,onStatus:status,onFrame:frame=>{
        if(disposed||token!==epoch)return
        if(base.width!==frame.width||base.height!==frame.height){resize(frame.width,frame.height);if(!cachedPatternCanvas)setTexture(false)}
        source=frame;baseCtx.putImageData(frame,0,0);draw()
        if(seed&&!busy&&performance.now()-lastInference>450){lastInference=performance.now();segment(seed,true)}
      }})
      if(token!==epoch){xrSession.stop();return}
      live=true;cameraStarting=false;$('empty').hidden=true;$('stage-label').hidden=false
      $('stage-label').textContent='8TH WALL / LIVE SURFACE BETA';$('engine').textContent='8TH WALL + ON-DEVICE AI'
      $('stop').hidden=$('capture').hidden=false;$('camera').setAttribute('aria-pressed','true');$('xr').setAttribute('aria-pressed','true');$('photo').setAttribute('aria-pressed','false')
      status('8th Wall camera ready. Tap the upholstery. Hold still for the cleanest preview.')
    }catch(error){stopCamera();status(error.message)}
  }
  $('pbr').onclick=async()=>{
    if(pbrMode){leavePbr();draw();return}
    stopCamera();pbrMode=true;const token=++pbrVersion;$('stage').hidden=true;$('pbr-panel').hidden=false;$('comparison').hidden=true;$('export').disabled=true;$('pbr').setAttribute('aria-pressed','true')
    try{const {createPbrPreview}=await import('./pbr-preview.js');if(disposed||token!==pbrVersion)return;pbrPreview=createPbrPreview($('pbr-host'),message=>$('pbr-status').textContent=message);await pbrPreview.setMaterial(material);pbrPreview.setScale(Number($('scale').value),Number($('rotation').value))}
    catch{leavePbr();status('3D rendering is unavailable on this device. You can still use the photo editor.')}
  }
  $('camera').onclick=startCamera;$('photo').onclick=()=>{if(pbrMode){leavePbr();draw();return}if(live)freeze();else $('upload').click()}
  $('stop').onclick=()=>{freeze();status('Camera stopped. The last frame is available for editing.')};$('capture').onclick=freeze
  $('demo').onclick=()=>loadPhoto('/assets/products/alessio-three.webp')
  $('upload').onchange=e=>upload(e.target.files[0])
  $('stage').ondragover=e=>{e.preventDefault();$('stage').classList.add('drag-over')}
  $('stage').ondragleave=()=>$('stage').classList.remove('drag-over')
  $('stage').ondrop=e=>{e.preventDefault();$('stage').classList.remove('drag-over');upload(e.dataTransfer.files[0])}
  root.addEventListener('click',async e=>{
    if(e.target.closest('[data-studio-upload]')){$('upload').click();return}
    const swatch=e.target.closest('[data-studio-material]')
    if(swatch){
      const nextMat=materials.find(m=>m.id===swatch.dataset.studioMaterial)
      if(!nextMat)return
      material=nextMat
      if(!source&&!pbrMode&&!live&&!cameraStarting){
        await loadPhoto('/assets/products/alessio-three.webp',true)
        return
      }
      await setTexture()
      if(source&&!pbrMode&&!live&&!busy&&!mask.some(v=>v>.05)){
        const pt=seed||{x:0.5,y:0.54}
        seed=pt
        await segment(pt,false)
      }else if(source&&!pbrMode){
        status(`${material.name} · ${material.type} applied. Drag the divider to compare before and after.`)
      }
      return
    }
    const button=e.target.closest('[data-studio-tool]');if(button){tool=button.dataset.studioTool;root.querySelectorAll('[data-studio-tool]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));status(tool==='ai'?'Tap the centre of the upholstered area.':`Drag to ${tool==='erase'?'remove':'add'} selected areas.`)}
  })
  $('search').oninput=renderSwatches;$('family').onchange=renderSwatches
  const updateScale=()=>{pbrPreview?.setScale(Number($('scale').value),Number($('rotation').value));setTexture(false)}
  $('scale').oninput=updateScale;$('rotation').oninput=updateScale;$('softness').oninput=()=>{pbrPreview?.setSoftness(Number($('softness').value)/100);draw()};$('strength').oninput=draw;$('compare').oninput=draw;$('mask-toggle').onchange=draw
  $('undo').onclick=()=>{if(!live&&!busy&&history.length){mask=history.pop();draw()}}
  $('clear').onclick=()=>{if(live)freeze();else epoch++;stash();mask.fill(0);seed=null;draw();status('Selection cleared. Tap or brush to start again.')}
  $('export').onclick=()=>{
    if(!source||!mask.some(v=>v>.1))return
    const output=document.createElement('canvas');output.width=canvas.width;output.height=canvas.height+46
    const c=output.getContext('2d');const pixels=texture?applySurface(source,texture,mask,{strength:Number($('strength').value)/100,compare:Number($('compare').value)/100,softness:Number($('softness').value)/100}):source.data;c.putImageData(new ImageData(pixels,source.width,source.height),0,0);c.fillStyle='#171918';c.fillRect(0,canvas.height,output.width,46);c.fillStyle='#e5c38f';c.font='14px sans-serif';c.fillText(`UW / ${material.name} · Illustrative material preview`,16,canvas.height+28)
    output.toBlob(blob=>{if(!blob)return;const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`uw-${material.id}-preview.png`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)},'image/png')
  }
  const onVisibility=()=>{if(document.hidden&&live)freeze()};document.addEventListener('visibilitychange',onVisibility)
  const dispose=()=>{disposed=true;leavePbr();stopCamera();worker?.terminate();for(const task of pending.values()){clearTimeout(task.timer);task.reject(new Error('Studio closed'))}pending.clear();document.removeEventListener('visibilitychange',onVisibility);window.removeEventListener('pagehide',dispose)}
  window.addEventListener('pagehide',dispose,{once:true})
  renderSwatches();setTexture()
  if(params.get('material'))loadPhoto('/assets/products/alessio-three.webp',true)
  return dispose
}
