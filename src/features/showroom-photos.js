import { showroomPhotos } from '../data/showroom-photos.js'
import { escapeHtml } from '../lib/html.js'

const photoFor=id=>showroomPhotos.find(photo=>photo.id===id)
const largest=photo=>photo.variants.at(-1).src
const srcset=photo=>photo.variants.map(file=>`${file.src} ${file.width}w`).join(', ')

export function showroomImage(id,{sizes='(max-width: 700px) 92vw, 48vw',loading='lazy',className=''}={}){
  const photo=photoFor(id),fallback=photo.variants.find(file=>file.width>=960) || photo.variants.at(-1)
  return `<img class="${escapeHtml(className)}" src="${fallback.src}" srcset="${srcset(photo)}" sizes="${escapeHtml(sizes)}" width="${photo.width}" height="${photo.height}" alt="${escapeHtml(photo.alt)}" loading="${loading}" decoding="async" style="object-position:${photo.focus}">`
}

export function showroomPhotoLink(id,{className='',caption,sizes,loading}={}){
  const photo=photoFor(id)
  return `<a class="showroom-photo ${escapeHtml(className)}" href="${largest(photo)}" data-showroom-photo="${id}" aria-haspopup="dialog" aria-label="View photograph: ${escapeHtml(photo.title)}">${showroomImage(id,{sizes,loading})}<span class="showroom-photo-label">${escapeHtml(caption || photo.title)} <b aria-hidden="true">↗</b></span></a>`
}

export function renderShowroomStory(){
  return `<section class="section showroom-story" id="our-showroom" aria-labelledby="showroom-story-title"><div class="showroom-story-copy"><p class="spec-label">THE REAL SHOWROOM / ALL THINGS UPHOLSTERY</p><h2 id="showroom-story-title">Good ideas<br><em>start with a visit.</em></h2><p>Take a seat. Open a sample book. See how a fabric changes in the light. This is where your saved swatches become something you can feel.</p><div class="atelier-actions"><a class="button gold" href="/contact.html#visit-showroom">Visit & talk fabric <span>↗</span></a><a class="text-link" href="${largest(photoFor('inside'))}" data-showroom-photo="inside" aria-haspopup="dialog">Look inside · 6 photographs ↗</a></div><div class="showroom-contact-sheet" aria-label="A few views of our showroom">${['garden','daylight','front-gate'].map(id=>`<a href="${largest(photoFor(id))}" data-showroom-photo="${id}" aria-haspopup="dialog" aria-label="View photograph: ${escapeHtml(photoFor(id).title)}">${showroomImage(id,{sizes:'(max-width:700px) 28vw, 140px'})}<span>0${showroomPhotos.findIndex(photo=>photo.id===id)+1} <i aria-hidden="true">↗</i></span></a>`).join('')}</div><p class="showroom-small-note">A glimpse of the place behind your next project.</p></div><div class="showroom-story-collage">${showroomPhotoLink('inside',{className:'showroom-story-main',caption:'01 / Come a little closer',sizes:'(max-width:700px) 92vw, 50vw'})}${showroomPhotoLink('corner',{className:'showroom-story-inset',caption:'02 / Black & gold',sizes:'(max-width:700px) 38vw, 210px'})}<span class="showroom-image-index" aria-hidden="true">UW / A PLACE FOR POSSIBILITY</span></div></section>`
}

export function renderShowroomArrival(){
  const daylight=photoFor('daylight')
  return `<section class="section showroom-arrival" id="visit-showroom" aria-labelledby="showroom-arrival-title"><div class="showroom-arrival-copy"><p class="spec-label">A LITTLE FAMILIARITY / BEFORE YOU ARRIVE</p><h2 id="showroom-arrival-title">You’ll know it<br><em>when you see it.</em></h2><p>Look for the black-and-gold sign and the white front gate. Get a feel for the place before bringing your ideas, measurements or a favourite fabric direction.</p><div class="showroom-view-switch" role="group" aria-label="Choose an arrival view"><button type="button" data-arrival-view="daylight" aria-pressed="true" aria-controls="arrival-photo-daylight">In daylight</button><button type="button" data-arrival-view="dusk" aria-pressed="false" aria-controls="arrival-photo-dusk">A warmer light</button></div><p class="showroom-arrival-caption" data-arrival-caption role="status">${daylight.caption}</p><a class="text-link" href="#enquiry-form">Let’s plan your conversation ↗</a></div><div class="showroom-arrival-frame"><div class="showroom-arrival-images">${['daylight','dusk'].map(id=>`<div class="showroom-arrival-photo" id="arrival-photo-${id}" ${id==='daylight'?'':'hidden'}>${showroomImage(id,{sizes:'(max-width:700px) 92vw, 50vw'})}</div>`).join('')}</div><a href="${largest(daylight)}" data-showroom-photo="daylight" data-arrival-open class="showroom-arrival-open" aria-haspopup="dialog">See the whole picture <span aria-hidden="true">↗</span></a><span class="showroom-arrival-edge" aria-hidden="true">YOUR NEXT CHAPTER STARTS HERE</span></div></section>`
}

