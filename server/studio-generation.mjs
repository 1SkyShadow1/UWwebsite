import { createHash, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import sharp from 'sharp'
import { materialResponse } from '../src/studio/material-response.js'
import { getAiCredential, aiCredentialConfigured, getAiProvider } from './ai-credentials.mjs'
import { aiProviderName, aiProviderVariable } from './ai-providers.mjs'
import { materials as catalogueMaterials } from '../src/data/materials.js'
import { REGION_COLORS, MAX_PARTS, PART_TYPES } from '../src/studio/part-regions.js'
import { generationModel, generationRoute, pollinationsDetails, pollinationsModelProfile } from './studio-models.mjs'
import { GENERATION_MODES, validateGenerationMode } from '../src/studio/generation-modes.js'
import { createFabricCompositor, editFabricRegions } from './studio-fabric-passes.mjs'
import { identifyPartTypes, PART_IDENTIFICATION_MODEL } from './studio-part-identification.mjs'
export { pollinationsModelProfile } from './studio-models.mjs'

export class StudioGenerationError extends Error {
  constructor(status,message){super(message);this.status=status}
}
const reject=(status,message)=>{throw new StudioGenerationError(status,message)}
const allowedFormats=new Set(['png','jpeg','webp'])
const fabricCache=new Map()

export function generationSize(width,height,maximumEdge=3840){
  if(width/height>3||height/width>3)reject(400,'Crop the photograph closer to the furniture. AI editing supports proportions up to 3:1.')
  const edge=Math.min(3840,Math.max(1024,maximumEdge))
  const scale=Math.min(edge/width,edge/height,Math.sqrt(8_294_400/(width*height)))
  const size={width:Math.max(16,Math.floor(width*scale/16)*16),height:Math.max(16,Math.floor(height*scale/16)*16)}
  if(size.width*size.height<655360)reject(400,'Crop the photograph closer to square for this generation size.')
  return size
}

function imageBuffer(value,label){
  if(typeof value!=='string'||value.length>22_000_000)reject(400,`${label} is missing or too large.`)
  const match=/^data:image\/(png|jpeg|webp);base64,([a-zA-Z0-9+/]+={0,2})$/.exec(value)
  if(!match)reject(400,`Use a PNG, JPEG or WebP ${label.toLowerCase()}.`)
  const bytes=Buffer.from(match[2],'base64')
  if(bytes.length<24||bytes.toString('base64')!==match[2])reject(400,`${label} could not be read.`)
  return bytes
}

const decoder=buffer=>sharp(buffer,{limitInputPixels:50_000_000,failOn:'error'})
const validateNativeSize=value=>{if(value!==undefined&&!['1K','2K','4K'].includes(value))reject(400,'Choose 1K, 2K or 4K for the AI image detail.')}

async function fabricReference(path){
  for(const directory of process.env.VERCEL?['server-assets']:['public','dist']){
    try{return await readFile(resolve(directory,`.${path}`))}
    catch(error){if(error.code!=='ENOENT')throw error}
  }
  throw new Error('Fabric reference is missing')
}

async function untilAborted(promise,signal){
  let stop
  const cancelled=new Promise((_,reject)=>{
    stop=()=>reject(signal.reason || new Error('cancelled'))
    if(signal.aborted)stop()
    else signal.addEventListener('abort',stop,{once:true})
  })
  try{return await Promise.race([promise,cancelled])}
  finally{signal.removeEventListener('abort',stop)}
}

export function validatePartFabrics(body){
  if(body.keepRest!==undefined&&typeof body.keepRest!=='boolean')reject(400,'Choose whether to keep the rest of the piece unchanged.')
  if(body.components===undefined){if(body.regionData!==undefined||body.keepRest)reject(400,'Outline a part before using separate fabrics.');return []}
  if(!Array.isArray(body.components)||body.components.length<1||body.components.length>MAX_PARTS)reject(400,`Choose between one and ${MAX_PARTS} separate parts.`)
  const ids=new Set()
  return body.components.map(part=>{
    if(!part||typeof part.id!=='string'||!/^[a-zA-Z0-9-]{1,64}$/.test(part.id)||ids.has(part.id)||!PART_TYPES.includes(part.type)||!catalogueMaterials.some(item=>item.id===part.materialId))reject(400,'A furniture part or its fabric is invalid.')
    ids.add(part.id)
    return {id:part.id,type:part.type,materialId:part.materialId}
  })
}

export function generationDigest(provider,body,model=''){
  validateGenerationMode(body.generationMode)
  validateNativeSize(body.nativeSize)
  const components=validatePartFabrics(body)
  return createHash('sha256').update('isolated-fabrics-v2').update(body.generationMode || 'legacy').update(provider).update(model).update(body.materialId).update(body.nativeSize || 'default').update(body.imageData).update(body.maskData).update(body.regionData || '').update(JSON.stringify(components)).update(String(body.keepRest===true)).digest('hex')
}

export async function prepareGeneration(body,material,{maximumEdge=3840}={}){
  const {imageData,maskData,nativeSize}=body,components=validatePartFabrics(body)
  validateNativeSize(nativeSize)
  const input=imageBuffer(imageData,'Photograph');let mask=imageBuffer(maskData,'Selection mask')
  let photoInfo,maskInfo
  try{[photoInfo,maskInfo]=await Promise.all([decoder(input).metadata(),decoder(mask).metadata()])}
  catch{reject(400,'The photograph or selection mask is damaged. Upload the photograph again.')}
  if(!allowedFormats.has(photoInfo.format)||photoInfo.pages>1||maskInfo.pages>1)reject(400,'Use a single-frame PNG, JPEG or WebP photograph.')
  if(maskInfo.format!=='png'||!maskInfo.hasAlpha||maskInfo.width!==photoInfo.width||maskInfo.height!==photoInfo.height)reject(400,'The transparent selection mask must match the photograph exactly. Select the upholstery again.')
  let alpha=await decoder(mask).extractChannel('alpha').raw().toBuffer(),regionLabels
  if(components.length){
    const regions=imageBuffer(body.regionData,'Part selection map')
    let info,pixels
    try{info=await decoder(regions).metadata();pixels=await decoder(regions).ensureAlpha().raw().toBuffer()}
    catch{reject(400,'The part selection map could not be read. Outline the parts again.')}
    if(info.format!=='png'||info.pages>1||info.width!==photoInfo.width||info.height!==photoInfo.height||pixels.length!==alpha.length*4)reject(400,'The part selection map must match the photograph.')
    const rgbKey=(r,g,b)=>(r<<16)|(g<<8)|b
    const colors=new Map(REGION_COLORS.map((color,i)=>[rgbKey(...color),i])),counts=new Uint32Array(components.length)
    regionLabels=new Uint8Array(alpha.length)
    for(let p=0;p<alpha.length;p++){
      const i=p*4,label=colors.get(rgbKey(pixels[i],pixels[i+1],pixels[i+2]))
      if(pixels[i+3]!==255||label===undefined||label>components.length+1||(body.keepRest&&label===1))reject(400,'The part selection map contains an unknown region.')
      if(!label||alpha[p]>230)alpha[p]=255
      else{regionLabels[p]=label;if(label>1)counts[label-2]++}
    }
    if(counts.some(count=>count<16))reject(400,'Each part must cover visible selected upholstery. Adjust its outline before generating.')
    mask=await sharp({create:{width:photoInfo.width,height:photoInfo.height,channels:3,background:'#fff'}}).joinChannel(alpha,{raw:{width:photoInfo.width,height:photoInfo.height,channels:1}}).png().toBuffer()
  }
  let selected=0
  for(const value of alpha)selected+=1-value/255
  if(selected/alpha.length<(components.length ? .0004 : .005)||selected/alpha.length>.97)reject(400,'Select the upholstery while leaving the room unselected before generating.')
  const size=generationSize(photoInfo.width,photoInfo.height,maximumEdge)
  const image=await decoder(input).png().toBuffer()
  const [fabric,...partFabrics]=await Promise.all([material,...components.map(part=>catalogueMaterials.find(item=>item.id===part.materialId))].map(prepareFabric))
  return {image,input,mask,fabric,size,photoInfo,nativeSize,regionLabels,components:components.map((part,i)=>({...part,material:catalogueMaterials.find(item=>item.id===part.materialId),fabric:partFabrics[i]})),keepRest:body.keepRest===true}
}

async function prepareFabric(material){
  const cacheKey=`${material.id}:${material.textureImage || material.image}:${material.color}:${material.preserveTextureColor}`
  if(fabricCache.has(cacheKey)){const cached=fabricCache.get(cacheKey);fabricCache.delete(cacheKey);fabricCache.set(cacheKey,cached);return cached}
  const preparing=makeFabric(material).catch(error=>{fabricCache.delete(cacheKey);throw error})
  fabricCache.set(cacheKey,preparing)
  if(fabricCache.size>8)fabricCache.delete(fabricCache.keys().next().value)
  return preparing
}

async function makeFabric(material){
  // Inputs are bounded by the browser as well as by server-side decoding limits.
  const referencePath=material.textureImage || material.image
  if(!referencePath?.startsWith('/assets/'))reject(400,'This material has no usable fabric reference.')
  let fabric
  try{
    const reference=await fabricReference(referencePath)
    const raw=await decoder(reference).resize({width:768,height:768,fit:'inside',withoutEnlargement:true}).ensureAlpha().raw().toBuffer({resolveWithObject:true})
    if(!material.preserveTextureColor){
      const color=material.color.replace('#',''),rgb=[0,2,4].map(i=>parseInt(color.slice(i,i+2),16))
      let mean=0
      for(let i=0;i<raw.data.length;i+=4)mean+=raw.data[i]*.2126+raw.data[i+1]*.7152+raw.data[i+2]*.0722
      mean=Math.max(1,mean/(raw.data.length/4))
      for(let i=0;i<raw.data.length;i+=4){
        const luminance=(raw.data[i]*.2126+raw.data[i+1]*.7152+raw.data[i+2]*.0722)/mean
        const relief=Math.max(.55,Math.min(1.45,1+(luminance-1)*.4))
        for(let c=0;c<3;c++)raw.data[i+c]=Math.min(255,rgb[c]*relief)
      }
    }
    fabric=await sharp(raw.data,{raw:{width:raw.info.width,height:raw.info.height,channels:4}}).png().toBuffer()
  }catch{reject(503,'The selected fabric reference could not load. Choose another material or retry.')}
  return fabric
}

export function upholsteryPrompt(material){
  const profile=materialResponse(material)
  return `Edit image 1 only. Image 2 is a close-up reference swatch, not a pattern to paste across the image. Reupholster ONLY the furniture surfaces inside the transparent mask in ${material.name}, ${material.shade}, colour ${material.color}, ${material.type}. ${material.feel || ''} Surface response: ${profile.description}
Replace the original fabric completely. Reconstruct fitted material on every upholstered panel with realistic yarn or grain scale, perspective foreshortening, fabric tension, subtle folds and clean seams. The swatch is magnified: individual yarns should be fine at furniture scale. Preserve intentional patterns in the chosen fabric, but never make a giant repeating image-space grid. Remove the old upholstery texture, print and any cutout halos. Do not blend the new pattern over the old material.
Preserve the exact furniture silhouette, camera viewpoint, framing, cushion count and positions, piping, tufting, seams, upholstery panel boundaries and room. Preserve only structural details that already exist: never add tufting, buttoning, piping, panel divisions or seams. A smooth back must stay smooth. Do not copy folds or perspective from the close-up swatch. Keep bare timber, metal, feet and every non-upholstered object unchanged. Preserve the photograph's direction of illumination, realistic contact shadows, cushion occlusion and light falloff. Generate material-appropriate highlights, including velvet pile or leather reflections, while keeping dark cushion gaps dark. Do not flatten the shape or invent extra cushions. No text, logos, borders or watermark. Return a clean, photorealistic edit aligned to image 1.`
}

async function limitedJson(response,maxBytes=90_000_000){
  const chunks=[];let total=0
  for await(const chunk of response.body){total+=chunk.length;if(total>maxBytes)reject(502,'The AI result exceeded the image limit. Try another photograph.');chunks.push(chunk)}
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{reject(502,'The AI provider returned an unreadable response. Try again.')}
}

async function selectionGuide(prepared){
  const selection=await decoder(prepared.mask).extractChannel('alpha').raw().toBuffer()
  for(let p=0;p<selection.length;p++)selection[p]=255-selection[p]
  return sharp(selection,{raw:{width:prepared.photoInfo.width,height:prepared.photoInfo.height,channels:1}}).png().toBuffer()
}

function guidedPrompt(material,prepared){
  if(prepared.components?.length)reject(500,'Separate fabrics must be prepared as isolated edits.')
  return upholsteryPrompt(material).replace('inside the transparent mask','inside the white area of image 3')+'\nImage 3 is a strict selection guide: white means edit in the one fabric shown in image 2; black means preserve exactly, including other furniture panels. Never reproduce the guide in the output. This is an image edit, not a redesign. Preserve the entire framing of image 1 and every cushion and seam in its original position. Do not zoom, crop, move, reshape or restage the furniture. Return one photographic edit, not a swatch, illustration or rendered texture layer.'
}

export async function editWithPollinations(prepared,material,{key,signal,model=generationModel('pollinations',prepared.nativeSize),quality='high',fetchImpl=fetch}={}){
  const profile=pollinationsModelProfile(model),nativeSize=quality==='low'?'1K':prepared.nativeSize || '1K'
  if(!profile.nativeSizes.includes(nativeSize))reject(400,'This Pollinations model supports a 1K proof. Choose 1K, or configure a 4K editing model on the server.')
  const edge={'1K':1024,'2K':2048,'4K':4096}[nativeSize]
  const {width:sourceWidth,height:sourceHeight}=prepared.photoInfo
  const scale=Math.min(edge/Math.max(sourceWidth,sourceHeight),Math.sqrt(profile.maximumPixels/(sourceWidth*sourceHeight)))
  const width=Math.max(128,Math.floor(sourceWidth*scale/16)*16),height=Math.max(128,Math.floor(sourceHeight*scale/16)*16)
  const prompt=guidedPrompt(material,prepared),guide=await selectionGuide(prepared)
  // A compact photographic input and JPEG swatches avoid megabytes of PNG
  // texture transport; the original and exact mask stay intact for compositing.
  const [photo,swatch]=await Promise.all([
    decoder(prepared.input || prepared.image).resize({width:nativeSize==='1K'?1280:2048,height:nativeSize==='1K'?1280:2048,fit:'inside',withoutEnlargement:true}).flatten({background:'#f4f1eb'}).jpeg({quality:92,chromaSubsampling:'4:4:4'}).toBuffer(),
    decoder(prepared.fabric).jpeg({quality:90,chromaSubsampling:'4:4:4'}).toBuffer(),
  ])
  const jpeg=bytes=>({image_url:`data:image/jpeg;base64,${bytes.toString('base64')}`})
  const references=[jpeg(photo),jpeg(swatch),{image_url:`data:image/png;base64,${guide.toString('base64')}`}]
  let response
  try{
    response=await fetchImpl('https://gen.pollinations.ai/v1/images/edits',{
      method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},signal,
      // Models such as Klein reject `resolution`; the shared edits API accepts
      // exact pixel dimensions through `size` for these image models.
      body:JSON.stringify({model,prompt,image:references,size:`${width}x${height}`,quality,n:1,response_format:'b64_json'}),
    })
  }catch(error){if(signal?.aborted)throw error;reject(502,'The Pollinations connection was interrupted. Your original photograph is still available.')}
  if(!response.ok){
    // Never expose provider diagnostics, uploaded photographs or credentials.
    if(response.status===401)reject(503,'Pollinations rejected the API key. Reconnect a secret key beginning with sk_.')
    if(response.status===402)reject(402,'The Pollinations account or key has no available Pollen budget. Check its balance and key budget before generating again.')
    if(response.status===403)reject(503,'This Pollinations key cannot use the selected image model. Check its model permissions and account tier.')
    if(response.status===404)reject(503,'This Pollinations editing model is unavailable. Check POLLINATIONS_IMAGE_MODEL on the server.')
    if(response.status===429)reject(429,'Pollinations is limiting requests. Wait before starting another edit; no automatic paid retry was started.')
    if(response.status===400)reject(502,'Pollinations could not accept this image edit. Check the configured model or try a clearer photograph.')
    reject(502,'Pollinations could not finish this edit. Your original photograph is still available; retry later.')
  }
  const payload=await limitedJson(response),encoded=payload.data?.[0]?.b64_json
  if(typeof encoded!=='string'||encoded.length>85_000_000||!encoded.length)reject(502,'Pollinations did not return a usable image. Your original photograph is still available.')
  const bytes=Buffer.from(encoded,'base64')
  if(bytes.toString('base64')!==encoded)reject(502,'Pollinations returned an unreadable image. Your original is still available.')
  try{
    const metadata=await decoder(bytes).metadata()
    if(!allowedFormats.has(metadata.format)||metadata.pages>1||metadata.width<128||metadata.height<128||metadata.width*metadata.height>profile.maximumPixels)throw Error('Unsupported result')
    if(Math.abs(metadata.width/metadata.height-sourceWidth/sourceHeight)/(sourceWidth/sourceHeight)>.04)reject(502,'Pollinations changed the photograph’s framing. Your original is unchanged; try again with a tighter selection.')
    return {image:await decoder(bytes).png().toBuffer(),width:metadata.width,height:metadata.height,model}
  }catch(error){if(error.status)throw error;reject(502,'The Pollinations image could not be decoded. Your original photograph is still available.')}
}

