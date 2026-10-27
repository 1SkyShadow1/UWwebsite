import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { materials } from '../src/data/materials.js'
import { furnitureForms } from '../src/data/furniture.js'
import { shopProducts } from '../src/data/shop-products.js'
import { showroomPhotos } from '../src/data/showroom-photos.js'

const references = new Set([...materials, ...furnitureForms, ...shopProducts].flatMap(item => [item.image, item.textureImage, item.pbr?.normal, item.pbr?.roughness]).filter(Boolean))
for(const photo of showroomPhotos)for(const file of photo.variants)references.add(file.src)
const studioMaps=JSON.parse(readFileSync('src/data/studio-hd-textures.json','utf8'))
for(const entry of Object.values(studioMaps))for(const channel of ['color','normal','roughness'])references.add(entry[channel])
for(const file of ['config.json','preprocessor_config.json','onnx/model_quantized.onnx','LICENSE.txt','provenance.json'])references.add(`/models/depth-anything-v2-small/${file}`)
for(const file of ['ort-wasm-simd-threaded.mjs','ort-wasm-simd-threaded.wasm'])references.add(`/vendor/onnx/${file}`)
for(const file of ['vision_bundle.js','segment.worker.js','vision_wasm_internal.js','vision_wasm_internal.wasm','vision_wasm_nosimd_internal.js','vision_wasm_nosimd_internal.wasm'])references.add(`/vendor/mediapipe/${file}`)
references.add('/models/magic-touch.tflite')
function scan(folder) {
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    const path = resolve(folder, entry.name)
    if (entry.isDirectory()) scan(path)
    else if (/\.(js|css|html)$/.test(entry.name)) {
      const source = readFileSync(path, 'utf8')
      for (const match of source.matchAll(/['"(](\/assets\/[^'"\s)${}]+)['")]/g)) references.add(match[1])
    }
  }
}
scan(resolve('src'))
const missing = [...references].filter(path => !existsSync(resolve('public', '.' + path)))
console.log(`materials=${materials.length} furniture=${shopProducts.length} forms=${furnitureForms.length} assets=${references.size} missing-assets=${missing.length}`)
if (missing.length) { console.error(missing.join('\n')); process.exitCode = 1 }
