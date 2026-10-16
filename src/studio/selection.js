// Preserve subpixel boundaries when a small AI mask is projected onto the photo.
// Nearest-neighbour enlargement makes each low-resolution step visible in 8K.
export function resampleSelection({values,width,height},targetWidth,targetHeight){
  if(values.length!==width*height||!width||!height)throw new Error('The upholstery selection could not be read. Select again.')
  const result=new Float32Array(targetWidth*targetHeight)
  const at=(x,y)=>{
    const value=values[Math.max(0,Math.min(height-1,y))*width+Math.max(0,Math.min(width-1,x))]
    return Number.isFinite(value)?Math.max(0,Math.min(1,value)):0
  }
  for(let y=0;y<targetHeight;y++)for(let x=0;x<targetWidth;x++){
    const sx=(x+.5)/targetWidth*width-.5,sy=(y+.5)/targetHeight*height-.5,ix=Math.floor(sx),iy=Math.floor(sy),fx=sx-ix,fy=sy-iy
    const value=(at(ix,iy)*(1-fx)+at(ix+1,iy)*fx)*(1-fy)+(at(ix,iy+1)*(1-fx)+at(ix+1,iy+1)*fx)*fy
    result[y*targetWidth+x]=Math.max(0,Math.min(1,(value-.3)/.4))
  }
  return result
}

export function chooseConsistentMasks(candidates){
  let best,bestScore=-Infinity
  for(const candidate of candidates){
    const {width,height,values}=candidate
    let mass=0,border=0
    for(let p=0;p<values.length;p++)if(values[p]>.5){mass++;const x=p%width,y=Math.floor(p/width);if(x<3||y<3||x>=width-3||y>=height-3)border++}
    const coverage=mass/values.length,score=coverage>.015&&coverage<.8?1-Math.abs(coverage-.3)-border/Math.max(1,mass)*5:-10
    if(score>bestScore){bestScore=score;best={...candidate,coverage}}
  }
  if(!best||bestScore<=-10)throw new Error('No clear upholstery selection was found. Tap the upholstered area.')
  const values=new Float32Array(best.values)
  for(const candidate of candidates){
    if(candidate.width!==best.width||candidate.height!==best.height)continue
    let intersection=0,union=0
    for(let p=0;p<values.length;p++){const a=best.values[p]>.5,b=candidate.values[p]>.5;if(a&&b)intersection++;if(a||b)union++}
    if(intersection/Math.max(1,union)>.72)for(let p=0;p<values.length;p++)values[p]=Math.max(values[p],candidate.values[p])
  }
  return {...best,values}
}
