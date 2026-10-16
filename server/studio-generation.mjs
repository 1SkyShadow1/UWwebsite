import { createHash, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import sharp from 'sharp'
import { materialResponse } from '../src/studio/material-response.js'
import { getAiCredential, aiCredentialConfigured } from './ai-credentials.mjs'

export class StudioGenerationError extends Error {
  constructor(status,message){super(message);this.status=status}
}
const reject=(status,message)=>{throw new StudioGenerationError(status,message)}
const allowedFormats=new Set(['png','jpeg','webp'])

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

async function fabricReference(path){
  for(const directory of ['public','dist']){
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

export async function prepareGeneration({imageData,maskData},material,{maximumEdge=3840}={}){
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
  return {image,mask,fabric,size,photoInfo}
}

export function upholsteryPrompt(material){
  const profile=materialResponse(material)
  return `Edit image 1 only. Image 2 is a close-up reference swatch, not a pattern to paste across the image. Reupholster ONLY the furniture surfaces inside the transparent mask in ${material.name}, ${material.shade}, colour ${material.color}, ${material.type}. ${material.feel || ''} Surface response: ${profile.description}
Replace the original fabric completely. Reconstruct fitted material on every upholstered panel with realistic yarn or grain scale, perspective foreshortening, fabric tension, subtle folds and clean seams. The swatch is magnified: individual yarns should be fine at furniture scale. Preserve intentional patterns in the chosen fabric, but never make a giant repeating image-space grid. Remove the old upholstery texture, print and any cutout halos. Do not blend the new pattern over the old material.
Preserve the exact furniture silhouette, camera viewpoint, framing, cushion count and positions, piping, tufting, seams, upholstery panel boundaries and room. Keep bare timber, metal, feet and every non-upholstered object unchanged. Preserve the photograph's direction of illumination, realistic contact shadows, cushion occlusion and light falloff. Generate material-appropriate highlights, including velvet pile or leather reflections, while keeping dark cushion gaps dark. Do not flatten the shape or invent extra cushions. No text, logos, borders or watermark. Return a clean, photorealistic edit aligned to image 1.`
}

async function limitedJson(response,maxBytes=90_000_000){
  const chunks=[];let total=0
  for await(const chunk of response.body){total+=chunk.length;if(total>maxBytes)reject(502,'The AI result exceeded the image limit. Try another photograph.');chunks.push(chunk)}
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{reject(502,'The AI provider returned an unreadable response. Try again.')}
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

export async function compositeGeneration(prepared,generated){
  const {width,height}=generated
  if(width*height>16_000_000||width<128||height<128)reject(502,'The AI returned an unsupported image size.')
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

export function createStudioGenerationService({getKey=getAiCredential,isConfigured=aiCredentialConfigured,edit=editWithOpenAI,now=Date.now,timeoutMs=240000,maxActive=2,maxCachedBytes=128_000_000,quality='high',maximumEdge=3840}={}){
  if(!['low','high'].includes(quality)||!Number.isInteger(maximumEdge)||maximumEdge<1024||maximumEdge>3840)throw new TypeError('Choose a supported generation quality and edge limit.')
  const jobs=new Map(),ttl=15*60*1000
  const model=process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2.5-sunburst'
  const trim=()=>{for(const [id,job]of jobs)if(now()-job.created>ttl){job.abort.abort();jobs.delete(id)}}
  const publicJob=job=>({id:job.id,status:job.status,stage:job.stage,error:job.error,materialId:job.materialId,...(job.result || {})})
  const active=job=>['preparing','generating','finishing'].includes(job.status)
  async function run(job,body,material){
    const timer=setTimeout(()=>job.abort.abort(),timeoutMs)
    try{
      const prepared=await prepareGeneration(body,material,{maximumEdge})
      if(job.abort.signal.aborted)throw Error('cancelled')
      const key=await getKey()
      if(!key)reject(503,'Generative AI is not connected. Save your API key using the local connection page.')
      job.status='generating';job.stage='Reupholstering panels, seams and light with AI…'
      const generated=await untilAborted(edit(prepared,material,{key,signal:job.abort.signal,owner:job.owner,model,quality}),job.abort.signal)
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
    async capabilities(){return {configured:await isConfigured(),provider:'OpenAI',model,quality,retentionMinutes:15,maximumNativePixels:Math.min(8_294_400,maximumEdge*maximumEdge),maximumNativeEdge:maximumEdge,photosSentOnRequest:true}},
    async start(owner,body,key,materials){
      trim()
      if(!/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(key || ''))reject(400,'Use a unique generation request reference.')
      const material=materials.find(item=>item.id===body.materialId)
      if(!material)reject(400,'Choose a known fabric before generating.')
      imageBuffer(body.imageData,'Photograph');imageBuffer(body.maskData,'Selection mask')
      const digest=createHash('sha256').update(body.materialId).update(body.imageData).update(body.maskData).digest('hex')
      const configured=await isConfigured()
      const previous=[...jobs.values()].find(job=>job.owner===owner&&job.key===key)
      if(previous){if(previous.digest!==digest)reject(409,'This generation reference belongs to another edit. Start a new generation.');return publicJob(previous)}
      if(!configured)reject(503,'Generative AI is not connected. Save your API key using the local connection page.')
      if([...jobs.values()].filter(active).length>=maxActive||[...jobs.values()].some(job=>job.owner===owner&&active(job)))reject(429,'An AI edit is already running. Wait for it to finish before starting another.')
      if(jobs.size>=200)reject(429,'The AI studio is busy. Please try again later.')
      const job={id:randomUUID(),owner,key,digest,materialId:body.materialId,created:now(),abort:new AbortController(),status:'preparing',stage:'Preparing the original photograph and fabric reference…'}
      jobs.set(job.id,job);void run(job,body,material)
      return publicJob(job)
    },
    get(owner,id){trim();const job=jobs.get(id);if(!job||job.owner!==owner)reject(404,'This AI edit is unavailable or has expired.');return publicJob(job)},
    cancel(owner,id){const job=jobs.get(id);if(!job||job.owner!==owner)reject(404,'This AI edit is unavailable.');if(active(job)){job.cancelled=true;job.abort.abort();job.status='cancelled';job.stage='AI edit cancelled.'}return publicJob(job)},
    dispose(){for(const job of jobs.values())job.abort.abort();jobs.clear()},
  }
}
