export function bindHeader({signal}){
  const header=document.querySelector('.site-header'),nav=header?.querySelector('.site-nav'),toggle=header?.querySelector('[data-action="menu"]')
  if(!header||!nav||!toggle)return
  const listen=(target,event,callback)=>target.addEventListener(event,callback,{signal})
  let frame=0
  const setOpen=(open,{restoreFocus=false}={})=>{
    nav.classList.toggle('open',open)
    toggle.setAttribute('aria-expanded',String(open))
    if(open)nav.querySelector('a')?.focus({preventScroll:true})
    else if(restoreFocus)toggle.focus({preventScroll:true})
  }
  listen(toggle,'click',()=>setOpen(!nav.classList.contains('open'),{restoreFocus:true}))
  listen(document,'keydown',event=>{
    if(event.key==='Escape'&&nav.classList.contains('open')){event.preventDefault();setOpen(false,{restoreFocus:true})}
  })
  listen(document,'click',event=>{
    if(nav.classList.contains('open')&&!nav.contains(event.target)&&!toggle.contains(event.target))setOpen(false)
  })
  const wide=window.matchMedia('(min-width:1441px)')
  listen(wide,'change',()=>{if(wide.matches)setOpen(false)})
  const paint=()=>{
    frame=0;header.classList.toggle('is-scrolled',window.scrollY>24)
    header.querySelectorAll('.tool-button b').forEach(counter=>counter.classList.toggle('is-empty',counter.textContent.trim()==='0'))
  }
  listen(window,'scroll',()=>{if(!frame)frame=requestAnimationFrame(paint)})
  const observer=new MutationObserver(paint)
  header.querySelectorAll('.tool-button b').forEach(counter=>observer.observe(counter,{childList:true,characterData:true,subtree:true}))
  signal.addEventListener('abort',()=>{cancelAnimationFrame(frame);observer.disconnect()},{once:true})
  paint()
}