export async function editWithOpenAI(prepared,material,{key,signal,owner,model='gpt-image-2.5-sunburst',quality='high',fetchImpl=fetch}={}){
  const dataUrl=buffer=>`data:image/png;base64,${buffer.toString('base64')}`
  let response
  try{
    response=await fetchImpl('https://api.openai.com/v1/images/edits',{
      method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},signal,
      body:JSON.stringify({model,images:[{image_url:dataUrl(prepared.image)},{image_url:dataUrl(prepared.fabric)}],mask:{image_url:dataUrl(prepared.mask)},prompt:upholsteryPrompt(material),quality,output_format:'png',size:`${prepared.size.width}x${prepared.size.height}`,n:1,safety_identifier:owner}),
    })
  }catch(error){if(signal?.aborted)throw error;reject(502,'The AI connection was interrupted. Your original photograph is still available.')}
  if(!response.ok){
    // Never send provider diagnostics, request bodies or credentials to customers.
    if(response.status===401)reject(503,'OpenAI rejected the API key. Reconnect it using the local AI connection page.')
    if(response.status===403)reject(503,'This API project does not have access to image editing. Check its model permissions.')
    if(response.status===429){
      const details=await limitedJson(response,16384).catch(()=>null)
      const code=details?.error?.code
      if(['insufficient_quota','billing_hard_limit_reached'].includes(code))reject(429,'This OpenAI API project has no available billing quota. Check its API credits and billing before generating again.')
      if(code==='rate_limit_exceeded')reject(429,'OpenAI is limiting requests for this model. Wait before starting another generation.')
      reject(429,'The AI project has reached its billing or rate limit. Check the API project and retry later.')
    }
    if(response.status===400)reject(502,'The AI provider could not edit this photograph. Try a clearer photo or a tighter upholstery selection.')
    reject(502,'The AI provider could not finish this edit. Your photograph is safe; retry when the connection is available.')
  }
  const payload=await limitedJson(response),encoded=payload.data?.[0]?.b64_json
  if(typeof encoded!=='string'||encoded.length>85_000_000)reject(502,'The AI provider did not return a usable image.')
  const image=Buffer.from(encoded,'base64')
  try{const metadata=await decoder(image).metadata();if(metadata.format!=='png')throw Error();return {image,width:metadata.width,height:metadata.height,model}}
  catch{reject(502,'The generated image could not be decoded. The original photograph is still available.')}
}

