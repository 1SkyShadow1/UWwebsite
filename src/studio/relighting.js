// The photograph already contains illumination. Preserve that illumination and
// replace its reflectance; do not light a flat colour with a second key light.
export const linearChannel = Float32Array.from({ length:256 }, (_, value) => {
  const c=value/255
  return c<=.04045 ? c/12.92 : ((c+.055)/1.055)**2.4
})
export const clamp=(value,min=0,max=1)=>Math.max(min,Math.min(max,value))

// Three separable box passes approximate a Gaussian without a quadratic kernel.
// Normalized convolution excludes the room, including at upholstered silhouettes.
export function maskedGaussian(values,mask,width,height,radius,passes=3) {
  radius=Math.max(1,Math.round(radius))
  let input=values
  const horizontal=new Float32Array(values.length),weights=new Float32Array(values.length)
  for(let pass=0;pass<passes;pass++){
    const output=new Float32Array(values.length)
    for(let y=0;y<height;y++){
      let sum=0,mass=0
      for(let x=0;x<=Math.min(radius,width-1);x++){const p=y*width+x,w=mask[p];sum+=input[p]*w;mass+=w}
      for(let x=0;x<width;x++){
        const p=y*width+x;horizontal[p]=sum;weights[p]=mass
        if(x-radius>=0){const q=p-radius;sum-=input[q]*mask[q];mass-=mask[q]}
        if(x+radius+1<width){const q=p+radius+1;sum+=input[q]*mask[q];mass+=mask[q]}
      }
    }
    for(let x=0;x<width;x++){
      let sum=0,mass=0
      for(let y=0;y<=Math.min(radius,height-1);y++){const p=y*width+x;sum+=horizontal[p];mass+=weights[p]}
      for(let y=0;y<height;y++){
        const p=y*width+x;output[p]=mass>1e-5?sum/mass:input[p]
        if(y-radius>=0){const q=p-radius*width;sum-=horizontal[q];mass-=weights[q]}
        if(y+radius+1<height){const q=p+(radius+1)*width;sum+=horizontal[q];mass+=weights[q]}
      }
    }
    input=output
  }
  return input
}

function resampleDepth(depth,mask,width,height) {
  const values=new Float32Array(width*height).fill(.5)
  if(!depth||depth.values?.length!==depth.width*depth.height)return {values,available:false}
  const finite=Array.from(depth.values).filter(Number.isFinite).sort((a,b)=>a-b)
  const min=finite[Math.floor(finite.length*.02)],max=finite[Math.floor(finite.length*.98)]
  if(!(max-min>1e-6))return {values,available:false}
  const at=(x,y)=>{
    const value=depth.values[clamp(y,0,depth.height-1)*depth.width+clamp(x,0,depth.width-1)]
    return Number.isFinite(value)?clamp((value-min)/(max-min)):.5
  }
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const dx=(x+.5)/width*depth.width-.5,dy=(y+.5)/height*depth.height-.5,ix=Math.floor(dx),iy=Math.floor(dy),fx=dx-ix,fy=dy-iy
    values[y*width+x]=(at(ix,iy)*(1-fx)+at(ix+1,iy)*fx)*(1-fy)+(at(ix,iy+1)*(1-fx)+at(ix+1,iy+1)*fx)*fy
  }
  return {values:maskedGaussian(values,mask,width,height,Math.max(1,width/600),2),available:true}
}

