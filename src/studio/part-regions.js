// Shared by the browser encoder and server validator. Zero is protected room,
// one is the main upholstery, and subsequent labels identify outlined parts.
export const REGION_COLORS=Object.freeze([[0,0,0],[255,255,255],[247,183,49],[55,174,240],[232,100,154],[125,200,111],[175,136,235],[236,129,73]])
export const MAX_PARTS=REGION_COLORS.length-2
export const PART_TYPES=Object.freeze(['Cushion','Pillow','Seat cushion','Back cushion','Body panel','Seat','Backrest','Arm','Footstool','Other part','Section'])
// Legacy panel names remain valid for old API recipes; new separations are cushion-only.
export const CUSHION_TYPES=Object.freeze(['Cushion','Pillow','Seat cushion','Back cushion'])

export function classifiedCushions(candidates,identification){
  const names=identification?.parts
  if(!Array.isArray(names)||names.length!==candidates.length)throw new Error('The AI did not identify every proposed region. No sections were changed.')
  const ids=new Set(candidates.map(part=>part.id)),types=new Map()
  for(const part of names){
    if(!ids.has(part.id)||types.has(part.id)||!PART_TYPES.includes(part.type))throw new Error('The AI returned an invalid section. No sections were changed.')
    types.set(part.id,part.type)
  }
  return candidates.filter(part=>CUSHION_TYPES.includes(types.get(part.id))).map(part=>({...part,type:types.get(part.id)}))
}

export const plannedFabricEdits=(mainId,parts,keepRest=false)=>new Set([...(keepRest?[]:[mainId]),...parts.map(part=>part.materialId)]).size

export function partContainsPoint(part,x,y){
  const region=part.region
  if(region){
    if(x<0||y<0||x>1||y>1||!region.width||!region.height||region.values.length!==region.width*region.height)return false
    return Boolean(region.values[Math.min(region.height-1,Math.floor(y*region.height))*region.width+Math.min(region.width-1,Math.floor(x*region.width))])
  }
  return pointInOutline(x,y,part.points)
}

export function furnitureSelectionTarget(parts,mask,width,height,x,y){
  if(x<0||y<0||x>1||y>1||mask.length!==width*height)return {kind:'protected'}
  const index=Math.min(height-1,Math.floor(y*height))*width+Math.min(width-1,Math.floor(x*width))
  if(!(mask[index]>.5))return {kind:'protected'}
  const part=[...parts].reverse().find(part=>partContainsPoint(part,x,y))
  return part?{kind:'part',id:part.id}:{kind:'main'}
}

export function polygonArea(points){
  let area=0
  for(let i=0,j=points.length-1;i<points.length;j=i++)area+=points[j].x*points[i].y-points[i].x*points[j].y
  return Math.abs(area)/2
}

export function validOutline(points){
  return Array.isArray(points)&&points.length>=3&&points.length<=64&&points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1)&&polygonArea(points)>=.0004
}

export function pointInOutline(x,y,points){
  let inside=false
  for(let i=0,j=points.length-1;i<points.length;j=i++){
    const a=points[i],b=points[j]
    if((a.y>y)!==(b.y>y)&&x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x)inside=!inside
  }
  return inside
}

export function buildPartRegions(mask,width,height,parts,{keepRest=false}={}){
  if(mask.length!==width*height||parts.length>MAX_PARTS||parts.some(p=>!validOutline(p.points)))throw new Error('Finish each part outline before generating.')
  const labels=new Uint8Array(mask.length),counts=new Uint32Array(parts.length)
  for(let p=0;p<mask.length;p++)if(mask[p]>.1)labels[p]=keepRest?0:1
  // Later outlines take precedence where parts overlap. Every edit stays
  // clipped to the upholstery selection, including a partly outlined cushion.
  parts.forEach((part,index)=>{
    const minX=part.region?0:Math.max(0,Math.floor(Math.min(...part.points.map(p=>p.x))*width)),maxX=part.region?width-1:Math.min(width-1,Math.ceil(Math.max(...part.points.map(p=>p.x))*width))
    const minY=part.region?0:Math.max(0,Math.floor(Math.min(...part.points.map(p=>p.y))*height)),maxY=part.region?height-1:Math.min(height-1,Math.ceil(Math.max(...part.points.map(p=>p.y))*height))
    for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){
      const p=y*width+x
      if(mask[p]>.1&&partContainsPoint(part,(x+.5)/width,(y+.5)/height))labels[p]=index+2
    }
  })
  const selection=new Float32Array(mask.length)
  for(let p=0;p<labels.length;p++)if(labels[p]){selection[p]=mask[p];if(labels[p]>1)counts[labels[p]-2]++}
  if(counts.some(count=>count<16))throw new Error('Each outlined part must cover visible upholstery. Adjust overlapping outlines or the main selection.')
  return {labels,selection,counts}
}

export function partsFingerprint(parts,keepRest){
  return JSON.stringify([keepRest,...parts.map(({id,type,materialId,points,region})=>[id,type,materialId,points.map(p=>[p.x,p.y]),region?.signature])])
}
