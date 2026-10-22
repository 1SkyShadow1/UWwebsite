import sharp from 'sharp'

const fail=message=>{throw Object.assign(new Error(message),{status:502})}
const decode=buffer=>sharp(buffer,{limitInputPixels:50_000_000,failOn:'error'})

// Ownership is decided before contacting the provider. Each call sees one
// swatch, and its result can contribute pixels only to that fabric's labels.
export async function fabricPasses(prepared,material){
  const alpha=await decode(prepared.mask).extractChannel('alpha').raw().toBuffer()
  const labels=prepared.regionLabels || Uint8Array.from(alpha,value=>value<255?1:0)
  if(!prepared.components?.length)return {passes:[{material,fabric:prepared.fabric,labels:[1],prepared}],labels}
  const groups=new Map(),references=[{label:1,material,fabric:prepared.fabric},...(prepared.components || []).map((part,i)=>({label:i+2,material:part.material,fabric:part.fabric}))]
  const counts=new Uint32Array(8)
  for(let p=0;p<labels.length;p++)if(alpha[p]<255)counts[labels[p]]++
  for(const reference of references){
    if(!counts[reference.label])continue
    let group=groups.get(reference.material.id)
    if(!group){group={material:reference.material,fabric:reference.fabric,labels:[]};groups.set(reference.material.id,group)}
    group.labels.push(reference.label)
  }
  const passes=[]
  for(const group of groups.values()){
    const owned=new Set(group.labels),selected=Buffer.alloc(alpha.length,255)
    for(let p=0;p<labels.length;p++)if(owned.has(labels[p]))selected[p]=alpha[p]
    const mask=await sharp({create:{width:prepared.photoInfo.width,height:prepared.photoInfo.height,channels:3,background:'#fff'}}).joinChannel(selected,{raw:{width:prepared.photoInfo.width,height:prepared.photoInfo.height,channels:1}}).png().toBuffer()
    passes.push({...group,prepared:{...prepared,mask,fabric:group.fabric,components:[],regionGuide:undefined,regionLabels:undefined,keepRest:false}})
  }
  return {passes,labels}
}

async function protectedAlpha(prepared,width,height){
  const values=await decode(prepared.mask).extractChannel('alpha').raw().toBuffer()
  for(let p=0;p<values.length;p++)values[p]=255-values[p]
  const hard=await sharp(values,{raw:{width:prepared.photoInfo.width,height:prepared.photoInfo.height,channels:1}}).resize(width,height,{kernel:'nearest',fit:'fill'}).toColourspace('b-w').raw().toBuffer()
  const soft=await sharp(hard,{raw:{width,height,channels:1}}).blur(.5).toColourspace('b-w').raw().toBuffer()
  // Feather inward only. Blurring must never make a protected room pixel editable.
  for(let p=0;p<hard.length;p++)hard[p]=Math.min(hard[p],soft[p])
  return hard
}

export function createFabricCompositor(prepared,sourceLabels){
  let width,height,rgba,alpha,owners,minScale=1,model,tail=Promise.resolve()
  async function add(generated,ownedLabels){
    const operation=tail.then(async()=>{
      const w=generated.width,h=generated.height,ratio=prepared.photoInfo.width/prepared.photoInfo.height
      if(w*h>20_000_000||w<128||h<128||Math.abs(w/h-ratio)/ratio>.04)fail('The AI changed the framing or image size. Your original photograph is unchanged.')
      if(!rgba){
        width=w;height=h;model=generated.model;rgba=Buffer.alloc(width*height*4)
        alpha=await protectedAlpha(prepared,width,height);owners=new Uint8Array(width*height)
        for(let y=0;y<height;y++)for(let x=0;x<width;x++)owners[y*width+x]=sourceLabels[Math.min(prepared.photoInfo.height-1,Math.floor((y+.5)*prepared.photoInfo.height/height))*prepared.photoInfo.width+Math.min(prepared.photoInfo.width-1,Math.floor((x+.5)*prepared.photoInfo.width/width))]
      }
      minScale=Math.min(minScale,w/width,h/height)
      const pixels=await decode(generated.image).resize(width,height,{fit:'fill'}).toColourspace('srgb').removeAlpha().raw().toBuffer(),allowed=new Set(ownedLabels)
      for(let p=0;p<owners.length;p++)if(allowed.has(owners[p])){
        const i=p*4,j=p*3;rgba[i]=pixels[j];rgba[i+1]=pixels[j+1];rgba[i+2]=pixels[j+2];rgba[i+3]=alpha[p]
      }
    })
    tail=operation;return operation
  }
  async function finish(editCount=1){
    await tail
    if(!rgba)fail('No selected furniture fabric could be generated.')
    const outputWidth=Math.max(128,Math.round(width*minScale)),outputHeight=Math.max(128,Math.round(height*minScale))
    let pixels=rgba
    if(outputWidth!==width||outputHeight!==height){
      // An exceptional lower-resolution pass determines the final size. Keep
      // ownership boundaries intact rather than filtering one fabric into another.
      pixels=await sharp(rgba,{raw:{width,height,channels:4}}).resize(outputWidth,outputHeight,{fit:'fill',kernel:'nearest'}).raw().toBuffer()
      const safeAlpha=await protectedAlpha(prepared,outputWidth,outputHeight)
      for(let p=0;p<safeAlpha.length;p++)pixels[p*4+3]=Math.min(pixels[p*4+3],safeAlpha[p])
    }
    const foreground=await sharp(pixels,{raw:{width:outputWidth,height:outputHeight,channels:4}}).png().toBuffer()
    const image=await decode(prepared.image).resize(outputWidth,outputHeight,{fit:'fill'}).composite([{input:foreground}]).png().toBuffer()
    rgba=alpha=owners=null
    return {imageData:`data:image/png;base64,${image.toString('base64')}`,width:outputWidth,height:outputHeight,nativeWidth:outputWidth,nativeHeight:outputHeight,model,fabricEditCount:editCount}
  }
  return {add,finish}
}

export async function editFabricRegions(prepared,material,adapter,options,{onProgress=()=>{}}={}){
  const {passes,labels}=await fabricPasses(prepared,material),compositor=createFabricCompositor(prepared,labels),batch=new AbortController()
  const signal=options.signal?AbortSignal.any([options.signal,batch.signal]):batch.signal
  let next=0,complete=0,started=0,failure
  async function worker(){
    while(next<passes.length&&!signal.aborted){
      const pass=passes[next++];started++
      onProgress(`AI fabric edits: ${complete}/${passes.length} complete · Fitting ${pass.material.name}…`)
      try{
        const result=await adapter(pass.prepared,pass.material,{...options,signal})
        if(signal.aborted)break
        await compositor.add(result,pass.labels);complete++
        onProgress(`AI fabric edits: ${complete}/${passes.length} complete.`)
      }catch(error){if(!failure){failure=error;batch.abort(error)}}
    }
  }
  await Promise.all(Array.from({length:Math.min(2,passes.length)},worker))
  if(failure){
    if(started>1)throw Object.assign(new Error((failure.status?failure.message:'A fabric edit could not finish.')+' The multi-fabric design was not completed; edits already started may have used credits. No automatic retry was made.'),{status:failure.status || 502})
    throw failure
  }
  if(signal.aborted)throw signal.reason || new Error('cancelled')
  return {finish:()=>compositor.finish(passes.length),editCount:passes.length}
}
