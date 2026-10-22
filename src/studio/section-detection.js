import { MAX_PARTS, polygonArea } from './part-regions.js'

export function furnitureAnchor(detections,width,height){
  const allowed=new Set(['chair','couch','sofa','bed'])
  return detections.flatMap(detection=>{
    const category=detection.categories?.find(item=>allowed.has(item.categoryName?.toLowerCase())&&item.score>=.35),box=detection.boundingBox
    if(!category||!box||box.width*box.height<width*height*.025)return []
    const left=Math.max(0,box.originX/width),top=Math.max(0,box.originY/height),right=Math.min(1,(box.originX+box.width)/width),bottom=Math.min(1,(box.originY+box.height)/height)
    if(right<=left||bottom<=top)return []
    return [{left,top,right,bottom,score:category.score*Math.sqrt((right-left)*(bottom-top)),category:category.categoryName}]
  }).sort((a,b)=>b.score-a.score)[0]
}

export function sectionSeeds(mask,width,height){
  let left=width,right=0,top=height,bottom=0
  for(let p=0;p<mask.length;p++)if(mask[p]>.65){left=Math.min(left,p%width);right=Math.max(right,p%width);top=Math.min(top,Math.floor(p/width));bottom=Math.max(bottom,Math.floor(p/width))}
  const points=[]
  for(const fy of [.18,.38,.6,.79])for(const fx of [.13,.31,.5,.69,.87]){
    const x=Math.round(left+(right-left)*fx),y=Math.round(top+(bottom-top)*fy)
    if(x>=0&&y>=0&&x<width&&y<height&&mask[y*width+x]>.8)points.push({x,y})
  }
  return points.slice(0,20)
}

function connectedMask(values,width,height,point){
  const start=Math.max(0,Math.min(height-1,Math.round(point.y)))*width+Math.max(0,Math.min(width-1,Math.round(point.x)))
  if(!values[start])return new Uint8Array(values.length)
  const result=new Uint8Array(values.length),queue=new Uint32Array(values.length);let read=0,write=1
  queue[0]=start;result[start]=1
  while(read<write){
    const p=queue[read++],x=p%width,y=Math.floor(p/width)
    for(const q of [x>0?p-1:-1,x<width-1?p+1:-1,y>0?p-width:-1,y<height-1?p+width:-1])if(q>=0&&values[q]&&!result[q]){result[q]=1;queue[write++]=q}
  }
  return result
}

const directions=[[-1,-1],[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0]]
function simplify(points,tolerance){
  if(points.length<=2)return points
  const a=points[0],b=points.at(-1),dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy
  let maximum=0,index=0
  for(let i=1;i<points.length-1;i++){
    const p=points[i],t=length?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/length)):0,distance=(p.x-a.x-t*dx)**2+(p.y-a.y-t*dy)**2
    if(distance>maximum){maximum=distance;index=i}
  }
  return maximum>tolerance*tolerance?[...simplify(points.slice(0,index+1),tolerance).slice(0,-1),...simplify(points.slice(index),tolerance)]:[a,b]
}

export function maskOutline(mask,width,height){
  const start=mask.findIndex(Boolean)
  if(start<0)return []
  const origin={x:start%width,y:Math.floor(start/width)},boundary=[]
  let current=origin,back={x:origin.x-1,y:origin.y},firstNext
  for(let step=0;step<mask.length*4;step++){
    const index=directions.findIndex(([dx,dy])=>current.x+dx===back.x&&current.y+dy===back.y)
    let found
    for(let k=1;k<=8;k++){
      const d=(index+k+8)%8,[dx,dy]=directions[d],x=current.x+dx,y=current.y+dy
      if(x>=0&&y>=0&&x<width&&y<height&&mask[y*width+x]){
        const previous=directions[(d+7)%8];found={next:{x,y},back:{x:current.x+previous[0],y:current.y+previous[1]}};break
      }
    }
    if(!found)break
    if(firstNext&&current.x===origin.x&&current.y===origin.y&&found.next.x===firstNext.x&&found.next.y===firstNext.y)break
    firstNext ||= found.next;boundary.push(current);current=found.next;back=found.back
  }
  if(boundary.length<3)return []
  const midpoint=Math.floor(boundary.length/2)
  let tolerance=.7,outline=boundary
  do{outline=[...simplify(boundary.slice(0,midpoint+1),tolerance).slice(0,-1),...simplify([...boundary.slice(midpoint),boundary[0]],tolerance).slice(0,-1)];tolerance*=1.4}while(outline.length>60)
  return outline.map(({x,y})=>({x:(x+.5)/width,y:(y+.5)/height}))
}

export function chooseSections(candidates,upholstery,width,height,limit=MAX_PARTS){
  const rootArea=upholstery.reduce((n,value)=>n+(value>.5),0),proposals=[]
  if(!rootArea)return []
  for(const candidate of candidates){
    if(candidate.score<.65||candidate.values.length!==upholstery.length)continue
    const connected=connectedMask(candidate.values,width,height,candidate.point),values=new Uint8Array(connected.length)
    let total=0,area=0
    for(let p=0;p<values.length;p++)if(connected[p]){total++;if(upholstery[p]>.65){values[p]=1;area++}}
    if(area<rootArea*.025||area>rootArea*.48||area/Math.max(1,total)<.88)continue
    proposals.push({values,area,score:candidate.score+.04*Math.min(1,rootArea*.12/area)})
  }
  proposals.sort((a,b)=>b.score-a.score)
  const selected=[]
  for(const proposal of proposals){
    const overlaps=selected.some(other=>{
      let intersection=0;for(let p=0;p<proposal.values.length;p++)intersection+=Boolean(proposal.values[p]&&other.values[p])
      return intersection/Math.min(proposal.area,other.area)>.55
    })
    if(overlaps)continue
    const points=maskOutline(proposal.values,width,height)
    if(points.length<3||polygonArea(points)<.0004)continue
    let signature=2166136261
    for(const value of proposal.values)signature=Math.imul(signature^value,16777619)>>>0
    selected.push({...proposal,points,width,height,signature:String(signature)})
    if(selected.length>=limit)break
  }
  return selected.sort((a,b)=>Math.min(...a.points.map(p=>p.y))-Math.min(...b.points.map(p=>p.y))||Math.min(...a.points.map(p=>p.x))-Math.min(...b.points.map(p=>p.x)))
}