export function googleEditFrame(width,height){
  const ratios=[[1,1],[5,4],[4,3],[3,2],[16,9],[21,9],[4,5],[3,4],[2,3],[9,16],[9,21]]
  const [x,y]=ratios.sort((a,b)=>Math.abs(Math.log(width/height/(a[0]/a[1])))-Math.abs(Math.log(width/height/(b[0]/b[1]))))[0]
  const unit=Math.ceil(Math.max(width/x,height/y)),frameWidth=unit*x,frameHeight=unit*y
  return {width:frameWidth,height:frameHeight,left:Math.floor((frameWidth-width)/2),top:Math.floor((frameHeight-height)/2),aspectRatio:`${x}:${y}`}
}

export async function editWithGoogle(prepared,material,{key,signal,model=process.env.GOOGLE_IMAGE_MODEL || 'gemini-3.1-flash-image',quality='high',fetchImpl=fetch}={}){
  if(!/^[a-zA-Z0-9._-]+$/.test(model))reject(503,'Choose a valid Google image model on the server.')
  const prompt=guidedPrompt(material,prepared)+'\nPreserve the entire framing of image 1, including any narrow protective border.'
  const imageSize=quality==='low'?'1K':prepared.nativeSize || process.env.GOOGLE_IMAGE_SIZE || '1K'
  if(!['1K','2K','4K'].includes(imageSize))reject(503,'Choose 1K, 2K or 4K for GOOGLE_IMAGE_SIZE.')
  const selection=await decoder(prepared.mask).extractChannel('alpha').raw().toBuffer()
  for(let p=0;p<selection.length;p++)selection[p]=255-selection[p]
  const {width:sourceWidth,height:sourceHeight}=prepared.photoInfo,frame=googleEditFrame(sourceWidth,sourceHeight)
  const padding={left:frame.left,top:frame.top,right:frame.width-sourceWidth-frame.left,bottom:frame.height-sourceHeight-frame.top}
  const [photo,guide]=await Promise.all([
    decoder(prepared.image).extend({...padding,background:'#e8e6e2'}).png().toBuffer(),
    sharp(selection,{raw:{width:sourceWidth,height:sourceHeight,channels:1}}).extend({...padding,background:'#000'}).png().toBuffer(),
  ])
  const inline=bytes=>({inline_data:{mime_type:'image/png',data:bytes.toString('base64')}})
  let response
  try{
    response=await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,{
      method:'POST',headers:{'x-goog-api-key':key,'Content-Type':'application/json'},signal,
      body:JSON.stringify({contents:[{role:'user',parts:[{text:prompt},inline(photo),inline(prepared.fabric),inline(guide)]}],generationConfig:{responseModalities:['TEXT','IMAGE'],candidateCount:1,maxOutputTokens:8192,imageConfig:{imageSize,aspectRatio:frame.aspectRatio}}}),
    })
  }catch(error){if(signal?.aborted)throw error;reject(502,'The Google AI connection was interrupted. Your original photograph is still available.')}
  if(!response.ok){
    if([401,403].includes(response.status))reject(503,'Google rejected this connection. Check the Gemini API key, API restrictions and model access.')
    if(response.status===429)reject(429,'The Google API project has reached its quota, billing or rate limit. Check Google AI Studio before generating again.')
    if(response.status===404)reject(503,'This Google image model is unavailable for the project. Check GOOGLE_IMAGE_MODEL on the server.')
    if(response.status===400)reject(502,'Google could not accept this edit. Check the image model and API key restrictions, or try another photograph.')
    reject(502,'Google could not finish this edit. Your original photograph is still available.')
  }
  const payload=await limitedJson(response)
  const parts=payload.candidates?.[0]?.content?.parts || []
  const part=parts.find(item=>!item.thought&&(item.inlineData || item.inline_data))
  const data=part?.inlineData || part?.inline_data,mime=data?.mimeType || data?.mime_type
  if(!['image/png','image/jpeg','image/webp'].includes(mime)||typeof data?.data!=='string'||data.data.length>85_000_000)reject(502,'Google did not return an editable photograph. The request may have been filtered; try another image or selection.')
  const bytes=Buffer.from(data.data,'base64')
  if(bytes.toString('base64')!==data.data)reject(502,'Google returned an unreadable image. Your original is still available.')
  try{
    const metadata=await decoder(bytes).metadata()
    if(metadata.pages>1||metadata.width*metadata.height>20_000_000)throw new Error('Unsupported result')
    if(Math.abs(metadata.width/metadata.height-frame.width/frame.height)/(frame.width/frame.height)>.04)reject(502,'Google changed the photograph’s framing. Your original is unchanged; try again with a tighter selection.')
    const left=Math.round(frame.left/frame.width*metadata.width),top=Math.round(frame.top/frame.height*metadata.height)
    const width=Math.min(metadata.width-left,Math.round(sourceWidth/frame.width*metadata.width)),height=Math.min(metadata.height-top,Math.round(sourceHeight/frame.height*metadata.height))
    const image=await decoder(bytes).extract({left,top,width,height}).png().toBuffer()
    return {image,width,height,model}
  }catch(error){if(error.status)throw error;reject(502,'The Google image could not be decoded. Your original photograph is still available.')}
}

