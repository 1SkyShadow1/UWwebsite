import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

export function createPbrPreview(host,onStatus){
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true})
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25
  host.appendChild(renderer.domElement)
  renderer.domElement.setAttribute('aria-label','Rotatable generic sofa material study. Drag to rotate; scroll to zoom.')
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(38,1,.1,40)
  camera.position.set(3,2.3,4.6)
  const controls=new OrbitControls(camera,renderer.domElement);controls.target.set(0,.65,0)
  controls.enableDamping=true;controls.enablePan=false;controls.minDistance=2.2;controls.maxDistance=7;controls.maxPolarAngle=Math.PI*.48
  scene.add(new THREE.HemisphereLight(0xfff0d9,0x6b777a,2.4))
  const key=new THREE.DirectionalLight(0xffefdb,4);key.position.set(-3,4,3);scene.add(key)
  const fill=new THREE.DirectionalLight(0xb7d9e8,2);fill.position.set(3,2,-2);scene.add(fill)
  const cloth=new THREE.MeshPhysicalMaterial({color:0xffffff,roughness:.85,metalness:0,sheen:.3,sheenColor:0xffffff,sheenRoughness:.7})
  const meshes=[]
  const box=(w,h,d,x,y,z,r=.12)=>{const mesh=new THREE.Mesh(new RoundedBoxGeometry(w,h,d,3,r),cloth);mesh.position.set(x,y,z);scene.add(mesh);meshes.push(mesh)}
  box(2.7,.35,1.1,0,.4,0);box(2.6,.8,.28,0,.95,-.4)
  box(.3,.72,1.1,-1.24,.68,0);box(.3,.72,1.1,1.24,.68,0)
  for(const x of [-.54,.54]){box(1.04,.22,.87,x,.68,.06,.09);box(1.04,.53,.22,x,1.03,-.22,.1)}
  const legMat=new THREE.MeshStandardMaterial({color:0x514435,roughness:.5})
  for(const x of [-1.05,1.05])for(const z of [-.35,.35]){const leg=new THREE.Mesh(new THREE.CylinderGeometry(.055,.045,.28,12),legMat);leg.position.set(x,.14,z);scene.add(leg);meshes.push(leg)}
  const floorMat=new THREE.MeshStandardMaterial({color:0x333b33,roughness:1})
  const floor=new THREE.Mesh(new THREE.CircleGeometry(3.4,64),floorMat);floor.rotation.x=-Math.PI/2;floor.position.y=-.01;scene.add(floor);meshes.push(floor)
  let active=[],version=0,disposed=false,frame,repeat=3,angle=0
  const resize=()=>{const width=host.clientWidth,height=host.clientHeight;if(!width||!height)return;renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix()}
  const observer=new ResizeObserver(resize);observer.observe(host);resize()
  const load=async(url,color=false)=>{
    const texture=await new THREE.TextureLoader().loadAsync(url)
    if(color)texture.colorSpace=THREE.SRGBColorSpace
    texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(repeat,repeat);texture.center.set(.5,.5);texture.rotation=angle
    texture.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());return texture
  }
  async function setMaterial(material){
    const token=++version;onStatus('Loading the selected surface…')
    const maps=material.pbr
    const results=await Promise.allSettled([load(material.textureImage||material.image,true),maps?.normal?load(maps.normal):null,maps?.roughness?load(maps.roughness):null])
    const textures=results.map(r=>r.status==='fulfilled'?r.value:null)
    if(disposed||token!==version){textures.forEach(t=>t?.dispose());return}
    active.forEach(t=>t?.dispose());active=textures
    if(textures[0]&&!material.preserveTextureColor){
      const image=textures[0].image,c=document.createElement('canvas');c.width=Math.min(1024,image.width);c.height=Math.min(1024,image.height)
      const ctx=c.getContext('2d');ctx.drawImage(image,0,0,c.width,c.height);ctx.globalCompositeOperation='color';ctx.fillStyle=material.color;ctx.fillRect(0,0,c.width,c.height)
      const tinted=new THREE.CanvasTexture(c);tinted.colorSpace=THREE.SRGBColorSpace;tinted.wrapS=tinted.wrapT=THREE.RepeatWrapping;tinted.repeat.set(repeat,repeat);tinted.center.set(.5,.5);tinted.rotation=angle;textures[0].dispose();textures[0]=tinted
    }
    ;[cloth.map,cloth.normalMap,cloth.roughnessMap]=textures
    cloth.color.set(0xffffff)
    cloth.normalScale.set(.45,.45);cloth.roughness=cloth.roughnessMap?1:.82;cloth.metalness=0
    cloth.sheen=/velvet|velour|fleece|wool/i.test(material.name)?.4:.12;cloth.needsUpdate=true
    onStatus(!cloth.map?'Texture unavailable. Choose another swatch.':cloth.normalMap&&cloth.roughnessMap?'Matched base colour + normal + roughness · 1K PBR':'Colour texture + uniform matte finish · no measured depth maps')
  }
  const setScale=(scale,rotation)=>{repeat=390/scale;angle=rotation*Math.PI/180;active.forEach(t=>{if(t){t.repeat.set(repeat,repeat);t.rotation=angle}})}
  const setSoftness=value=>{cloth.roughness=Math.max(.2,value);cloth.sheenRoughness=Math.max(.2,value)}
  const render=()=>{if(disposed)return;controls.update();if(!document.hidden)renderer.render(scene,camera);frame=requestAnimationFrame(render)};render()
  return {setMaterial,setScale,setSoftness,dispose(){disposed=true;version++;cancelAnimationFrame(frame);observer.disconnect();controls.dispose();active.forEach(t=>t?.dispose());meshes.forEach(m=>m.geometry.dispose());cloth.dispose();legMat.dispose();floorMat.dispose();renderer.dispose();renderer.domElement.remove()}}
}
