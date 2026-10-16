import { build } from 'esbuild'
import { copyFile, mkdir, readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

const outDir = 'public/vendor/mediapipe'
async function copyChanged(source,destination){
  const next=await readFile(source)
  let previous
  try{previous=await readFile(destination)}catch(error){if(error.code!=='ENOENT')throw error}
  // Windows can hold a browser-loaded WASM file open. Identical runtime assets
  // need no rewrite and should not interrupt an otherwise valid build.
  if(previous?.equals(next))return
  await copyFile(source,destination)
}
await mkdir(outDir, { recursive: true })
await build({
  entryPoints: ['node_modules/@mediapipe/tasks-vision/vision_bundle.mjs'],
  outfile: join(outDir, 'vision_bundle.js'),
  bundle: true,
  format: 'iife',
  globalName: 'vision',
  minify: true,
})
await build({entryPoints:['src/studio/segment.worker.js'],outfile:join(outDir,'segment.worker.js'),bundle:true,format:'iife',minify:true})

const wasmDir = 'node_modules/@mediapipe/tasks-vision/wasm'
for (const entry of await readdir(wasmDir)) {
  if (entry.endsWith('.wasm') || entry.endsWith('.js')) {
    await copyChanged(join(wasmDir, entry), join(outDir, entry))
  }
}

// Pin the ONNX runtime to the installed dependency; no CDN/version mismatch.
await mkdir('public/vendor/onnx', { recursive:true })
for (const entry of ['ort-wasm-simd-threaded.mjs','ort-wasm-simd-threaded.wasm']) {
  await copyChanged(join('node_modules/onnxruntime-web/dist',entry),join('public/vendor/onnx',entry))
}

