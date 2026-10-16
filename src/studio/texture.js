import { photoMaterialResponse } from './material-response.js'
import hdTextures from '../data/studio-hd-textures.json'

export function buildTintedPatternCanvas(image, size, material) {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1,Math.round(size))
  canvas.height = Math.max(1,Math.round(size * (image.height || 1) / (image.width || 1)))
  const context = canvas.getContext('2d', { willReadFrequently:true })
  context.drawImage(image,0,0,canvas.width,canvas.height)
  if (material.preserveTextureColor) return canvas
  const hex = material.color.replace('#','')
  const color = hex.length===3 ? hex.split('').map(c=>c+c).join('') : hex
  const rgb = [0,2,4].map(i=>parseInt(color.slice(i,i+2),16))
  const pixels = context.getImageData(0,0,canvas.width,canvas.height), data=pixels.data
  let total=0
  for(let i=0;i<data.length;i+=4) total+=data[i]*.2126+data[i+1]*.7152+data[i+2]*.0722
  const mean=Math.max(20,total/(data.length/4)), response=photoMaterialResponse(material)
  for(let i=0;i<data.length;i+=4){
    const lum=(data[i]*.2126+data[i+1]*.7152+data[i+2]*.0722)/mean
    const relief=Math.max(.6,Math.min(1.4,1+(lum-1)*response.albedoContrast))
    for(let c=0;c<3;c++)data[i+c]=Math.min(255,rgb[c]*relief)
  }
  context.putImageData(pixels,0,0)
  return canvas
}

export async function loadMaterialImages(material) {
  const load = async url => {
    if(!url)return null
    const image=new Image();image.crossOrigin='anonymous';image.src=url
    await image.decode()
    return image
  }
  const hd=hdTextures[material.textureImage || material.image]
  const loadWithFallback=(preferred,fallback)=>load(preferred || fallback).catch(()=>preferred&&fallback?load(fallback):null)
  const results=await Promise.allSettled([loadWithFallback(hd?.color,material.textureImage || material.image),loadWithFallback(hd?.normal,material.pbr?.normal),loadWithFallback(hd?.roughness,material.pbr?.roughness)])
  if(results[0].status==='rejected'||!results[0].value)throw new Error('This fabric image could not load. Choose another fabric or retry.')
  return { color:buildTintedPatternCanvas(results[0].value,Math.min(2048,results[0].value.width),material), normal:results[1].status==='fulfilled'?results[1].value:null, roughness:results[2].status==='fulfilled'?results[2].value:null }
}
