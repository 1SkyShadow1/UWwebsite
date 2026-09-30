import { build } from 'esbuild'
import { copyFile, mkdir, readdir } from 'node:fs/promises'
import { join } from 'node:path'

const outDir = 'public/vendor/mediapipe'
await mkdir(outDir, { recursive: true })
await build({
  entryPoints: ['node_modules/@mediapipe/tasks-vision/vision_bundle.mjs'],
  outfile: join(outDir, 'vision_bundle.js'),
  bundle: true,
  format: 'iife',
  globalName: 'vision',
  minify: true,
})
await copyFile('src/studio/segment.worker.js', join(outDir, 'segment.worker.js'))

const wasmDir = 'node_modules/@mediapipe/tasks-vision/wasm'
for (const entry of await readdir(wasmDir)) {
  if (entry.endsWith('.wasm') || entry.endsWith('.js')) {
    await copyFile(join(wasmDir, entry), join(outDir, entry))
  }
}