export function bindShowroomPhotos({signal}){
  const root=document.querySelector('#app')
  if(!root?.querySelector('[data-showroom-photo]'))return
  let dialog,index=0,version=0,trigger,touchStart,viewVersion=0
  const listen=(element,event,callback)=>element.addEventListener(event,callback,{signal})
  function ensureDialog(){
    if(dialog)return
    dialog=document.createElement('dialog');dialog.className='showroom-gallery';dialog.setAttribute('aria-label','Upholstery Warehouse showroom photographs')
    dialog.innerHTML=`<div class="showroom-gallery-top"><div><span class="spec-label">A LOOK INSIDE / UPHOLSTERY WAREHOUSE</span><p>Our place. Your possibilities.</p></div><button type="button" data-gallery-close aria-label="Close showroom photographs">×</button></div><figure class="showroom-gallery-figure"><div class="showroom-gallery-stage" data-gallery-stage><img data-gallery-image alt="" hidden><p data-gallery-status role="status"></p></div><figcaption aria-live="polite" aria-atomic="true"><span data-gallery-number></span><div><h2 data-gallery-title></h2><p data-gallery-caption></p></div><div class="showroom-gallery-arrows"><button type="button" data-gallery-zoom aria-pressed="false" aria-label="Zoom into photograph">+</button><button type="button" data-gallery-step="-1" aria-label="Previous showroom photograph">←</button><button type="button" data-gallery-step="1" aria-label="Next showroom photograph">→</button></div></figcaption></figure><div class="showroom-gallery-thumbs" aria-label="Choose a showroom photograph">${showroomPhotos.map((photo,i)=>`<button type="button" data-gallery-index="${i}" aria-label="View ${escapeHtml(photo.title)}" aria-pressed="false">${showroomImage(photo.id,{sizes:'96px'})}</button>`).join('')}</div>`
    root.append(dialog)
    listen(dialog,'click',event=>{
      if(event.target.closest('[data-gallery-close]'))dialog.close()
      if(event.target.closest('[data-gallery-zoom]')){
        const stage=dialog.querySelector('[data-gallery-stage]'),zoomed=stage.classList.toggle('is-zoomed'),button=dialog.querySelector('[data-gallery-zoom]')
        button.setAttribute('aria-pressed',String(zoomed));button.setAttribute('aria-label',zoomed?'Fit photograph to viewer':'Zoom into photograph');button.textContent=zoomed?'−':'+'
      }
      const step=event.target.closest('[data-gallery-step]'),thumbnail=event.target.closest('[data-gallery-index]')
      if(step)void show(index+Number(step.dataset.galleryStep))
      if(thumbnail)void show(Number(thumbnail.dataset.galleryIndex))
      if(event.target===dialog){const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dialog.close()}
    })
    listen(dialog,'keydown',event=>{
      if(event.key==='Tab'){
        const buttons=[...dialog.querySelectorAll('button:not([disabled])')],first=buttons[0],last=buttons.at(-1)
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
      }
      if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();void show(event.key==='Home'?0:event.key==='End'?showroomPhotos.length-1:index+(event.key==='ArrowLeft'?-1:1))}
    })
    listen(dialog,'close',()=>{version++;document.body.classList.remove('showroom-gallery-open');if(trigger?.isConnected)trigger.focus({preventScroll:true})})
    const stage=dialog.querySelector('[data-gallery-stage]')
    listen(stage,'pointerdown',event=>{if(event.pointerType==='touch'&&!stage.classList.contains('is-zoomed'))touchStart={x:event.clientX,y:event.clientY}})
    listen(stage,'pointerup',event=>{if(touchStart){const dx=event.clientX-touchStart.x,dy=event.clientY-touchStart.y;touchStart=null;if(Math.abs(dx)>60&&Math.abs(dy)<80)void show(index+(dx<0?1:-1))}})
    listen(stage,'pointercancel',()=>{touchStart=null})
  }
  async function show(next){
    index=(next+showroomPhotos.length)%showroomPhotos.length
    const current=++version,photo=showroomPhotos[index],picture=dialog.querySelector('[data-gallery-image]'),status=dialog.querySelector('[data-gallery-status]')
    const stage=dialog.querySelector('[data-gallery-stage]'),zoom=dialog.querySelector('[data-gallery-zoom]')
    stage.classList.remove('is-zoomed');stage.style.setProperty('--photo-width',`${Math.min(photo.width,960)}px`);stage.scrollTo(0,0)
    zoom.setAttribute('aria-pressed','false');zoom.setAttribute('aria-label','Zoom into photograph');zoom.textContent='+'
    picture.hidden=true;status.textContent='Opening photograph…';dialog.querySelector('[data-gallery-number]').textContent=`${String(index+1).padStart(2,'0')} / ${String(showroomPhotos.length).padStart(2,'0')}`
    dialog.querySelector('[data-gallery-title]').textContent=photo.title;dialog.querySelector('[data-gallery-caption]').textContent=photo.caption
    dialog.querySelectorAll('[data-gallery-index]').forEach(button=>button.setAttribute('aria-pressed',String(Number(button.dataset.galleryIndex)===index)))
    const thumbnails=dialog.querySelector('.showroom-gallery-thumbs'),selected=thumbnails.querySelector(`[data-gallery-index="${index}"]`)
    thumbnails.scrollTo({left:selected.offsetLeft-thumbnails.offsetLeft-(thumbnails.clientWidth-selected.offsetWidth)/2,behavior:'instant'})
    const image=new Image();image.sizes='(min-width:1100px) 1000px, 92vw';image.srcset=srcset(photo);image.src=largest(photo)
    try{await image.decode();if(current!==version||signal.aborted)return;picture.srcset=image.srcset;picture.sizes=image.sizes;picture.src=image.src;picture.alt=photo.alt;picture.hidden=false;status.textContent=''}
    catch{if(current===version)status.textContent='This photograph could not load. Try another view.'}
  }
  listen(root,'click',event=>{
    const link=event.target.closest('[data-showroom-photo]')
    if(!link||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey||!window.HTMLDialogElement?.prototype.showModal)return
    const selected=showroomPhotos.findIndex(photo=>photo.id===link.dataset.showroomPhoto);if(selected<0)return
    event.preventDefault();ensureDialog();trigger=link;dialog.showModal();document.body.classList.add('showroom-gallery-open');void show(selected)
  })
  root.querySelectorAll('[data-arrival-view]').forEach(button=>listen(button,'click',async()=>{
    const section=button.closest('.showroom-arrival'),id=button.dataset.arrivalView,target=section.querySelector(`#arrival-photo-${id}`),current=++viewVersion
    const status=section.querySelector('[data-arrival-caption]')
    if(button.getAttribute('aria-pressed')==='true'){status.textContent=photoFor(id).caption;return}
    status.textContent='Opening the other view…'
    try{
      const image=target.querySelector('img');image.loading='eager';await image.decode();if(current!==viewVersion||signal.aborted)return
      section.querySelectorAll('[data-arrival-view]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)))
      section.querySelectorAll('.showroom-arrival-photo').forEach(item=>{item.hidden=item!==target})
      const photo=photoFor(id),link=section.querySelector('[data-arrival-open]');link.dataset.showroomPhoto=id;link.href=largest(photo);status.textContent=photo.caption
    }catch{if(current===viewVersion)status.textContent='This view could not load. The current photograph is still available.'}
  }))
  signal.addEventListener('abort',()=>{version++;viewVersion++;dialog?.close();dialog?.remove();document.body.classList.remove('showroom-gallery-open')},{once:true})
}
