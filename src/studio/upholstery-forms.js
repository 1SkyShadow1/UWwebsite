import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { studioForms } from './material-response.js'

function metricUV(geometry) {
  const position=geometry.attributes.position,normal=geometry.attributes.normal,uv=geometry.attributes.uv
  for(let i=0;i<position.count;i++){
    const nx=Math.abs(normal.getX(i)),ny=Math.abs(normal.getY(i)),nz=Math.abs(normal.getZ(i))
    if(nz>=nx&&nz>=ny)uv.setXY(i,position.getX(i),position.getY(i))
    else if(ny>=nx)uv.setXY(i,position.getX(i),-position.getZ(i))
    else uv.setXY(i,-position.getZ(i),position.getY(i))
  }
  return geometry
}

export function buildUpholsteryForm(id, { cloth, piping, timber, metal }) {
  const definition=studioForms.find(form=>form.id===id)
  if(!definition)throw new Error('Choose a supported upholstery form.')
  const group=new THREE.Group();group.name=definition.name;group.userData.formId=id
  const add=(geometry,material,position=[0,0,0],rotation=[0,0,0],name='Upholstery')=>{
    const mesh=new THREE.Mesh(geometry,material);mesh.position.set(...position);mesh.rotation.set(...rotation)
    mesh.castShadow=true;mesh.receiveShadow=true;mesh.name=name;mesh.userData.upholstery=material===cloth||material===piping;group.add(mesh);return mesh
  }
  const box=(w,h,d,x,y,z,r=.08,material=cloth)=>add(metricUV(new RoundedBoxGeometry(w,h,d,4,Math.min(r,w/2-.001,h/2-.001,d/2-.001))),material,[x,y,z])
  const leg=(x,z,height=.3,y=height/2)=>add(new THREE.CylinderGeometry(.025,.038,height,12),timber,[x,y,z],[.04*Math.sign(z),0,.035*Math.sign(x)],'Timber leg')
  const ring=(w,d,x,y,z)=>{
    const radius=Math.min(.1,w*.15,d*.15)
    // A continuous rounded rectangle with real piping.
    const shape=new THREE.Shape();shape.moveTo(-w/2+radius,-d/2);shape.lineTo(w/2-radius,-d/2);shape.quadraticCurveTo(w/2,-d/2,w/2,-d/2+radius);shape.lineTo(w/2,d/2-radius);shape.quadraticCurveTo(w/2,d/2,w/2-radius,d/2);shape.lineTo(-w/2+radius,d/2);shape.quadraticCurveTo(-w/2,d/2,-w/2,d/2-radius);shape.lineTo(-w/2,-d/2+radius);shape.quadraticCurveTo(-w/2,-d/2,-w/2+radius,-d/2)
    const curve=new THREE.CatmullRomCurve3(shape.getPoints(40).map(p=>new THREE.Vector3(p.x,0,p.y)),true)
    return add(new THREE.TubeGeometry(curve,80,.005,5,true),piping,[x,y,z],[0,0,0],'Stitched piping')
  }
  const cushion=(w,h,d,x,y,z,rotation=[0,0,0])=>{
    const geometry=new RoundedBoxGeometry(w,h,d,6,Math.min(h*.36,.11))
    const positions=geometry.attributes.position
    for(let i=0;i<positions.count;i++){
      const px=positions.getX(i),py=positions.getY(i),pz=positions.getZ(i)
      const puff=Math.max(0,Math.cos(px/w*Math.PI))*Math.max(0,Math.cos(pz/d*Math.PI))
      positions.setY(i,id==='cushions'?py*(.25+.75*Math.pow(puff,.35)):py+Math.sign(py)*puff*h*.12)
    }
    geometry.computeVertexNormals();metricUV(geometry)
    const mesh=add(geometry,cloth,[x,y,z],rotation,'Padded cushion')
    if(id==='cushions'){
      const seam=ring(w-.018,d-.018,x,y,z);seam.rotation.set(...rotation)
    }else if(!rotation.some(Boolean))ring(w-.012,d-.012,x,y+h*.24,z)
    return mesh
  }
  const feet=(w,d,h=.22)=>{for(const x of [-w/2,w/2])for(const z of [-d/2,d/2])leg(x,z,h)}
  if(['tailored-sofa','corner-sofa','loveseat','chesterfield'].includes(id)){
    const width=id==='loveseat'?1.65:2.55,seatWidth=width-.4,seats=id==='loveseat'?2:3
    const rolled=id==='chesterfield'
    box(width,.24,1.02,0,.35,0,.08)
    box(width-.12,rolled?.66:.78,.25,0,rolled?.86:.9,-.4,.11)
    for(const x of [-width/2+.12,width/2-.12]){
      box(.24,.52,1.04,x,.68,0,.105)
      if(rolled)add(new THREE.CylinderGeometry(.17,.17,.98,32),cloth,[x,.99,0],[Math.PI/2,0,0],'Rolled upholstered arm')
    }
    for(let i=0;i<seats;i++){
      const x=-seatWidth/2+(i+.5)*seatWidth/seats
      cushion(seatWidth/seats-.025,.2,.79,x,.57,.075)
      if(!rolled)cushion(seatWidth/seats-.025,.17,.57,x,.98,-.255,[Math.PI/2-.09,0,0])
    }
    feet(width-.27,.73,.24)
    if(rolled){
      const buttonGeometry=new THREE.SphereGeometry(.025,10,8)
      for(let row=0;row<3;row++)for(let column=0;column<10;column++){
        const x=(column-4.5)*.215+(row%2)*.065,y=.74+row*.17
        const button=add(buttonGeometry,piping,[x,y,-.245],[0,0,0],'Upholstered tuft button');button.scale.z=.35
        if(column<9){const a=new THREE.Vector3(x,y,-.267),b=new THREE.Vector3(x+.105,y+.08,-.258),c=new THREE.Vector3(x+.215,y,-.267);add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([a,b,c]),8,.003,4,false),piping,[0,0,0],[0,0,0],'Tuft seam')}
      }
    }
    if(id==='corner-sofa'){
      box(.9,.25,1.15,.76,.35,.98,.1);cushion(.85,.22,1.12,.76,.57,.99);leg(.42,1.42,.24);leg(1.1,1.42,.24)
      // A separate low bolster gives the chaise an upholstered return.
      cushion(.7,.19,.36,.76,.82,-.06,[Math.PI/2-.18,0,0])
    }
  } else if(id==='wingback'){
    box(.91,.22,.87,0,.4,0,.09);cushion(.69,.2,.7,0,.57,.055)
    cushion(.72,.2,1.05,0,1.04,-.34,[Math.PI/2-.11,0,0])
    for(const x of [-.39,.39]){box(.16,.49,.83,x,.73,.02,.07);box(.16,.62,.31,x,1.2,-.26,.07)}
    feet(.7,.62,.3)
  } else if(id==='dining-chair'){
    cushion(.52,.13,.52,0,.5,.03)
    cushion(.5,.12,.57,0,.88,-.22,[Math.PI/2-.13,0,0])
    feet(.42,.4,.46)
    for(const x of [-.2,.2])box(.035,.71,.035,x,.7,-.22,.015,timber)
  } else if(id==='ottoman'){
    add(new THREE.CylinderGeometry(.44,.43,.38,64),cloth,[0,.25,0],[0,0,0],'Upholstered drum')
    add(new THREE.CylinderGeometry(.45,.44,.11,64),cloth,[0,.49,0],[0,0,0],'Padded circular top')
    add(new THREE.TorusGeometry(.442,.006,8,80),piping,[0,.525,0],[Math.PI/2,0,0],'Circular piping')
    add(new THREE.CylinderGeometry(.38,.38,.1,48),metal,[0,.05,0],[0,0,0],'Recessed plinth')
  } else if(id==='bench'){
    cushion(1.5,.23,.5,0,.53,0);box(1.4,.1,.43,0,.36,0,.025,timber);feet(1.25,.32,.34)
  } else if(id==='headboard'){
    box(1.84,1.23,.16,0,.79,0,.075)
    for(let i=0;i<8;i++)box(.217,1.15,.15,(i-3.5)*.226,.82,.095,.065)
    for(const x of [-.65,.65])box(.065,.35,.07,x,.175,0,.015,timber)
  } else if(id==='cushions'){
    cushion(.6,.18,.6,-.38,.36,0,[.7,0,.18]);cushion(.56,.18,.56,.16,.34,-.08,[.9,0,-.15])
    cushion(.65,.2,.32,.43,.19,.23,[.15,0,-.12])
    add(new THREE.CylinderGeometry(.13,.13,.54,40),cloth,[-.35,.16,.43],[0,0,Math.PI/2],'Upholstered bolster')
    for(const x of [-.62,-.08])add(new THREE.TorusGeometry(.126,.005,6,40),piping,[x,.16,.43],[0,Math.PI/2,0],'Bolster piping')
  }
  group.updateMatrixWorld(true)
  return group
}

export function disposeForm(group) {
  const geometries=new Set()
  group.traverse(mesh=>{if(mesh.geometry)geometries.add(mesh.geometry)})
  geometries.forEach(geometry=>geometry.dispose())
  group.removeFromParent()
}
