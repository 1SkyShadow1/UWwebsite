import { buildSurfaceLayers } from './relighting.js'

// Object segmentation can include bare legs. Conservatively exclude slender
// supports below the last broad body row; never trim the main upholstered body.
export function protectThinSupports(mask,width,height) {
  const rows=new Uint32Array(height)
  let widest=0,first=height,last=0
  for(let y=0;y<height;y++){for(let x=0;x<width;x++)if(mask[y*width+x]>.5)rows[y]++;if(rows[y]){first=Math.min(first,y);last=y;widest=Math.max(widest,rows[y])}}
  if(!widest)return mask
  // Legs have an abrupt neck below a broad body. A perspective-sloped base
  // tapers gradually; its last narrow rows are still upholstery.
  const step=Math.max(1,Math.round((last-first)*.02))
  let bodyBottom=-1
  for(let y=Math.round(first+(last-first)*.3);y<last-step;y++){
    const before=rows[y],after=rows[y+step]
    if(before>widest*.5&&after<before*.35&&last-y>(last-first)*.12){bodyBottom=y;break}
  }
  if(bodyBottom<0)return mask
  const result=new Float32Array(mask),margin=Math.max(1,Math.round((last-first)*.03))
  for(let y=bodyBottom+margin+1;y<height;y++)if(rows[y]<widest*.35)result.fill(0,y*width,(y+1)*width)
  return result
}

export function polishSelectionMask(mask,width,height) {
  const radius=Math.max(1,Math.min(3,Math.round(Math.max(width,height)/600)))
  const filter=(input,horizontal,dilate)=>{
    const output=new Uint8Array(input.length)
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      let value=dilate?0:1
      for(let offset=-radius;offset<=radius;offset++){
        const px=horizontal?x+offset:x,py=horizontal?y:y+offset
        const next=px>=0&&py>=0&&px<width&&py<height?input[py*width+px]:0
        value=dilate?Math.max(value,next):Math.min(value,next)
      }
      output[y*width+x]=value
    }
    return output
  }
  let closed=Uint8Array.from(mask,value=>value>.42?1:0)
  closed=filter(filter(filter(filter(closed,true,true),false,true),true,false),false,false)
  const output=new Float32Array(mask.length)
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const p=y*width+x,at=(px,py)=>px>=0&&py>=0&&px<width&&py<height?closed[py*width+px]:0
    output[p]=(closed[p]*4+at(x-1,y)+at(x+1,y)+at(x,y-1)+at(x,y+1))/8
  }
  return output
}

export function analyseSurface(source, mask, depth, options={}) {
  if(mask.length!==source.width*source.height)throw new Error('The surface selection does not match the photograph.')
  return buildSurfaceLayers(source,mask,{depth,...options})
}

// Small block matching tracks the selected point between AI updates. It never
// fabricates a new mask; a low-confidence match triggers a fresh AI selection.
export function trackSurface(previous, current, seed) {
  if(!previous||!current||previous.width!==current.width||previous.height!==current.height||!seed)return {seed,confidence:0,dx:0,dy:0}
  const {width,height}=current, scale=Math.max(1,Math.round(width/160))
  const cx=Math.round(seed.x*width),cy=Math.round(seed.y*height),patch=5,search=5
  let best=Infinity,second=Infinity,bx=0,by=0
  const lum=(frame,x,y)=>{const i=(y*width+x)*4;return frame.data[i]*.2126+frame.data[i+1]*.7152+frame.data[i+2]*.0722}
  for(let dy=-search;dy<=search;dy++)for(let dx=-search;dx<=search;dx++){
    let error=0,n=0
    for(let y=-patch;y<=patch;y+=2)for(let x=-patch;x<=patch;x+=2){
      const ax=cx+x*scale,ay=cy+y*scale,tx=ax+dx*scale,ty=ay+dy*scale
      if(ax<0||ay<0||tx<0||ty<0||ax>=width||ay>=height||tx>=width||ty>=height)continue
      const difference=lum(previous,ax,ay)-lum(current,tx,ty);error+=Math.min(2500,difference*difference);n++
    }
    error=n?error/n:Infinity
    if(error<best){second=best;best=error;bx=dx*scale;by=dy*scale}else second=Math.min(second,error)
  }
  const confidence=Number.isFinite(best)?Math.max(0,Math.min(1,1-best/900))*(second>best+1?1:.5):0
  return { seed:{x:Math.max(.02,Math.min(.98,seed.x+bx/width)),y:Math.max(.02,Math.min(.98,seed.y+by/height))},confidence,dx:bx,dy:by }
}

export function translateMask(mask,width,height,dx,dy) {
  const result=new Float32Array(mask.length),sx=Math.round(dx),sy=Math.round(dy)
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){const px=x-sx,py=y-sy;if(px>=0&&py>=0&&px<width&&py<height)result[y*width+x]=mask[py*width+px]}
  return result
}
