import { mkdir, writeFile, readFile, access } from 'node:fs/promises'
import { dirname } from 'node:path'
import { createHash } from 'node:crypto'
import sharp from 'sharp'

async function download(url,path){
  const response=await fetch(url,{signal:AbortSignal.timeout(120000)})
  if(!response.ok)throw new Error(`Could not download ${path}: HTTP ${response.status}`)
  await mkdir(dirname(path),{recursive:true});const bytes=Buffer.from(await response.arrayBuffer());await writeFile(path,bytes);return bytes
}
const modelRoot='public/models/depth-anything-v2-small'
for(const file of ['config.json','preprocessor_config.json','onnx/model_quantized.onnx']){
  const path=`${modelRoot}/${file}`
  try{await access(path)}catch{await download(`https://huggingface.co/onnx-community/depth-anything-v2-small/resolve/main/${file}`,path)}
}
await download('https://raw.githubusercontent.com/DepthAnything/Depth-Anything-V2/main/LICENSE',`${modelRoot}/LICENSE.txt`)
const weights=await readFile(`${modelRoot}/onnx/model_quantized.onnx`)
await writeFile(`${modelRoot}/provenance.json`,JSON.stringify({source:'https://huggingface.co/onnx-community/depth-anything-v2-small',license:'Apache-2.0',sha256:createHash('sha256').update(weights).digest('hex'),bytes:weights.length},null,2))

const manifest={}
for(const asset of ['brown_leather','velour_velvet','rough_linen']){
  const response=await fetch(`https://api.polyhaven.com/files/${asset}`,{signal:AbortSignal.timeout(30000)})
  if(!response.ok)throw new Error(`Could not read the Poly Haven manifest for ${asset}.`)
  const files=await response.json(),entry={source:`https://polyhaven.com/a/${asset}`,license:'CC0',resolution:2048}
  let reference
  for(const [channel,pattern] of [['color',/^(diff|albedo|base)/i],['normal',/^nor_gl$/i],['roughness',/^rough/i]]){
    const key=Object.keys(files).find(name=>pattern.test(name))
    const variants=files[key]?.['2k'],file=variants?.jpg || variants?.png
    if(!file?.url)throw new Error(`A matched 2K ${channel} map is unavailable for ${asset}.`)
    const target=`public/assets/studio-hd/${asset}-${channel}.jpg`
    const upstream=await fetch(file.url,{signal:AbortSignal.timeout(60000)});if(!upstream.ok)throw new Error(`Could not read ${file.url}`)
    const bytes=Buffer.from(await upstream.arrayBuffer());if(file.md5&&createHash('md5').update(bytes).digest('hex')!==file.md5)throw new Error(`Texture integrity check failed for ${asset}/${channel}`);await mkdir(dirname(target),{recursive:true})
    let image=sharp(bytes).resize({width:2048,height:2048,fit:'inside',withoutEnlargement:true})
    const prepared=await image.toBuffer(),metadata=await sharp(prepared).metadata()
    if(!reference)reference={width:metadata.width,height:metadata.height}
    else if(Math.abs(metadata.width-reference.width)>2||Math.abs(metadata.height-reference.height)>2)throw new Error(`The texture channels for ${asset} have incompatible dimensions.`)
    // Preserve the non-square source; register occasional one-pixel channel
    // rounding differences to the colour map's exact UV frame.
    await sharp(prepared).resize({...reference,fit:'fill'}).jpeg({quality:94,chromaSubsampling:'4:4:4'}).toFile(target)
    entry[channel]=target.replace('public','')
  }
  manifest[`/assets/textures/${asset}.jpg`]=entry
  console.log(`${asset}: matched 2K maps prepared`)
}
await writeFile('src/data/studio-hd-textures.json',JSON.stringify(manifest,null,2)+'\n')
console.log('Studio model, licensing and HD texture manifest are ready.')
