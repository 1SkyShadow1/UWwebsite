import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { buildUpholsteryForm, disposeForm } from './upholstery-forms.js'
import { materialResponse, studioLights, exportSize } from './material-response.js'
import { loadMaterialImages } from './texture.js'

export function createPbrPreview(host,onStatus,{onContextLost=()=>{}}={}) {
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,preserveDrawingBuffer:true})
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace
  renderer.toneMapping=THREE.AgXToneMapping;renderer.toneMappingExposure=.9
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap
  host.appendChild(renderer.domElement)
  renderer.domElement.setAttribute('aria-label','3D upholstery study. Drag to rotate, pinch or scroll to zoom.')
  const scene=new THREE.Scene();scene.background=new THREE.Color('#111111')
  const camera=new THREE.PerspectiveCamera(37,1,.05,60)
  const controls=new OrbitControls(camera,renderer.domElement)
  controls.enableDamping=true;controls.enablePan=false;controls.minDistance=1;controls.maxDistance=9;controls.maxPolarAngle=Math.PI*.495
  const generator=new THREE.PMREMGenerator(renderer),room=new RoomEnvironment()
  const environment=generator.fromScene(room,.04);scene.environment=environment.texture;room.dispose();generator.dispose()
  const ambient=new THREE.HemisphereLight(0xffffff,0x383838,.6);scene.add(ambient)
  const key=new THREE.DirectionalLight(0xffffff,4);key.castShadow=true;key.shadow.mapSize.set(2048,2048);key.shadow.camera.left=-4;key.shadow.camera.right=4;key.shadow.camera.top=4;key.shadow.camera.bottom=-4;key.shadow.normalBias=.025;key.shadow.bias=-.0002;key.shadow.radius=4;scene.add(key)
  const fill=new THREE.DirectionalLight(0xe6edff,.3);fill.position.set(3,2,-3);scene.add(fill)
  const cloth=new THREE.MeshPhysicalMaterial({color:0xffffff,roughness:.8,metalness:0})
  const piping=new THREE.MeshPhysicalMaterial({color:0xc6c6c6,roughness:.85})
  const timber=new THREE.MeshStandardMaterial({color:0x563d2b,roughness:.5})
  const metal=new THREE.MeshStandardMaterial({color:0x242424,roughness:.3,metalness:.65})
  const floorMaterial=new THREE.MeshStandardMaterial({color:0x080808,roughness:.9})
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(200,200),floorMaterial);floor.rotation.x=-Math.PI/2;floor.position.y=-.012;floor.receiveShadow=true;scene.add(floor)
  let model,active=[],version=0,disposed=false,capturing=false,frame,currentLight=studioLights[0],modelId='tailored-sofa'
  const resetView=()=>{
    const bounds=new THREE.Box3().setFromObject(model),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3())
    const distance=Math.max(size.x,size.y,size.z)*1.65
    controls.target.set(center.x,center.y*.85,center.z)
    camera.position.set(center.x+distance*.8,center.y+distance*.52,center.z+distance)
    camera.lookAt(controls.target);controls.update()
  }
  const setForm=id=>{
    const next=buildUpholsteryForm(id,{cloth,piping,timber,metal})
    if(model)disposeForm(model)
    model=next;modelId=id;scene.add(model);host.dataset.form=id;resetView()
  }
  const setLight=id=>{
    const next=studioLights.find(item=>item.id===id)
    if(!next)throw new Error('Choose a supported lighting environment.')
    currentLight=next;key.color.setHex(next.color);key.intensity=next.intensity;key.position.set(...next.position)
    scene.environmentIntensity=next.environment;ambient.intensity=next.id==='evening'?.3:.6
    host.dataset.lighting=id
  }
  const makeTexture=(image,color=false)=>{
    if(!image)return null
    const texture=new THREE.Texture(image);texture.needsUpdate=true;texture.colorSpace=color?THREE.SRGBColorSpace:THREE.NoColorSpace
    texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy())
    return texture
  }
  async function setMaterial(material,images) {
    const token=++version;onStatus('Preparing the fabric, grain and light response…')
    const loaded=images || await loadMaterialImages(material)
    if(disposed||token!==version)return
    const textures=[makeTexture(loaded.color,true),makeTexture(loaded.normal),makeTexture(loaded.roughness)]
    active.forEach(texture=>texture?.dispose());active=textures
    const response=materialResponse(material)
    for(const texture of textures)texture?.repeat.setScalar(1/response.tileMetres)
    for(const target of [cloth,piping]){
      [target.map,target.normalMap,target.roughnessMap]=textures
      target.color.set(target===cloth?0xffffff:0xd2d2d2)
      target.roughness=response.roughness;target.sheen=response.sheen*(target===cloth?1:.6);target.sheenRoughness=response.sheenRoughness
      target.sheenColor.set(material.preserveTextureColor?0xd0d0d0:material.color).lerp(new THREE.Color(0xffffff),.18);target.clearcoat=response.clearcoat;target.clearcoatRoughness=response.roughness
      target.anisotropy=response.anisotropy;target.anisotropyRotation=Math.PI/2;target.metalness=0;target.ior=response.ior
      target.normalScale.setScalar(response.relief);target.needsUpdate=true
    }
    host.dataset.material=material.id;host.dataset.response=response.family
    onStatus(`${material.name} · ${response.label} · ${loaded.normal&&loaded.roughness?'Matched colour, normal & roughness maps':'Colour texture with estimated material response'}`)
  }
  const resize=()=>{if(disposed)return;const width=host.clientWidth,height=host.clientHeight;if(!width||!height)return;renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix()}
  const observer=new ResizeObserver(resize);observer.observe(host)
  const lostHandler=event=>{event.preventDefault();cancelAnimationFrame(frame);onContextLost()}
  renderer.domElement.addEventListener('webglcontextlost',lostHandler)
  setForm(modelId);setLight(currentLight.id);resize()
  const render=()=>{if(disposed)return;if(!capturing&&!document.hidden&&host.clientWidth){controls.update();renderer.render(scene,camera)}frame=requestAnimationFrame(render)};render()
  return {
    setMaterial,setForm,setLight,resetView,
    setTurntable(value){controls.autoRotate=Boolean(value);controls.autoRotateSpeed=.65},
    async capture(quality='4k'){
      if(disposed)throw new Error('Open the 3D studio before exporting.')
      const size=exportSize(16,9,quality,Math.min(renderer.capabilities.maxTextureSize,renderer.getContext().getParameter(renderer.getContext().MAX_RENDERBUFFER_SIZE),8192))
      const originalRatio=renderer.getPixelRatio(),originalSize=renderer.getSize(new THREE.Vector2())
      capturing=true
      try{
        renderer.setPixelRatio(1);renderer.setSize(size.width,size.height,false);camera.aspect=size.width/size.height;camera.updateProjectionMatrix();renderer.render(scene,camera)
        const blob=await new Promise(resolve=>renderer.domElement.toBlob(resolve,'image/png'))
        if(!blob)throw new Error('This device could not encode that resolution. Choose 4K and try again.')
        return {blob,...size,formId:modelId}
      }finally{renderer.setPixelRatio(originalRatio);renderer.setSize(originalSize.x,originalSize.y,false);camera.aspect=originalSize.x/originalSize.y;camera.updateProjectionMatrix();capturing=false;if(!disposed)renderer.render(scene,camera)}
    },
    dispose(){disposed=true;version++;cancelAnimationFrame(frame);observer.disconnect();controls.dispose();renderer.domElement.removeEventListener('webglcontextlost',lostHandler);if(model)disposeForm(model);active.forEach(t=>t?.dispose());[cloth,piping,timber,metal,floorMaterial].forEach(m=>m.dispose());floor.geometry.dispose();environment.dispose();renderer.dispose();renderer.domElement.remove()},
  }
}
