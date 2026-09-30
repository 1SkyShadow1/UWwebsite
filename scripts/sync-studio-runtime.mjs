import { build } from 'esbuild'
import { copyFile } from 'node:fs/promises'
await build({entryPoints:['node_modules/@mediapipe/tasks-vision/vision_bundle.mjs'],outfile:'public/vendor/mediapipe/vision_bundle.js',bundle:true,format:'iife',globalName:'vision',minify:true})
await copyFile('src/studio/segment.worker.js','public/vendor/mediapipe/segment.worker.js')
