import { createHash, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import sharp from 'sharp'
import { materialResponse } from '../src/studio/material-response.js'
import { getAiCredential, aiCredentialConfigured, getAiProvider } from './ai-credentials.mjs'
import { aiProviderName } from './ai-providers.mjs'

export class StudioGenerationError extends Error {
  constructor(status,message){super(message);this.status=status}
}
const reject=(status,message)=>{throw new StudioGenerationError(status,message)}
const allowedFormats=new Set(['png','jpeg','webp'])
const pollinationsModels=Object.freeze({
  'black-forest-labs/flux.2-klein-4b':{nativeSizes:['1K'],maximumPixels:2_400_000},
  'black-forest-labs/flux-3-image-klein':{nativeSizes:['1K','2K','4K'],maximumPixels:20_000_000},
  'google/gemini-3.1-flash-image':{nativeSizes:['1K','2K','4K'],maximumPixels:20_000_000},
})
const defaultPollinationsModel='black-forest-labs/flux.2-klein-4b'
export function pollinationsModelProfile(model=defaultPollinationsModel){
  const profile=Object.hasOwn(pollinationsModels,model)?pollinationsModels[model]:null
  if(!profile)reject(503,'Choose a supported multi-reference editing model for POLLINATIONS_IMAGE_MODEL. See the deployment guide.')
  return profile
}

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

export function generationDigest(provider,body){
  validateNativeSize(body.nativeSize)
  return createHash('sha256').update(provider).update(body.materialId).update(body.nativeSize || 'default').update(body.imageData).update(body.maskData).digest('hex')
}

export async function prepareGeneration({imageData,maskData,nativeSize},material,{maximumEdge=3840}={}){
  validateNativeSize(nativeSize)
  const input=imageBuffer(imageData,'Photograph'),mask=imageBuffer(maskData,'Selection mask')
  let photoInfo,maskInfo
  try{[photoInfo,maskInfo]=await Promise.all([decoder(input).metadata(),decoder(mask).metadata()])}
  catch{reject(400,'The photograph or selection mask is damaged. Upload the photograph again.')}
  if(!allowedFormats.has(photoInfo.format)||photoInfo.pages>1||maskInfo.pages>1)reject(400,'Use a single-frame PNG, JPEG or WebP photograph.')
  if(maskInfo.format!=='png'||!maskInfo.hasAlpha||maskInfo.width!==photoInfo.width||maskInfo.height!==photoInfo.height)reject(400,'The transparent selection mask must match the photograph exactly. Select the upholstery again.')
  const alpha=await decoder(mask).extractChannel('alpha').raw().toBuffer()
  let selected=0
  for(const value of alpha)selected+=1-value/255
  if(selected/alpha.length<.005||selected/alpha.length>.97)reject(400,'Select the upholstery while leaving the room unselected before generating.')
  const size=generationSize(photoInfo.width,photoInfo.height,maximumEdge)
  const image=await decoder(input).png().toBuffer()
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
  return {image,mask,fabric,size,photoInfo,nativeSize}
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

const guidedPrompt=material=>upholsteryPrompt(material).replace('inside the transparent mask','inside the white area of image 3')+'\nImage 3 is a selection guide only: white means upholstery to replace, black means protected room. Never reproduce the guide in the output. This is an image edit, not a redesign. Preserve the entire framing of image 1 and every cushion and seam in its original position. Do not zoom, crop, move, reshape or restage the furniture. Return one photographic edit, not a swatch, illustration or rendered texture layer.'

export async function editWithPollinations(prepared,material,{key,signal,model=process.env.POLLINATIONS_IMAGE_MODEL || defaultPollinationsModel,quality='high',fetchImpl=fetch}={}){
  const profile=pollinationsModelProfile(model),nativeSize=quality==='low'?'1K':prepared.nativeSize || '1K'
  if(!profile.nativeSizes.includes(nativeSize))reject(400,'This Pollinations model supports a 1K proof. Choose 1K, or configure a 4K editing model on the server.')
  const edge={'1K':1024,'2K':2048,'4K':4096}[nativeSize]
  const {width:sourceWidth,height:sourceHeight}=prepared.photoInfo
  const scale=Math.min(edge/Math.max(sourceWidth,sourceHeight),Math.sqrt(profile.maximumPixels/(sourceWidth*sourceHeight)))
  const width=Math.max(128,Math.floor(sourceWidth*scale/16)*16),height=Math.max(128,Math.floor(sourceHeight*scale/16)*16)
  const dataUrl=bytes=>({image_url:`data:image/png;base64,${bytes.toString('base64')}`})
  const guide=await selectionGuide(prepared)
  let response
  try{
    response=await fetchImpl('https://gen.pollinations.ai/v1/images/edits',{
      method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},signal,
      // Models such as Klein reject `resolution`; the shared edits API accepts
      // exact pixel dimensions through `size` for these image models.
      body:JSON.stringify({model,prompt:guidedPrompt(material),image:[dataUrl(prepared.image),dataUrl(prepared.fabric),dataUrl(guide)],size:`${width}x${height}`,quality,n:1,response_format:'b64_json'}),
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
  const prompt=upholsteryPrompt(material).replace('inside the transparent mask','inside the white area of image 3')+'\nImage 3 is a selection guide only: white means upholstery to replace, black means protected room. Never reproduce the guide in the output. This is an image edit, not a redesign: keep every cushion and seam at its exact original pixel position. Preserve the entire framing of image 1, including any narrow protective border. Do not zoom, crop, move, reshape or restage the furniture. Return one photographic edit, not a swatch, illustration or rendered texture layer.'
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
  const {width,height}=generated
  if(width*height>20_000_000||width<128||height<128)reject(502,'The AI returned an unsupported image size.')
  if(Math.abs(width/height-prepared.photoInfo.width/prepared.photoInfo.height)/(prepared.photoInfo.width/prepared.photoInfo.height)>.04)reject(502,'The AI changed the framing too much. Refine the selection and try again.')
  // Preserve the actual room. Only the newly generated upholstery is composited;
  // no texture overlay, source shading multiplication or shader touches it.
  // Extract and invert explicitly: Sharp can reorder channel extraction relative
  // to negate/removeAlpha, which otherwise reverses the protected room mask.
  const inverted=await decoder(prepared.mask).extractChannel('alpha').raw().toBuffer()
  for(let p=0;p<inverted.length;p++)inverted[p]=255-inverted[p]
  const alpha=await sharp(inverted,{raw:{width:prepared.photoInfo.width,height:prepared.photoInfo.height,channels:1}}).resize(width,height,{fit:'fill'}).blur(.5).toColourspace('b-w').raw().toBuffer()
  const rgb=await decoder(generated.image).toColourspace('srgb').removeAlpha().raw().toBuffer(),rgba=Buffer.alloc(width*height*4)
  for(let p=0;p<alpha.length;p++){rgba[p*4]=rgb[p*3];rgba[p*4+1]=rgb[p*3+1];rgba[p*4+2]=rgb[p*3+2];rgba[p*4+3]=alpha[p]}
  const foreground=await sharp(rgba,{raw:{width,height,channels:4}}).png().toBuffer()
  const result=await decoder(prepared.image).resize(width,height,{fit:'fill'}).composite([{input:foreground}]).png().toBuffer()
  return {imageData:`data:image/png;base64,${result.toString('base64')}`,width,height,nativeWidth:width,nativeHeight:height,model:generated.model}
}

export function createStudioGenerationService({getKey=getAiCredential,isConfigured=aiCredentialConfigured,getProvider=getAiProvider,edit,now=Date.now,timeoutMs=240000,maxActive=2,maxCachedBytes=128_000_000,quality='high',maximumEdge=3840,env=process.env}={}){
  if(!['low','high'].includes(quality)||!Number.isInteger(maximumEdge)||maximumEdge<1024||maximumEdge>3840)throw new TypeError('Choose a supported generation quality and edge limit.')
  const jobs=new Map(),ttl=15*60*1000
  const modelFor=provider=>provider==='pollinations'?(env.POLLINATIONS_IMAGE_MODEL || defaultPollinationsModel):provider==='google'?(env.GOOGLE_IMAGE_MODEL || 'gemini-3.1-flash-image'):(env.OPENAI_IMAGE_MODEL || 'gpt-image-2.5-sunburst')
  const trim=()=>{for(const [id,job]of jobs)if(now()-job.created>ttl){job.abort.abort();jobs.delete(id)}}
  const publicJob=job=>({id:job.id,status:job.status,stage:job.stage,error:job.error,materialId:job.materialId,...(job.result || {})})
  const active=job=>['preparing','generating','finishing'].includes(job.status)
  async function run(job,body,material){
    const timer=setTimeout(()=>job.abort.abort(),timeoutMs)
    try{
      const prepared=await prepareGeneration(body,material,{maximumEdge})
      if(job.abort.signal.aborted)throw Error('cancelled')
      const key=await getKey({provider:job.provider})
      if(!key)reject(503,'Generative AI is not connected. Save your API key using the local connection page.')
      job.status='generating';job.stage='Reupholstering panels, seams and light with AI…'
      const adapter=edit || (job.provider==='pollinations'?editWithPollinations:job.provider==='google'?editWithGoogle:editWithOpenAI)
      const generated=await untilAborted(adapter(prepared,material,{key,signal:job.abort.signal,owner:job.owner,model:modelFor(job.provider),quality}),job.abort.signal)
      if(job.abort.signal.aborted)throw Error('cancelled')
      job.status='finishing';job.stage='Protecting the room and preparing the clean result…'
      job.result=await compositeGeneration(prepared,generated)
      if(job.abort.signal.aborted)throw Error('cancelled')
      job.status='complete';job.stage='AI reupholstery is ready.'
      let bytes=[...jobs.values()].reduce((sum,item)=>sum+(item.result?.imageData.length || 0),0)
      for(const item of jobs.values())if(bytes>maxCachedBytes&&item.id!==job.id&&item.result){bytes-=item.result.imageData.length;item.result=null;item.status='expired';item.error='This temporary result has expired. Generate a new edit.'}
    }catch(error){
      job.result=null
      if(job.abort.signal.aborted){job.status=job.cancelled?'cancelled':'failed';job.error=job.cancelled?'AI edit cancelled.':'AI editing took too long. Your original is still here; retry later.'}
      else{job.status='failed';job.error=error.status?error.message:'The AI edit could not be prepared. Try a clearer photo or select the upholstery again.'}
    }finally{clearTimeout(timer)}
  }
  return {
    async capabilities(){
      const provider=await getProvider(),model=modelFor(provider)
      const profile=provider==='pollinations'?pollinationsModelProfile(model):null
      return {configured:await isConfigured(),provider:aiProviderName(provider),model,quality,supportedNativeSizes:profile?.nativeSizes || ['1K','2K','4K'],requestedNativeSize:provider==='pollinations'?'1K':provider==='google'?(quality==='low'?'1K':env.GOOGLE_IMAGE_SIZE || '1K'):undefined,retentionMinutes:15,maximumNativePixels:profile?.maximumPixels || (provider==='google'?20_000_000:Math.min(8_294_400,maximumEdge*maximumEdge)),maximumNativeEdge:profile?(profile.nativeSizes.includes('4K')?4096:1024):provider==='google'?6144:maximumEdge,photosSentOnRequest:true}
    },
    async start(owner,body,key,materials){
      trim()
      if(!/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(key || ''))reject(400,'Use a unique generation request reference.')
      const material=materials.find(item=>item.id===body.materialId)
      if(!material)reject(400,'Choose a known fabric before generating.')
      imageBuffer(body.imageData,'Photograph');imageBuffer(body.maskData,'Selection mask')
      const provider=await getProvider()
      if(provider==='pollinations'&&!pollinationsModelProfile(modelFor(provider)).nativeSizes.includes(quality==='low'?'1K':body.nativeSize || '1K'))reject(400,'Choose a supported AI image detail for the connected Pollinations model.')
      const digest=generationDigest(provider,body)
      const configured=await isConfigured()
      const previous=[...jobs.values()].find(job=>job.owner===owner&&job.key===key)
      if(previous){if(previous.digest!==digest)reject(409,'This generation reference belongs to another edit. Start a new generation.');return publicJob(previous)}
      if(!configured)reject(503,'Generative AI is not connected. Save your API key using the local connection page.')
      if([...jobs.values()].filter(active).length>=maxActive||[...jobs.values()].some(job=>job.owner===owner&&active(job)))reject(429,'An AI edit is already running. Wait for it to finish before starting another.')
      if(jobs.size>=200)reject(429,'The AI studio is busy. Please try again later.')
      const job={id:randomUUID(),owner,key,digest,provider,materialId:body.materialId,created:now(),abort:new AbortController(),status:'preparing',stage:'Preparing the original photograph and fabric reference…'}
      jobs.set(job.id,job);void run(job,body,material)
      return publicJob(job)
    },
    get(owner,id){trim();const job=jobs.get(id);if(!job||job.owner!==owner)reject(404,'This AI edit is unavailable or has expired.');return publicJob(job)},
    cancel(owner,id){const job=jobs.get(id);if(!job||job.owner!==owner)reject(404,'This AI edit is unavailable.');if(active(job)){job.cancelled=true;job.abort.abort();job.status='cancelled';job.stage='AI edit cancelled.'}return publicJob(job)},
    dispose(){for(const job of jobs.values())job.abort.abort();jobs.clear()},
  }
}
