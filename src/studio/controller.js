import { applySurface, brushMask } from './compositor.js'
import { startEightWallCamera } from './eightwall.js'

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
  let seed, lastInference = 0, live = false, textureVersion = 0, cameraStarting = false
  let xrSession
  let xrAbort
  let pbrPreview,pbrMode=false,pbrVersion=0
  const leavePbr=()=>{pbrVersion++;pbrMode=false;pbrPreview?.dispose();pbrPreview=null;$('pbr-panel').hidden=true;$('stage').hidden=false;$('pbr').setAttribute('aria-pressed','false')}
  const status = message => { $('status').textContent = message }
  const stash = () => { history.push(new Float32Array(mask)); if(history.length>15) history.shift() }
  const draw = () => {
    if (!source || pbrMode) return
    const pixels = texture ? applySurface(source, texture, mask, {
      strength:Number($('strength').value)/100, compare:Number($('compare').value)/100, showMask:$('mask-toggle').checked, softness:Number($('softness').value)/100,
    }) : source.data
    ctx.putImageData(new ImageData(new Uint8ClampedArray(pixels), source.width, source.height),0,0)
    $('export').disabled = !mask.some(v=>v>.1)
    divider.hidden=$('comparison').hidden=$('export').disabled
    divider.style.left=`${$('compare').value}%`;divider.setAttribute('aria-valuenow',$('compare').value)
  }
  const resize = (width,height) => {
    const scale = Math.min(1, 1000/Math.max(width,height))
    canvas.width = base.width = tile.width = Math.round(width*scale)
    canvas.height = base.height = tile.height = Math.round(height*scale)
    mask = new Float32Array(canvas.width*canvas.height)
    history=[]
  }
  async function setTexture(notifyPbr=true) {
    const version=++textureVersion
    if(notifyPbr)pbrPreview?.setMaterial(material)
    $('selected').innerHTML = `<span class="studio-sample ${material.preserveTextureColor?'original':''}" style="--sample-color:${material.color}"><img src="${material.image}" alt="${material.name}"></span><div><b>${material.name}</b><span>${material.type}</span><small>${material.textureCredit || 'Illustrative material direction'}</small></div>`
    root.querySelectorAll('[data-studio-material]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.studioMaterial===material.id)))
    try {
      const image=new Image(); image.src=material.textureImage || material.image; await image.decode()
      if(disposed || version!==textureVersion)return
      const size=Number($('scale').value)
      const patternCanvas=document.createElement('canvas'); patternCanvas.width=patternCanvas.height=size
      const patternCtx=patternCanvas.getContext('2d'); patternCtx.drawImage(image,0,0,size,size)
      if (!material.preserveTextureColor) {
        patternCtx.globalCompositeOperation='color'; patternCtx.fillStyle=material.color;patternCtx.fillRect(0,0,size,size)
      }
      tileCtx.save();tileCtx.translate(tile.width/2,tile.height/2);tileCtx.rotate(Number($('rotation').value)*Math.PI/180)
      tileCtx.fillStyle=tileCtx.createPattern(patternCanvas,'repeat');const diagonal=Math.hypot(tile.width,tile.height);tileCtx.fillRect(-diagonal,-diagonal,diagonal*2,diagonal*2);tileCtx.restore()
      texture=tileCtx.getImageData(0,0,tile.width,tile.height);draw()
    } catch { texture=null;status('This texture could not load. Choose another material.');draw() }
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
    $('camera').setAttribute('aria-pressed','false');$('photo').setAttribute('aria-pressed','true')
    $('stop').hidden=$('capture').hidden=true
    $('engine').textContent='PRIVATE · ON YOUR DEVICE'
  }
  async function loadPhoto(url) {
    leavePbr()
    stopCamera();const token=epoch
    try {
      const image=new Image();image.src=url;await image.decode()
      if(disposed||token!==epoch)return
      if(image.width*image.height>50_000_000)throw new Error('Choose a photo smaller than 50 megapixels.')
      resize(image.width,image.height);baseCtx.drawImage(image,0,0,base.width,base.height)
      source=baseCtx.getImageData(0,0,base.width,base.height)
      $('empty').hidden=true;$('stage-label').hidden=false
      $('stage-label').textContent='PHOTO / TAP THE UPHOLSTERY'
      await setTexture();draw();status('Choose AI select and tap the fabric. Brush and Erase refine the result.')
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
    worker.onerror=()=>{for(const task of pending.values()){clearTimeout(task.timer);task.reject(new Error('AI selection is unavailable on this browser. Use Brush to select the upholstery.'))}pending.clear();worker?.terminate();worker=null}
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
        const timer=setTimeout(()=>{pending.delete(id);worker?.terminate();worker=null;reject(new Error('AI selection timed out. Try again or use Brush.'))},45000)
        pending.set(id,{resolve,reject,timer});getWorker().postMessage({id,bitmap,point},[bitmap])
      })
      if(disposed||token!==epoch)return
      if(!automatic)stash()
      let cx=0,cy=0,count=0
      for(let y=0;y<base.height;y++)for(let x=0;x<base.width;x++) {
        const v=data.values[Math.min(data.height-1,Math.floor(y/base.height*data.height))*data.width+Math.min(data.width-1,Math.floor(x/base.width*data.width))]
        const value=Math.max(0,Math.min(1,(v-.35)/.3))
        mask[y*base.width+x]=value
        if(value>.8){cx+=x;cy+=y;count++}
      }
      if(live&&count)seed={x:cx/count/base.width,y:cy/count/base.height}
      if(!automatic)status(count?'Selection ready. Refine with Brush or Erase, then try a fabric.':'No object found. Tap the centre of the upholstery or use Brush.')
      draw()
    }catch(error){if(token===epoch){status(error.message);if(automatic)seed=null}}
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
    stopCamera();cameraStarting=true;const token=epoch;xrAbort=new AbortController()
    status('Starting the self-hosted 8th Wall camera…')
    try{
      xrSession=await startEightWallCamera({signal:xrAbort.signal,onStatus:status,onFrame:frame=>{
        if(disposed||token!==epoch)return
        if(base.width!==frame.width||base.height!==frame.height){resize(frame.width,frame.height);setTexture()}
        source=frame;baseCtx.putImageData(frame,0,0);draw()
        if(seed&&!busy&&performance.now()-lastInference>450){lastInference=performance.now();segment(seed,true)}
      }})
      if(token!==epoch){xrSession.stop();return}
      live=true;cameraStarting=false;$('empty').hidden=true;$('stage-label').hidden=false
      $('stage-label').textContent='8TH WALL / LIVE SURFACE BETA';$('engine').textContent='8TH WALL + ON-DEVICE AI'
      $('stop').hidden=$('capture').hidden=false;$('camera').setAttribute('aria-pressed','true');$('photo').setAttribute('aria-pressed','false')
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
  root.addEventListener('click',e=>{
    if(e.target.closest('[data-studio-upload]'))$('upload').click()
    const swatch=e.target.closest('[data-studio-material]');if(swatch){material=materials.find(m=>m.id===swatch.dataset.studioMaterial);setTexture()}
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
  return dispose
}
