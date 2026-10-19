import { brushMask } from './compositor.js'
import { analyseSurface, trackSurface, translateMask, protectThinSupports, polishSelectionMask } from './surface-analysis.js'
import { createSurfaceRenderer } from './surface-renderer.js'
import { renderSurfaceCPU } from './cpu-renderer.js'
import { createInferenceClient } from './inference.js'
import { acquireCamera } from './camera.js'
import { resampleSelection } from './selection.js'
import { materialResponse, studioForms, exportSize, encodedPngSize } from './material-response.js'
import { loadMaterialImages } from './texture.js'
import { generateUpholstery, generationInputs, drawGeneratedResult } from './generative.js'
import { photoPresentation } from './photo-presentation.js'
import { normaliseSearch } from '../data/discovery.js'
import { escapeHtml } from '../lib/html.js'
import { request } from '../lib/api.js'

export { buildTintedPatternCanvas } from './texture.js'

async function captureSurfaceOnMain(renderer,canvas,source,size){
  renderer.setSource(source);renderer.render({compare:0,showMask:false,width:size.width,height:size.height})
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'))
  if(!blob)throw new Error('The device could not encode this resolution. Choose 4K and try again.')
  return {blob,...size}
}

export function mountStudio(materials,{isSaved=()=>false}={}){
  const root=document.querySelector('#ai-studio')
  if(!root)return()=>{}
  const $=id=>root.querySelector(`#studio-${id}`),lifecycle=new AbortController(),signal=lifecycle.signal
  const listen=(target,event,handler)=>target?.addEventListener(event,handler,{signal})
  const base=document.createElement('canvas'),context=base.getContext('2d',{willReadFrequently:true})
  let canvas=$('canvas'),renderer,fallbackContext,source,original,mask=new Float32Array(0),depth,analysis,images,colorPixels
  let material=materials.find(item=>item.id===new URLSearchParams(location.search).get('material')) || materials.find(item=>item.id==='velvet') || materials[0]
  let mode='photo',formId='tailored-sofa',lighting='daylight',tool='ai',brushSize=28,history=[],redo=[],painting=false,lastPoint,seed={x:.5,y:.58}
  let epoch=0,materialVersion=0,disposed=false,selecting=false,depthBusy=false,depthFailure=false,loading=false,exporting=false,comparing=false,pbr,pbrPromise
  let analysisRunning=false,analysisQueued=false,analysisRevision=0,analysisBusy=false,analysisWorkerFailed=false
  const lightingWaiters=new Set()
  let generationConnected=false,generationStarting=false,generationPending=false,generationVersion=0,generationAbort,generationAttempt,generated,showGenerated=true,generationError=''
  const generationCache=new Map()
  const resultKey=()=>`${epoch}:${analysisRevision}:${material.id}:${$('ai-quality').value}`
  let stream,video,animation,lastFrame=0,lastTrack=0,lastSelection=0,lastDepth=0,previousFrame,cameraStarting=false,studies=[],saveAttempt,exportUrl
  const status=message=>{if(!disposed)$('status').textContent=message}
  const showBusy=(value,message)=>{$('busy').hidden=!value;if(message)$('busy-label').textContent=message}
  const segmentation=createInferenceClient(()=>new Worker('/vendor/mediapipe/segment.worker.js'),{timeout:45000})
  const exportEngine=createInferenceClient(()=>new Worker(new URL('./export.worker.js',import.meta.url),{type:'module'}),{timeout:120000})
  const analysisEngine=createInferenceClient(()=>new Worker(new URL('./analysis.worker.js',import.meta.url),{type:'module'}),{timeout:30000})
  const depthEngine=createInferenceClient(()=>new Worker(new URL('./depth.worker.js',import.meta.url),{type:'module'}),{timeout:120000,onProgress:value=>{if(depthBusy)$('depth-state').textContent=`◌ AI depth ${value}%`}})
  const compatibility=()=>{
    renderer?.dispose();renderer=null
    const next=canvas.cloneNode(false);canvas.replaceWith(next);canvas=next;fallbackContext=canvas.getContext('2d',{willReadFrequently:true})
    $('engine').textContent='AI + COMPATIBILITY PREVIEW'
    canvas.dataset.renderer='compatibility';status('Using the compatibility renderer on this device. AI selection and depth remain available.')
  }
  try{renderer=createSurfaceRenderer(canvas,{onContextLost:()=>{if(!disposed){compatibility();draw()}}});canvas.dataset.renderer='depth-pbr-webgl2'}catch{compatibility()}

  function updateControls(){
    const selected=Boolean(analysis?.selected),editing=mode!=='3d'
    const locked=exporting||generationStarting||generationPending
    const presentation=photoPresentation({mode,hasResult:Boolean(generated),showResult:showGenerated,showMask:$('mask-toggle').checked})
    root.dataset.photoState=generationPending?'generating':generated?'generated':source?'original':'empty'
    $('generation').hidden=!editing
    $('generate').disabled=exporting||loading||generationStarting||generationPending||!generationConnected||!source||!selected||(mode==='photo'&&(analysisBusy||selecting))
    $('generate').textContent=generationPending?'AI is reupholstering…':generated?'Generate another version ↻':`Generate ${material.name} ✦`
    $('generation-brief').textContent=`Reupholster your piece in ${material.name}. AI replaces the fabric using your original photograph, preserving the furniture’s shape, panel seams and room.`
    $('ai-quality').disabled=locked
    $('cancel-generation').hidden=!generationPending
    $('toggle-result').hidden=!generated
    $('toggle-result').disabled=exporting||generationStarting||generationPending
    $('toggle-result').textContent=showGenerated?'View original':'Compare AI result'
    $('engine').textContent=mode==='3d'?'GENERATED 3D STUDY':presentation.label
    $('auto-select').disabled=!source||selecting||loading||!editing||locked
    $('undo').disabled=!history.length||selecting||mode==='camera'||!editing||locked
    $('redo').disabled=!redo.length||selecting||mode==='camera'||!editing||locked
    $('clear').disabled=!selected||selecting||!editing||locked
    $('export').disabled=locked||loading||(mode!=='photo'&&!images)||(mode==='3d'?!pbr:!selected||(mode==='photo'&&(!generated||analysisBusy||selecting)))
    $('export').textContent=exporting?'Preparing your image…':mode==='photo'?'Download AI photograph ↓':mode==='3d'?'Download 3D image ↓':'Download camera study ↓'
    root.querySelectorAll('[data-studio-material],[data-studio-upload],[data-studio-light]').forEach(button=>button.disabled=locked)
    for(const id of ['photo','camera','pbr','form','quality','demo'])$(id).disabled=locked
    $('saved-setups').disabled=locked
    $('refine').hidden=!editing
    $('comparison').hidden=$('divider').hidden=!editing||!selected||!presentation.comparison
    $('capture').hidden=$('stop').hidden=mode!=='camera'
    $('model-controls').hidden=mode!=='3d'
    $('stage').hidden=mode==='3d';$('pbr-panel').hidden=mode!=='3d'
    $('compare').disabled=!selected||!editing
    $('mask-toggle').disabled=!selected||!editing||locked
    root.querySelectorAll('[data-studio-tool],[data-studio-brush]').forEach(button=>button.disabled=!source||selecting||mode==='camera'||locked)
    for(const [id,value]of[['photo','photo'],['camera','camera'],['pbr','3d']])$(id).setAttribute('aria-pressed',String(mode===value))
    $('selection-state').textContent=mode==='3d'?'✓ Generated 3D geometry':selecting?'◌ Selecting upholstery':selected?'✓ Upholstery selected':'◌ Auto selection'
    if(mode==='photo')$('depth-state').textContent=selected?'✓ Original camera & framing':'◌ Preparing photograph'
    else if(mode==='3d')$('depth-state').textContent='✓ Real surface normals'
    else if(depthBusy)$('depth-state').textContent='◌ Analysing AI depth'
    else if(analysisBusy&&mode==='photo')$('depth-state').textContent='◌ Preserving light & seams'
    else $('depth-state').textContent=analysis?.depth?'✓ AI depth aligned':depthFailure?'○ Estimated surface':'◌ Surface depth'
    $('response-state').textContent=images?`✓ ${materialResponse(material).label}`:'◌ Material response'
  }
  function draw(){
    if(disposed)return
    updateControls()
    if(!source||mode==='3d')return
    try{
      const presentation=photoPresentation({mode,hasResult:Boolean(generated),showResult:showGenerated,showMask:$('mask-toggle').checked,compare:Number($('compare').value)/100})
      const aiVisible=presentation.generated
      $('original-image').hidden=mode!=='photo'||$('mask-toggle').checked
      canvas.style.opacity=mode==='photo'&&!$('mask-toggle').checked?'0':'1'
      $('generated-image').hidden=!aiVisible
      $('generated-image').style.clipPath=`inset(0 0 0 ${$('compare').value}%)`
      $('stage-label').textContent=presentation.label
      canvas.setAttribute('aria-label',aiVisible?`Original and AI reupholstery in ${material.name}. Drag the divider to compare.`:'Original furniture photograph. Tap upholstery to refine the selection before generating.')
      if(renderer&&(mode==='camera'||$('mask-toggle').checked))renderer.render({compare:presentation.shaderCompare,showMask:$('mask-toggle').checked,width:base.width,height:base.height})
      else if(fallbackContext){
        canvas.width=base.width;canvas.height=base.height
        const pixels=images&&colorPixels&&analysis&&(mode==='camera'||$('mask-toggle').checked)?renderSurfaceCPU(source,analysis,colorPixels,material,{compare:presentation.shaderCompare,showMask:$('mask-toggle').checked}):source.data
        fallbackContext.putImageData(new ImageData(pixels,base.width,base.height),0,0)
      }
      canvas.dataset.depth=analysis?.depth?'ai':'estimated';canvas.dataset.material=material.id
      $('divider').style.left=`${$('compare').value}%`;$('divider').setAttribute('aria-valuenow',$('compare').value)
    }catch{compatibility();if(source)draw()}
  }
  async function processAnalysis(){
    if(analysisRunning||!analysisQueued||disposed||!source||mode==='3d')return
    analysisRunning=true;analysisQueued=false
    const token=epoch,revision=analysisRevision,frame=source,selection=new Float32Array(mask),estimate=depth,preserveCreases=mode!=='camera'
    try{
      let result
      if(analysisWorkerFailed)result=analyseSurface(frame,selection,estimate,{preserveCreases})
      else{
        const pixels=frame.data.slice().buffer,selected=selection.buffer
        const response=await analysisEngine.request({pixels,mask:selected,width:frame.width,height:frame.height,depth:estimate,preserveCreases},[pixels,selected])
        result=response.analysis
      }
      if(disposed||token!==epoch||mode==='3d'||(mode!=='camera'&&revision!==analysisRevision))return
      analysis=result;renderer?.setAnalysis(analysis,frame.width,frame.height);draw()
    }catch(error){
      if(!disposed&&token===epoch){
        analysisQueued=!analysisWorkerFailed;analysisWorkerFailed=true
        status(analysisQueued?'Using the local lighting fallback. Your photograph remains on this device.':'Surface lighting could not be prepared. Select again or load another photograph.')
      }
    }finally{
      analysisRunning=false
      if(!disposed){
        analysisBusy=analysisQueued;updateControls()
        if(analysisQueued)void processAnalysis()
        else for(const ready of lightingWaiters)ready()
      }
    }
  }
  function rebuildAnalysis(){
    if(!source)return
    invalidateGeneration()
    analysisRevision++;analysisBusy=true;analysisQueued=true
    if(!analysis){
      // An empty field shows the untouched photo while the first worker runs.
      analysis={data:new Uint8Array(source.data.length),geometry:new Uint8Array(source.data.length),bounds:[0,0,1,1],selected:0,depth:false}
      renderer?.setAnalysis(analysis,base.width,base.height)
    }
    if(painting&&analysis.selected){
      for(let p=0;p<mask.length;p++)analysis.data[p*4+3]=Math.max(0,Math.min(255,mask[p]*255))
      renderer?.setAnalysis(analysis,base.width,base.height)
    }
    void processAnalysis()
  }
  function waitForLighting(){
    if(!analysisBusy&&!analysisRunning)return Promise.resolve()
    return new Promise((resolve,reject)=>{
      const ready=()=>{clearTimeout(timer);lightingWaiters.delete(ready);resolve()}
      const timer=setTimeout(()=>{lightingWaiters.delete(ready);reject(new Error('Surface lighting is still being prepared. Wait a moment and download again.'))},35000)
      lightingWaiters.add(ready)
    })
  }
  const stash=()=>{redo=[];history.push(new Float32Array(mask));if(history.length>10)history.shift()}
  function resize(width,height,edge=1536){
    const scale=Math.min(1,edge/Math.max(width,height));base.width=Math.max(1,Math.round(width*scale));base.height=Math.max(1,Math.round(height*scale))
    canvas.width=base.width;canvas.height=base.height;mask=new Float32Array(base.width*base.height);history=[];redo=[];depth=null;analysis=null;previousFrame=null
  }
  function stopCamera(){
    cancelAnimationFrame(animation);stream?.getTracks().forEach(track=>track.stop());stream=null
    if(video){video.pause();video.srcObject=null;video=null}cameraStarting=false
    if(mode==='camera')mode='photo'
  }
  function replaceSource(){
    invalidateGeneration()
    epoch++;segmentation.cancel();depthEngine.cancel();analysisEngine.cancel();analysisRevision++;analysisQueued=false;analysisBusy=false;selecting=false;depthBusy=false;depthFailure=false;stopCamera();showBusy(false)
  }
  function updateMaterialCard(){
    const response=materialResponse(material)
    $('selected').innerHTML=`<span class="studio-sample ${material.preserveTextureColor?'original':''}" style="--sample-color:${material.color}"><img src="${material.image}" alt="${escapeHtml(material.name)}"></span><div><b>${escapeHtml(material.name)}</b><span>${escapeHtml(material.shade)}</span><small>${escapeHtml(material.textureCredit || 'Illustrative material direction')}</small></div>`
    $('material-response').innerHTML=`<span>${response.label}</span><p>${response.description}</p><div><b>Automatically matched</b><small>Grain · surface relief · light response</small></div>`
    $('save-material').dataset.saveSwatch=material.id;$('save-material').textContent=isSaved(material.id)?'Saved to your swatch book ✓':'+ Save this fabric direction'
    root.querySelectorAll('[data-studio-material]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.studioMaterial===material.id)))
  }
  async function setMaterial(next){
    if(next.id===material.id&&images)return
    invalidateGeneration({keepCache:true})
    material=next;const version=++materialVersion;images=null;updateMaterialCard();updateControls()
    draw()
    status(`Preparing ${material.name} and its light response…`)
    try{
      const loaded=await loadMaterialImages(material)
      if(disposed||version!==materialVersion)return
      images=loaded;renderer?.setMaterial(images,material)
      const tile=document.createElement('canvas');tile.width=Math.min(1024,images.color.width);tile.height=Math.max(1,Math.round(tile.width*images.color.height/images.color.width));const tileContext=tile.getContext('2d',{willReadFrequently:true});tileContext.drawImage(images.color,0,0,tile.width,tile.height);colorPixels=tileContext.getImageData(0,0,tile.width,tile.height)
      if(pbr)await pbr.setMaterial(material,images)
      const cached=generationCache.get(resultKey())
      if(cached)presentGenerated(cached)
      draw()
      if(source&&!loading&&!selecting)status(cached?'Your previous AI edit is restored. No new generation was used.':mode==='photo'?`${material.name} is selected. Generate your new upholstery above the photograph.`:`${material.name}: ${materialResponse(material).description}`)
    }catch(error){if(!disposed&&version===materialVersion){images=null;status(error.message);updateControls()}}
  }
  function renderSwatches(){
    const query=normaliseSearch($('search').value),family=$('family').value
    const filtered=materials.filter(item=>(family==='all'||item.group===family)&&normaliseSearch(`${item.name} ${item.type} ${item.shade}`).includes(query))
    $('result-count').textContent=`${filtered.length} fabric direction${filtered.length===1?'':'s'}`
    $('swatches').innerHTML=filtered.map(item=>`<button type="button" data-studio-material="${item.id}" aria-pressed="${item.id===material.id}" title="${escapeHtml(item.name)}"><span class="studio-sample ${item.preserveTextureColor?'original':''}" style="--sample-color:${item.color}"><img src="${item.image}" alt="" loading="lazy"></span><span>${escapeHtml(item.name)}</span></button>`).join('') || '<p>No fabrics match. Try another name or surface family.</p>'
  }
  async function selectSurface(point=seed,{automatic=false,quiet=false}={}){
    if(!source||selecting||generationPending||generationStarting||mode==='3d')return
    const token=epoch,requestPoint={...point};selecting=true
    if(!quiet){showBusy(true,'Finding the upholstered surface…');status('Selecting the upholstery and protecting the room…')}
    updateControls()
    try{
      const bitmap=await createImageBitmap(base)
      if(disposed||token!==epoch){bitmap.close();return}
      const result=await segmentation.request({bitmap,point:requestPoint,automatic},[bitmap])
      if(disposed||token!==epoch)return
      if(!quiet)stash()
      const next=resampleSelection(result,base.width,base.height)
      const protectedMask=protectThinSupports(polishSelectionMask(next,base.width,base.height),base.width,base.height)
      mask=mode==='camera'?translateMask(protectedMask,base.width,base.height,(seed.x-requestPoint.x)*base.width,(seed.y-requestPoint.y)*base.height):protectedMask
      if(mode!=='camera')seed=result.point || requestPoint
      rebuildAnalysis();draw()
      if(!quiet)status(mode==='photo'?`Upholstery selected. Generate ${material.name} to see the fabric changed in your photograph.`:`${material.name} camera study. Surface depth is being prepared.`)
    }catch(error){if(!disposed&&token===epoch){if(!quiet)status(`${error.message} Open Refine selection to brush the upholstery.`);$('selection-state').textContent='○ Tap or brush to select'}}
    finally{if(!disposed&&token===epoch){selecting=false;showBusy(false);draw()}}
  }
  async function estimateDepth(){
    if(!source||depthBusy||mode==='3d'||depthFailure)return
    const token=epoch,point={...seed};depthBusy=true;updateControls()
    try{
      // Keep neural analysis bounded; full-resolution rendering is independent.
      const input=document.createElement('canvas'),scale=Math.min(1,640/Math.max(base.width,base.height));input.width=Math.round(base.width*scale);input.height=Math.round(base.height*scale)
      const ctx=input.getContext('2d',{willReadFrequently:true});ctx.drawImage(base,0,0,input.width,input.height);const pixels=ctx.getImageData(0,0,input.width,input.height)
      const result=await depthEngine.request({pixels:pixels.data.buffer,width:input.width,height:input.height},[pixels.data.buffer])
      if(disposed||token!==epoch||mode==='3d')return
      if(mode==='camera'&&Math.hypot(seed.x-point.x,seed.y-point.y)>.12)return
      depth={values:result.values,width:result.width,height:result.height};rebuildAnalysis();draw()
      if(mode!=='camera'&&!selecting)status(`Your original is ready. Generate ${material.name} above the photograph to see the new upholstery.`)
    }catch(error){if(!disposed&&token===epoch){depthFailure=true;status(`AI depth is unavailable on this device. The preview uses estimated placement; your photo is still available. ${error.message.includes('too long')?'Try another photo or reload to retry.':''}`)}}
    finally{if(!disposed&&token===epoch){depthBusy=false;updateControls()}}
  }
  async function loadPhoto(url){
    replaceSource();mode='photo';const token=epoch;loading=true;showBusy(true,'Preparing your photograph…');updateControls()
    try{
      const image=new Image();image.crossOrigin='anonymous';image.src=url;await image.decode()
      if(disposed||token!==epoch)return
      if(image.width*image.height>50_000_000)throw new Error('Choose a photograph smaller than 50 megapixels.')
      $('original-image').src=image.src;await $('original-image').decode()
      if(disposed||token!==epoch)return
      original=image;resize(image.width,image.height);context.drawImage(image,0,0,base.width,base.height);source=context.getImageData(0,0,base.width,base.height)
      seed={x:.5,y:.58};renderer?.setSource(base);rebuildAnalysis();$('empty').hidden=true;$('stage-label').hidden=false;$('stage-label').textContent='YOUR PHOTOGRAPH / AUTO MATERIAL'
      $('resolution-note').textContent=`Source ${image.width} × ${image.height} px · 4K / 8K export preserves the room and image proportions. Extra canvas size does not restore missing source detail.`
      loading=false;draw();await selectSurface(seed,{automatic:true})
    }catch(error){if(!disposed&&token===epoch)status(error.message || 'This image could not open. Try a JPG, PNG or WebP.')}
    finally{if(!disposed&&token===epoch){loading=false;showBusy(false);draw()}}
  }
  async function upload(file){
    if(!file||exporting||generationPending||generationStarting)return
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>15*1024*1024){status('Choose a JPG, PNG or WebP smaller than 15 MB.');$('upload').value='';return}
    const url=URL.createObjectURL(file)
    try{await loadPhoto(url)}finally{URL.revokeObjectURL(url);$('upload').value=''}
  }
  function invalidateGeneration({keepCache=false}={}){
    generationVersion++;generationAbort?.abort();generationAbort=null
    if(generationPending)showBusy(false)
    const changed=generationPending||generated
    generationPending=false;generated=null;$('generated-image').hidden=true;$('generated-image').removeAttribute('src')
    if(!keepCache)generationCache.clear()
    if(exportUrl){URL.revokeObjectURL(exportUrl);exportUrl=null;$('last-export')?.remove()}
    if(changed&&!generationError)$('generation-status').textContent='Your original is visible. Generate the selected fabric to see the new upholstery.'
  }
  async function refreshGenerationConnection(){
    $('check-ai').disabled=true
    try{
      const capabilities=await request('/api/studio/capabilities',{signal})
      if(disposed)return
      generationConnected=Boolean(capabilities.generation?.configured)
      if(!generationPending&&!generated)$('generation-status').textContent=generationError || (generationConnected?(capabilities.generation.provider+' is configured. Choose your fabric and generate an edited photograph.'):(capabilities.generation?.setupMessage || 'AI editing is not connected yet. The local connection page can save your API key without editing .env.'))
    }catch{if(!disposed){generationConnected=false;$('generation-status').textContent='The AI connection could not be checked. Refresh the connection to retry.'}}
    finally{if(!disposed){$('check-ai').disabled=false;updateControls()}}
  }
  async function generateAI(){
    if(generationStarting||generationPending||exporting||!generationConnected||!source||!analysis?.selected||mode==='3d')return
    generationStarting=true
    try{
      if(mode==='camera')freeze()
      const startingVersion=generationVersion
      updateControls()
      await waitForLighting()
      if(disposed||startingVersion!==generationVersion||!analysis?.selected||mode==='3d')return
    }finally{generationStarting=false;if(!disposed)updateControls()}
    const token=generationVersion,photoToken=epoch,chosen=material,selection=new Float32Array(mask),width=base.width,height=base.height
    const fingerprint=resultKey()
    if(generated)generationAttempt=null
    if(generationAttempt?.fingerprint!==fingerprint)generationAttempt={fingerprint,key:crypto.randomUUID()}
    generationAbort=new AbortController();const operation=generationAbort
    generationPending=true;generationError=''
    const progress=`Generating ${chosen.name} at ${$('ai-quality').value}. Keep this page open while AI rebuilds the upholstery…`
    $('generation-status').textContent=progress;status(progress)
    showBusy(true,'AI is reconstructing the upholstery…');updateControls()
    try{
      const inputs=generationInputs(original || base,selection,width,height)
      const result=await generateUpholstery(request,{...inputs,materialId:chosen.id,nativeSize:$('ai-quality').value},{key:generationAttempt.key,signal:AbortSignal.any([signal,operation.signal]),onStatus:message=>{if(!disposed&&token===generationVersion){$('generation-status').textContent=message;status(message)}}})
      const image=new Image();image.src=result.imageData;await image.decode()
      if(disposed||token!==generationVersion||photoToken!==epoch)return
      const saved={image,width:result.width,height:result.height,materialId:chosen.id}
      generationCache.delete(fingerprint);generationCache.set(fingerprint,saved)
      while(generationCache.size>2||([...generationCache.values()].reduce((total,item)=>total+item.image.src.length,0)>40_000_000&&generationCache.size>1))generationCache.delete(generationCache.keys().next().value)
      presentGenerated(saved)
      status('AI has reconstructed the upholstery. Drag the divider to compare with the original photograph.')
    }catch(error){
      if(!disposed&&token===generationVersion&&!operation.signal.aborted){if(error.terminal)generationAttempt=null;generationError=error.message;$('generation-status').textContent=error.message;status(error.message)}
    }finally{if(!disposed&&token===generationVersion){generationPending=false;generationAbort=null;showBusy(false);draw()}}
  }
  function presentGenerated(result){
    generated=result;showGenerated=true;generationError='';$('mask-toggle').checked=false
    $('generated-image').src=result.image.src;$('generated-image').alt=`AI reupholstery in ${material.name}`
    $('generation-status').textContent=`AI photograph ready in ${material.name}. Drag the divider to compare the shape, seams and finish.`
    $('resolution-note').textContent=`Native AI edit ${result.width} × ${result.height} px. Downloads resize this master to the chosen output size; 8K export adds canvas size, not new detail.`
  }
  async function show3d(){
    replaceSource();mode='3d';updateControls();status('Preparing the 3D material studio…')
    try{
      if(!pbr){pbrPromise ||= import('./pbr-preview.js');const {createPbrPreview}=await pbrPromise;if(disposed||mode!=='3d')return;pbr=createPbrPreview($('pbr-host'),status,{onContextLost:()=>{status('The 3D graphics device was reset. Switch to Photograph and back to retry.');pbr?.dispose();pbr=null;updateControls()}})}
      pbr.setForm(formId);pbr.setLight(lighting);if(images)await pbr.setMaterial(material,images)
      if(disposed||mode!=='3d')return
      root.querySelectorAll('[data-studio-light]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.studioLight===lighting)))
      $('form-name').textContent=studioForms.find(form=>form.id===formId).name
      $('resolution-note').textContent='Native 4K / 8K rendering from 3D geometry. Surface detail follows the available texture maps.'
      updateControls()
    }catch{mode='photo';pbr?.dispose();pbr=null;updateControls();status('3D rendering could not start. Your photo editor is still available; reload to retry 3D.')}
  }
  async function startCamera(){
    if(cameraStarting||mode==='camera')return
    replaceSource();cameraStarting=true;const token=epoch
    status('Requesting the highest supported camera resolution…')
    try{
      const acquired=await acquireCamera(navigator.mediaDevices,{isCurrent:()=>!disposed&&token===epoch})
      if(disposed||token!==epoch){acquired.getTracks().forEach(track=>track.stop());return}
      stream=acquired;video=document.createElement('video');video.muted=true;video.playsInline=true;video.srcObject=stream;await video.play()
      if(disposed||token!==epoch){stopCamera();return}
      mode='camera';cameraStarting=false;resize(video.videoWidth,video.videoHeight,960);original=null;seed={x:.5,y:.58};lastFrame=lastTrack=lastSelection=lastDepth=0
      $('empty').hidden=true;$('stage-label').hidden=false;$('stage-label').textContent='LIVE AI / HOLD STEADY'
      $('resolution-note').textContent=`Live source ${video.videoWidth} × ${video.videoHeight} px. Exports use the full camera frame; 8K output does not add uncaptured camera detail.`
      status('Keep the upholstery centred for automatic selection. AI refreshes the surface while motion tracking follows your camera.');updateControls()
      stream.getVideoTracks()[0]?.addEventListener('ended',()=>{if(mode==='camera'){freeze();status('The camera disconnected. The last preview is available to refine.')}},{once:true,signal})
      const tick=time=>{
        if(disposed||mode!=='camera'||!video)return
        animation=requestAnimationFrame(tick)
        if(document.hidden||time-lastFrame<(renderer?33:100))return
        lastFrame=time;context.drawImage(video,0,0,base.width,base.height);renderer?.setSource(base)
        if(time-lastTrack>180){
          lastTrack=time;source=context.getImageData(0,0,base.width,base.height)
          if(previousFrame&&analysis?.selected){const tracked=trackSurface(previousFrame,source,seed);if(tracked.confidence>.55){seed=tracked.seed;if(tracked.dx||tracked.dy)mask=translateMask(mask,base.width,base.height,tracked.dx,tracked.dy)}}
          previousFrame=source;rebuildAnalysis()
        }
        draw()
        if(source&&!selecting&&time-lastSelection>1500){lastSelection=time;void selectSurface(seed,{automatic:!analysis?.selected,quiet:true})}
        if(source&&!depthBusy&&!depthFailure&&time-lastDepth>6000){lastDepth=time;void estimateDepth()}
      };animation=requestAnimationFrame(tick)
    }catch(error){if(!disposed&&token===epoch){stopCamera();status(error.name==='NotAllowedError'?'Camera permission was declined. Allow camera access for this site, or upload a photograph.':error.name==='NotFoundError'?'No camera was found. Connect a camera or upload a photograph.':error.name==='NotReadableError'?'The camera is in use by another application. Close it there and retry.':error.message);updateControls()}}
  }
  function freeze(){
    if(!video)return
    const frozen=document.createElement('canvas');frozen.width=video.videoWidth;frozen.height=video.videoHeight;frozen.getContext('2d').drawImage(video,0,0)
    original=frozen;stopCamera();epoch++;segmentation.cancel();depthEngine.cancel();analysisEngine.cancel();analysisRevision++;analysisQueued=false;selecting=false;depthBusy=false
    $('original-image').src=frozen.toDataURL('image/jpeg',.98)
    context.drawImage(frozen,0,0,base.width,base.height);source=context.getImageData(0,0,base.width,base.height);renderer?.setSource(base);rebuildAnalysis();draw()
    $('stage-label').textContent='FROZEN CAMERA / REFINE & SAVE';status('Frame frozen at the camera’s full resolution. Refine the selection or download your preview.')
  }
  const pointFromEvent=event=>{const rect=canvas.getBoundingClientRect();return{x:Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width)),y:Math.max(0,Math.min(1,(event.clientY-rect.top)/rect.height))}}
  const paint=point=>{
    const x=point.x*base.width,y=point.y*base.height,radius=brushSize*base.width/1000
    const start=lastPoint || {x,y},steps=Math.max(1,Math.ceil(Math.hypot(x-start.x,y-start.y)/Math.max(1,radius*.35)))
    for(let i=1;i<=steps;i++)brushMask(mask,base.width,base.height,start.x+(x-start.x)*i/steps,start.y+(y-start.y)*i/steps,radius,tool==='erase')
    lastPoint={x,y};rebuildAnalysis();draw()
  }
  const compareAt=event=>{const rect=canvas.getBoundingClientRect();$('compare').value=Math.round(Math.max(0,Math.min(100,(event.clientX-rect.left)/rect.width*100)));draw()}
  listen(root,'pointerdown',event=>{
    if(event.target.closest('#studio-divider')){event.preventDefault();comparing=true;$('divider').setPointerCapture(event.pointerId);compareAt(event);return}
    if(event.target!==canvas||!source||selecting||loading||exporting||generationPending||generationStarting||mode==='3d')return
    event.preventDefault();canvas.focus({preventScroll:true});const point=pointFromEvent(event)
    if(mode==='camera'||tool==='ai'){seed=point;void selectSurface(point);return}
    stash();painting=true;lastPoint=null;canvas.setPointerCapture(event.pointerId);paint(point)
  })
  listen(root,'pointermove',event=>{if(comparing)compareAt(event);else if(painting)paint(pointFromEvent(event))})
  for(const name of ['pointerup','pointercancel'])listen(root,name,()=>{const painted=painting;comparing=false;painting=false;lastPoint=null;if(painted){rebuildAnalysis();draw()}})
  listen(root,'click',async event=>{
    if(event.target.closest('[data-studio-upload]')){$('upload').click();return}
    const swatch=event.target.closest('[data-studio-material]')
    if(swatch){if(exporting||generationPending||generationStarting)return;const next=materials.find(item=>item.id===swatch.dataset.studioMaterial);if(!next)return;await setMaterial(next);if(!source&&mode==='photo')void loadPhoto('/assets/products/alessio-three.webp');return}
    const selectedTool=event.target.closest('[data-studio-tool]')
    if(selectedTool){tool=selectedTool.dataset.studioTool;root.querySelectorAll('[data-studio-tool]').forEach(button=>button.setAttribute('aria-pressed',String(button===selectedTool)));return}
    const brush=event.target.closest('[data-studio-brush]')
    if(brush){brushSize=Number(brush.dataset.studioBrush);root.querySelectorAll('[data-studio-brush]').forEach(button=>button.setAttribute('aria-pressed',String(button===brush)));return}
    const light=event.target.closest('[data-studio-light]')
    if(light){lighting=light.dataset.studioLight;pbr?.setLight(lighting);root.querySelectorAll('[data-studio-light]').forEach(button=>button.setAttribute('aria-pressed',String(button===light)))}
  })
  listen($('photo'),'click',()=>{if(mode==='camera')freeze();else if(cameraStarting)replaceSource();mode='photo';pbr?.setTurntable(false);updateControls();if(source)draw()})
  listen($('pbr'),'click',()=>{void show3d()});listen($('camera'),'click',()=>{void startCamera()})
  listen($('capture'),'click',freeze);listen($('stop'),'click',freeze)
  listen($('demo'),'click',()=>{void loadPhoto('/assets/products/alessio-three.webp')})
  listen($('upload'),'change',event=>{void upload(event.target.files[0])})
  listen($('generate'),'click',()=>{void generateAI().catch(error=>{if(!disposed)status(error.message)})})
  listen($('check-ai'),'click',()=>{void refreshGenerationConnection()})
  listen($('cancel-generation'),'click',()=>{invalidateGeneration();$('generation-status').textContent='AI edit cancelled. Your original photograph is still available.';draw()})
  listen($('ai-quality'),'change',()=>{invalidateGeneration({keepCache:true});const cached=generationCache.get(resultKey());if(cached)presentGenerated(cached);status(cached?'Your previous AI edit is restored. No new generation was used.':`Original photograph. Generate ${material.name} at ${$('ai-quality').value} to see the new upholstery.`);draw()})
  listen($('toggle-result'),'click',()=>{showGenerated=!showGenerated;draw()})
  listen(window,'focus',()=>{if(!generationConnected)void refreshGenerationConnection()})
  listen($('stage'),'dragover',event=>{event.preventDefault();$('stage').classList.add('drag-over')})
  listen($('stage'),'dragleave',()=>$('stage').classList.remove('drag-over'))
  listen($('stage'),'drop',event=>{event.preventDefault();$('stage').classList.remove('drag-over');void upload(event.dataTransfer.files[0])})
  listen($('compare'),'input',draw);listen($('mask-toggle'),'change',draw)
  listen($('auto-select'),'click',()=>{void selectSurface(seed,{automatic:true})})
  listen($('search'),'input',renderSwatches);listen($('family'),'change',renderSwatches)
  listen($('form'),'change',()=>{formId=$('form').value;try{pbr?.setForm(formId);$('form-name').textContent=studioForms.find(form=>form.id===formId).name}catch(error){status(error.message)}})
  listen($('reset-view'),'click',()=>pbr?.resetView())
  listen($('turntable'),'click',()=>{const active=$('turntable').getAttribute('aria-pressed')!=='true';$('turntable').setAttribute('aria-pressed',String(active));pbr?.setTurntable(active)})
  listen($('undo'),'click',()=>{if(history.length){redo.push(new Float32Array(mask));mask=history.pop();rebuildAnalysis();draw();status('Selection restored. Fabric and lighting update automatically.')}})
  listen($('redo'),'click',()=>{if(redo.length){history.push(new Float32Array(mask));mask=redo.pop();rebuildAnalysis();draw();status('Selection reapplied. Fabric and lighting update automatically.')}})
  listen($('clear'),'click',()=>{stash();mask.fill(0);rebuildAnalysis();draw();status('Selection cleared. Tap the upholstery or use Brush to select it again.')})
  listen(root,'keydown',event=>{
    if(event.target===$('divider')&&['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();$('compare').value=event.key==='Home'?0:event.key==='End'?100:Number($('compare').value)+(event.key==='ArrowLeft'?-5:5);draw();return}
    if(event.target.closest('input,select,textarea')||selecting||loading)return
    if((event.ctrlKey||event.metaKey)&&['z','y'].includes(event.key.toLowerCase())){event.preventDefault();$(event.key.toLowerCase()==='y'||event.shiftKey?'redo':'undo').click()}
    if(!event.ctrlKey&&!event.metaKey){const key={a:'ai',b:'paint',e:'erase'}[event.key.toLowerCase()];if(key)root.querySelector(`[data-studio-tool="${key}"]`)?.click()}
    if(event.target===canvas&&event.key==='Enter'){event.preventDefault();void selectSurface(seed,{automatic:true})}
  })
  listen($('export'),'click',async()=>{
    if(exporting||generationPending||(mode!=='photo'&&!images)||(mode==='photo'&&(!generated||analysisBusy||selecting)))return
    exporting=true;updateControls();status('Rendering your high-resolution image…')
    const quality=$('quality').value,exportMaterial=material,exportMode=mode,exportForm=formId,exportImages=images
    try{
      // Freeze the native camera frame and settle its lighting before capturing;
      // an asynchronously moving stream must not outrun its shadow/mask layers.
      if(mode==='camera')freeze()
      await waitForLighting()
      if(disposed)return
      status('Rendering your high-resolution image…')
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))
      let result
      if(generated&&mode==='photo'){
        const size=exportSize((original || base).naturalWidth || (original || base).width,(original || base).naturalHeight || (original || base).height,quality,Math.min(renderer?.maxDimension || 4096,navigator.deviceMemory&&navigator.deviceMemory<=4?4096:8192))
        const output=document.createElement('canvas');output.width=size.width;output.height=size.height
        drawGeneratedResult(output.getContext('2d'),generated.image)
        const blob=await new Promise(resolve=>output.toBlob(resolve,'image/png'))
        if(!blob)throw new Error('The AI result could not be encoded. Choose 4K and download again.')
        result={blob,...size,ai:true,masterWidth:generated.width,masterHeight:generated.height}
      }
      else if(mode==='3d')result=await pbr.capture(quality)
      else{
        let full=mode==='camera'?video:original || base
        const width=full.videoWidth || full.naturalWidth || full.width,height=full.videoHeight || full.naturalHeight || full.height
        const limit=Math.min(renderer?.maxDimension || 4096,navigator.deviceMemory&&navigator.deviceMemory<=4?4096:8192)
        const size=exportSize(width,height,quality,limit)
        if(renderer&&Math.max(width,height)>renderer.maxDimension){const resized=document.createElement('canvas'),scale=renderer.maxDimension/Math.max(width,height);resized.width=Math.round(width*scale);resized.height=Math.round(height*scale);resized.getContext('2d').drawImage(full,0,0,resized.width,resized.height);full=resized}
        if(renderer&&typeof OffscreenCanvas!=='undefined'){
          const sourceBitmap=await createImageBitmap(full),bitmaps={}
          for(const key of ['color','normal','roughness'])bitmaps[key]=exportImages[key]?await createImageBitmap(exportImages[key]):null
          const field=analysis.data.slice().buffer,geometry=analysis.geometry.slice().buffer,transfer=[sourceBitmap,...Object.values(bitmaps).filter(Boolean),field,geometry]
          try{
            const rendered=await exportEngine.request({source:sourceBitmap,images:bitmaps,material:exportMaterial,width:size.width,height:size.height,analysis:{data:field,geometry,bounds:analysis.bounds,depth:analysis.depth,width:base.width,height:base.height}},transfer)
            result={blob:rendered.blob,...size}
          }catch(error){
            if(disposed)throw error
            const safeSize=exportSize(width,height,'4k',Math.min(limit,4096))
            result=await captureSurfaceOnMain(renderer,canvas,full,safeSize);result.limited=true
          }
        }else if(renderer)result=await captureSurfaceOnMain(renderer,canvas,full,size)
        else{
          const output=document.createElement('canvas');output.width=size.width;output.height=size.height;const ctx=output.getContext('2d');canvas.width=base.width;canvas.height=base.height
          fallbackContext.putImageData(new ImageData(renderSurfaceCPU(source,analysis,colorPixels,material,{compare:0}),base.width,base.height),0,0);ctx.drawImage(canvas,0,0,size.width,size.height)
          const blob=await new Promise(resolve=>output.toBlob(resolve,'image/png'));if(!blob)throw new Error('Export failed. Choose 4K and try again.');result={blob,...size,compatibility:true}
        }
      }
      if(disposed)return
      const encoded=await encodedPngSize(result.blob)
      result.limited ||= encoded.width!==result.width||encoded.height!==result.height
      result.width=encoded.width;result.height=encoded.height
      if(exportUrl)URL.revokeObjectURL(exportUrl)
      exportUrl=URL.createObjectURL(result.blob)
      let link=$('last-export')
      if(!link){link=document.createElement('a');link.id='studio-last-export';link.className='text-link';root.querySelector('.studio-output').appendChild(link)}
      link.href=exportUrl;link.download=`uw-${exportMaterial.id}-${result.ai?'ai':exportMode==='3d'?exportForm:exportMode}-${result.width}x${result.height}.png`;link.textContent=`Save last export: ${exportMaterial.name} / ${result.width} × ${result.height} PNG ↓`;link.click()
      const description=`${result.width} × ${result.height} PNG ready.${result.ai?` Resized from the ${result.masterWidth} × ${result.masterHeight} AI master.`:''}${result.limited?' Device limits reduced the requested resolution.':''}${result.compatibility?' Compatibility export is enlarged from the preview.':''}`
      status(description);$('resolution-note').textContent=description
    }catch(error){status(error.message || 'The high-resolution export failed. Try 4K or a smaller photograph.')}
    finally{exporting=false;if(!disposed&&renderer&&source&&mode!=='3d')renderer.setSource(base);draw()}
  })
  const paintStudies=()=>{$('saved-setups').innerHTML='<option value="">My saved setups</option>'+studies.map(study=>`<option value="${study.id}">${escapeHtml(study.name)}</option>`).join('')}
  request('/api/studio/designs',{signal}).then(items=>{studies=items;paintStudies()}).catch(()=>{if(!disposed)$('save-status').textContent='Saved setups will return when the workshop connection is available.'})
  listen($('save-setup'),'click',async()=>{
    const button=$('save-setup');button.disabled=true
    const body={materialId:material.id,formId,lighting,mode:mode==='camera'?'camera':mode==='3d'?'3d':'photo',quality:$('quality').value,name:`${material.name} / ${mode==='3d'?studioForms.find(form=>form.id===formId).name:'Photo study'}`}
    const fingerprint=JSON.stringify(body);if(saveAttempt?.fingerprint!==fingerprint)saveAttempt={fingerprint,key:crypto.randomUUID()}
    try{const study=await request('/api/studio/designs',{method:'POST',body,headers:{'Idempotency-Key':saveAttempt.key},signal});if(disposed)return;studies=[study,...studies.filter(item=>item.id!==study.id)];paintStudies();$('save-status').textContent='Only fabric, form and lighting settings were saved. Photographs are not included.'}
    catch(error){if(!disposed)$('save-status').textContent=error.message}
    finally{if(!disposed)button.disabled=false}
  })
  listen($('saved-setups'),'change',async()=>{
    const study=studies.find(item=>item.id===$('saved-setups').value);if(!study)return
    formId=study.formId;lighting=study.lighting;$('form').value=formId;$('quality').value=study.quality
    await setMaterial(materials.find(item=>item.id===study.materialId) || material)
    if(study.mode==='3d')await show3d()
    else {if(mode==='camera')freeze();mode='photo';pbr?.setTurntable(false);draw();status('Your fabric setup is restored. Upload your photograph or start the camera to apply it.')}
  })
  const visibility=()=>{if(document.hidden&&mode==='camera')freeze()};listen(document,'visibilitychange',visibility)
  const dispose=()=>{if(disposed)return;disposed=true;epoch++;materialVersion++;generationAbort?.abort();lifecycle.abort();segmentation.dispose();depthEngine.dispose();analysisEngine.dispose();exportEngine.dispose();for(const ready of lightingWaiters)ready();stopCamera();pbr?.dispose();renderer?.dispose();if(exportUrl)URL.revokeObjectURL(exportUrl);window.removeEventListener('pagehide',dispose)}
  window.addEventListener('pagehide',dispose,{once:true})
  renderSwatches();void setMaterial(material);updateControls()
  void refreshGenerationConnection()
  if(new URLSearchParams(location.search).has('material'))void loadPhoto('/assets/products/alessio-three.webp')
  return dispose
}
