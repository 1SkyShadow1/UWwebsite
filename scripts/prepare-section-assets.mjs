import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { createHash } from 'node:crypto'

const revision='5850ab45f587c112167512ffef949107115e26a0',root='public/models/slimsam-77-uniform'
const manifest={source:'https://huggingface.co/Xenova/slimsam-77-uniform',revision,license:'Apache-2.0',files:{}}
const hashes={
  'onnx/vision_encoder_quantized.onnx':'cce23c7b2e5d4f330932738fb67ba518e04b0d99ccdd1cccd22a7da4e01f2971',
  'onnx/prompt_encoder_mask_decoder_quantized.onnx':'cb90b279f549d2cab7fd6e20c38522438c65d84bdcca3d2a764cff7d857fdce2',
}
async function download(url,path,expected){
  let bytes
  try{bytes=await readFile(path)}catch(error){if(error.code!=='ENOENT')throw error}
  if(!bytes){const response=await fetch(url,{signal:AbortSignal.timeout(120000)});if(!response.ok)throw new Error(`Model download failed: HTTP ${response.status}`);bytes=Buffer.from(await response.arrayBuffer())}
  const sha256=createHash('sha256').update(bytes).digest('hex')
  if(expected&&sha256!==expected)throw new Error(`Model integrity check failed: ${path}`)
  await mkdir(dirname(path),{recursive:true});await writeFile(path,bytes)
  return {source:url,bytes:bytes.length,sha256}
}
for(const file of ['config.json','preprocessor_config.json',...Object.keys(hashes)])manifest.files[file]=await download(`https://huggingface.co/Xenova/slimsam-77-uniform/resolve/${revision}/${file}`,`${root}/${file}`,hashes[file])
await download('https://raw.githubusercontent.com/czg1225/SlimSAM/master/LICENSE',`${root}/LICENSE.txt`)
await writeFile(`${root}/provenance.json`,JSON.stringify(manifest,null,2)+'\n')
const detector=await download('https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/int8/1/efficientdet_lite0.tflite','public/models/furniture-detector.tflite','0720bf247bd76e6594ea28fa9c6f7c5242be774818997dbbeffc4da460c723bb')
await writeFile('public/models/furniture-detector.provenance.json',JSON.stringify({...detector,documentation:'https://developers.google.com/edge/mediapipe/solutions/vision/object_detector',purpose:'Local COCO chair, couch and bed anchoring before upholstery segmentation'},null,2)+'\n')
console.log('Local section and furniture detection assets verified.')