export function buildSurfaceLayers(source,mask,{depth,preserveCreases=true}={}) {
  const {width,height,data}=source,length=width*height,scale=Math.max(.5,width/1200)
  const luminance=new Float32Array(length)
  let x0=width,y0=height,x1=0,y1=0,selected=0
  for(let p=0;p<length;p++){
    const i=p*4;luminance[p]=linearChannel[data[i]]*.2126+linearChannel[data[i+1]]*.7152+linearChannel[data[i+2]]*.0722
    if(mask[p]>.5){const x=p%width,y=Math.floor(p/width);x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);selected++}
  }
  const packed=new Uint8Array(length*4),geometry=new Uint8Array(length*4)
  if(!selected)return {data:packed,geometry,bounds:[0,0,1,1],mean:128,selected:0,depth:false}
  const fine=maskedGaussian(luminance,mask,width,height,Math.max(1,scale),1)
  const medium=maskedGaussian(luminance,mask,width,height,5*scale)
  const broad=maskedGaussian(luminance,mask,width,height,12*scale)
  const surface=resampleDepth(depth,mask,width,height)
  const histogram=new Uint32Array(512)
  for(let p=0;p<length;p++)if(mask[p]>.5)histogram[Math.round(clamp(medium[p])*511)]++
  let count=0,reference=.25
  const target=histogram.reduce((a,b)=>a+b,0)*.6
  for(let i=0;i<histogram.length;i++){count+=histogram[i];if(count>=target){reference=Math.max(.008,i/511);break}}
  const distance=Math.max(2,Math.round(4*scale)),reach=Math.max(3,Math.round(9*scale)),normalStep=Math.max(2,Math.round(4*scale))
  const sample=(field,x,y,p)=>{
    const q=clamp(y,0,height-1)*width+clamp(x,0,width-1)
    return mask[q]>.25?field[q]:field[p]
  }
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const p=y*width+x,i=p*4,d=Math.round(surface.values[p]*65535)
    packed[i]=d>>>8;packed[i+2]=d&255;packed[i+3]=clamp(mask[p])*255
    // Illumination retains cushion modelling at intermediate scales. The old
    // broad 60px blur erased these shadows along with the source weave.
    const diffuse=(medium[p]*.86+broad[p]*.14)/reference
    let contact=1
    if(preserveCreases&&mask[p]>.5){
      let ridge=0
      for(const [ax,ay] of [[1,0],[0,1],[1,1],[1,-1]]){
        const across=(sample(fine,x+ax*distance,y+ay*distance,p)+sample(fine,x-ax*distance,y-ay*distance,p))*.5
        const along=(sample(fine,x-ay*reach,y+ax*reach,p)+sample(fine,x+ay*reach,y-ax*reach,p))*.5
        const farther=(sample(fine,x-ay*reach*2,y+ax*reach*2,p)+sample(fine,x+ay*reach*2,y-ax*reach*2,p))*.5
        // A crease remains dark along its length. Isolated grain flecks do not.
        const valley=clamp((across-fine[p])/Math.max(.015,across))
        const continuity=clamp(1-Math.max(Math.abs(along-fine[p]),Math.abs(farther-fine[p]))/Math.max(.015,across-fine[p]))
        ridge=Math.max(ridge,valley*continuity)
      }
      const residual=clamp(fine[p]/Math.max(.003,medium[p]),.18,1)
      contact=1-(1-residual)*clamp((ridge-.06)*2.2)*.9
    }
    packed[i+1]=clamp(diffuse,0,1.99)*128
    let nx=0,ny=0
    if(surface.available){
      const factor=(x1-x0)*.25/(normalStep*2)
      nx=clamp((sample(surface.values,x-normalStep,y,p)-sample(surface.values,x+normalStep,y,p))*factor,-1.8,1.8)
      ny=clamp((sample(surface.values,x,y-normalStep,p)-sample(surface.values,x,y+normalStep,p))*factor,-1.8,1.8)
    }
    const magnitude=Math.hypot(nx,ny,1)
    geometry[i]=(nx/magnitude*.5+.5)*255
    geometry[i+1]=(ny/magnitude*.5+.5)*255
    geometry[i+2]=contact*255
    // Highlight confidence fades at a mask boundary; no synthetic white rim.
    const coverage=(px,py)=>mask[clamp(py,0,height-1)*width+clamp(px,0,width-1)]
    geometry[i+3]=clamp(Math.min(mask[p],coverage(x-distance,y),coverage(x+distance,y),coverage(x,y-distance),coverage(x,y+distance)))*255
  }
  return {data:packed,geometry,bounds:[x0/width,y0/height,Math.max(1,x1-x0+1)/width,Math.max(1,y1-y0+1)/height],mean:reference,selected,depth:surface.available}
}