export async function compositeGeneration(prepared,generated){
  const alpha=await decoder(prepared.mask).extractChannel('alpha').raw().toBuffer()
  const labels=Uint8Array.from(alpha,value=>value<255?1:0),compositor=createFabricCompositor(prepared,labels)
  await compositor.add(generated,[1]);return compositor.finish()
}

export function createStudioGenerationService({getKey=getAiCredential,isConfigured=aiCredentialConfigured,getProvider=getAiProvider,edit,identify=identifyPartTypes,now=Date.now,timeoutMs=240000,maxActive=2,maxCachedBytes=128_000_000,quality='high',maximumEdge=3840,env=process.env}={}){
  if(!['low','high'].includes(quality)||!Number.isInteger(maximumEdge)||maximumEdge<1024||maximumEdge>3840)throw new TypeError('Choose a supported generation quality and edge limit.')
  const jobs=new Map(),ttl=15*60*1000
  const modelFor=(provider,nativeSize)=>generationModel(provider,nativeSize,env)
  const trim=()=>{for(const [id,job]of jobs)if(now()-job.created>ttl){job.abort.abort();jobs.delete(id)}}
  const publicJob=job=>({id:job.id,status:job.status,stage:job.stage,error:job.error,materialId:job.materialId,...(job.result || {})})
  const active=job=>['preparing','generating','finishing'].includes(job.status)
  async function planIdentification(){
    if(!await isConfigured({provider:'google'}))reject(503,'Part identification needs the server-only GEMINI_API_KEY connection. Manual part types remain available.')
    const model=env.GEMINI_PARTS_MODEL || PART_IDENTIFICATION_MODEL
    if(!/^[a-zA-Z0-9._-]+$/.test(model))reject(503,'Configure a valid GEMINI_PARTS_MODEL on the server.')
    return {provider:'google',model}
  }
  async function plan(body){
    const route=generationRoute(body,await getProvider(),env,quality)
    if(route.provider==='openai'&&body.components?.length)reject(400,'Separate-fabric editing requires the Pollinations or Google connection.')
    if(!await isConfigured({provider:route.provider}))reject(503,`${route.generationMode==='quick'?'Quick':route.generationMode==='realism'?'Realism':'AI editing'} is not connected. Configure the server-only ${aiProviderVariable(route.provider)} connection. No other provider was charged.`)
    return route
  }
  async function run(job,body,material,preparedInput){
    const timer=setTimeout(()=>job.abort.abort(),timeoutMs)
    try{
      const prepared=preparedInput || await prepareGeneration({...body,nativeSize:job.nativeSize},material,{maximumEdge})
      if(job.abort.signal.aborted)throw Error('cancelled')
      const key=await getKey({provider:job.provider})
      if(!key)reject(503,'Generative AI is not connected. Save your API key using the local connection page.')
      job.status='generating';job.stage='Reupholstering panels, seams and light with AI…'
      const adapter=edit || (job.provider==='pollinations'?editWithPollinations:job.provider==='google'?editWithGoogle:editWithOpenAI)
      const design=await untilAborted(editFabricRegions(prepared,material,adapter,{key,signal:job.abort.signal,owner:job.owner,model:job.model,quality},{onProgress:message=>{job.stage=message}}),job.abort.signal)
      if(job.abort.signal.aborted)throw Error('cancelled')
      job.status='finishing';job.stage='Protecting the room and preparing the clean result…'
      job.result=await design.finish()
      if(job.abort.signal.aborted)throw Error('cancelled')
      job.status='complete';job.stage='AI reupholstery is ready.'
      let bytes=[...jobs.values()].reduce((sum,item)=>sum+(item.result?.imageData?.length || 0),0)
      for(const item of jobs.values())if(bytes>maxCachedBytes&&item.id!==job.id&&item.result?.imageData){bytes-=item.result.imageData.length;item.result=null;item.status='expired';item.error='This temporary result has expired. Generate a new edit.'}
    }catch(error){
      job.result=null
      if(job.abort.signal.aborted){job.status=job.cancelled?'cancelled':'failed';job.error=job.cancelled?'AI edit cancelled.':'AI editing took too long. Your original is still here; retry later.'}
      else{job.status='failed';job.error=error.status?error.message:'The AI edit could not be prepared. Try a clearer photo or select the upholstery again.'}
    }finally{clearTimeout(timer)}
  }
  return {
    plan,
    planIdentification,
    async identify(owner,body,key,materials,{prepared:preparedInput,route}={}){
      trim()
      if(!/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(key || ''))reject(400,'Use a unique part identification reference.')
      const planned=route || await planIdentification(),material=materials.find(item=>item.id===body.materialId)
      if(!material)reject(400,'Choose a known fabric before identifying parts.')
      const prepared=preparedInput || await prepareGeneration(body,material,{maximumEdge})
      if(!prepared.components.length)reject(400,'Find sections or outline a pillow or cushion first.')
      const digest='identify-parts:'+generationDigest('google',body,planned.model),previous=[...jobs.values()].find(job=>job.owner===owner&&job.key===key)
      if(previous){if(previous.digest!==digest)reject(409,'This request belongs to another photograph or operation.');return publicJob(previous)}
      if(jobs.size>=200||[...jobs.values()].filter(active).length>=maxActive||[...jobs.values()].some(job=>job.owner===owner&&active(job)))reject(429,'An AI operation is already running. Wait for it to finish.')
      const job={id:randomUUID(),owner,key,digest,abort:new AbortController(),created:now(),status:'generating',stage:'Identifying pillows, cushions and the main furniture…'}
      jobs.set(job.id,job)
      void (async()=>{
        const timer=setTimeout(()=>job.abort.abort(),60000)
        try{
          const key=await getKey({provider:'google'});if(!key)reject(503,'Gemini part identification is not connected.')
          const result=await untilAborted(identify(prepared,{key,model:planned.model,signal:job.abort.signal}),job.abort.signal)
          if(job.abort.signal.aborted)throw Error('cancelled')
          job.result={...result,operation:'identify-parts'};job.status='complete';job.stage='Furniture parts identified. Review each name and outline.'
        }catch(error){job.result=null;job.status=job.cancelled?'cancelled':'failed';job.error=job.abort.signal.aborted?'Part identification stopped. Your outlines and fabrics are unchanged; started analysis may still use credits.':error.status?error.message:'Part identification could not finish. Choose the types manually.'}
        finally{clearTimeout(timer)}
      })()
      return publicJob(job)
    },
    async capabilities(){
      const provider=await getProvider(),model=modelFor(provider),details=provider==='pollinations'?pollinationsDetails(env):null
      const modes=await Promise.all(Object.entries(GENERATION_MODES).map(async([id,definition])=>{
        const route=generationRoute({generationMode:id},provider,env,quality),configured=await isConfigured({provider:route.provider})
        return {id,label:definition.label,provider:aiProviderName(route.provider),model:route.model,configured,defaultSize:route.nativeSize,supportedNativeSizes:quality==='low'?['1K']:definition.sizes,maximumParts:MAX_PARTS,setupMessage:configured?undefined:`${definition.label} is unavailable. Add the server-only ${aiProviderVariable(route.provider)} connection.`}
      }))
      return {configured:await isConfigured({provider}),provider:aiProviderName(provider),model,quality,modes,partIdentification:{configured:await isConfigured({provider:'google'}),provider:'Google Gemini',model:env.GEMINI_PARTS_MODEL || PART_IDENTIFICATION_MODEL,photosSentOnRequest:true,cushionOnly:true,automaticByDefault:false},partSelectionMode:'cushions-and-main',defaultGenerationMode:'quick',supportedNativeSizes:details?.map(item=>item.size) || ['1K','2K','4K'],detailModels:details,maximumParts:provider==='openai'?0:MAX_PARTS,separateFabricMode:'isolated-edits',maximumFabricEdits:MAX_PARTS+1,requestedNativeSize:provider==='pollinations'?'1K':provider==='google'?(quality==='low'?'1K':env.GOOGLE_IMAGE_SIZE || '1K'):undefined,retentionMinutes:15,maximumNativePixels:provider==='openai'?Math.min(8_294_400,maximumEdge*maximumEdge):20_000_000,maximumNativeEdge:provider==='openai'?maximumEdge:6144,photosSentOnRequest:true}
    },
    async start(owner,body,key,materials,{prepared:preparedInput,route:plannedRoute}={}){
      trim()
      if(!/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(key || ''))reject(400,'Use a unique generation request reference.')
      const material=materials.find(item=>item.id===body.materialId)
      if(!material)reject(400,'Choose a known fabric before generating.')
      imageBuffer(body.imageData,'Photograph');imageBuffer(body.maskData,'Selection mask')
      const route=plannedRoute || await plan(body),{provider,model,nativeSize}=route
      const digest=generationDigest(provider,body,model)
      const previous=[...jobs.values()].find(job=>job.owner===owner&&job.key===key)
      if(previous){if(previous.digest!==digest)reject(409,'This generation reference belongs to another edit. Start a new generation.');return publicJob(previous)}
      if([...jobs.values()].filter(active).length>=maxActive||[...jobs.values()].some(job=>job.owner===owner&&active(job)))reject(429,'An AI edit is already running. Wait for it to finish before starting another.')
      if(jobs.size>=200)reject(429,'The AI studio is busy. Please try again later.')
      const job={id:randomUUID(),owner,key,digest,provider,model,nativeSize,generationMode:route.generationMode,materialId:body.materialId,created:now(),abort:new AbortController(),status:'preparing',stage:'Preparing the original photograph and fabric reference…'}
      jobs.set(job.id,job);void run(job,body,material,preparedInput)
      return publicJob(job)
    },
    get(owner,id){trim();const job=jobs.get(id);if(!job||job.owner!==owner)reject(404,'This AI edit is unavailable or has expired.');return publicJob(job)},
    cancel(owner,id){const job=jobs.get(id);if(!job||job.owner!==owner)reject(404,'This AI edit is unavailable.');if(active(job)){job.cancelled=true;job.abort.abort();job.status='cancelled';job.stage='AI edit cancelled.'}return publicJob(job)},
    dispose(){for(const job of jobs.values())job.abort.abort();jobs.clear()},
  }
}
