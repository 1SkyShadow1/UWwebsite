import { defineConfig } from 'vite'
import { existsSync, createReadStream } from 'node:fs'
import { resolve, basename } from 'node:path'
import { handleApiRequest } from './server/index.mjs'

export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: true,
  },
  plugins: [
    {
      name: 'upholstery-warehouse-api',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const urlPath = (req.url || '').split('?')[0]
          if (urlPath.startsWith('/api/')) {
            handleApiRequest(req, res)
            return
          }
          if (urlPath.startsWith('/vendor/mediapipe/') && (urlPath.endsWith('.wasm') || urlPath.endsWith('.js'))) {
            const fileName = basename(urlPath)
            const publicCandidate = resolve(__dirname, 'public/vendor/mediapipe', fileName)
            const nodeModulesCandidate = resolve(__dirname, 'node_modules/@mediapipe/tasks-vision/wasm', fileName)
            const target = existsSync(publicCandidate)
              ? publicCandidate
              : existsSync(nodeModulesCandidate)
              ? nodeModulesCandidate
              : null
            if (target) {
              res.statusCode = 200
              res.setHeader(
                'Content-Type',
                fileName.endsWith('.wasm') ? 'application/wasm' : 'application/javascript; charset=utf-8'
              )
              res.setHeader('Cache-Control', 'public, max-age=3600')
              createReadStream(target).pipe(res)
              return
            }
            if (fileName.endsWith('.wasm')) {
              res.statusCode = 404
              res.end('Not found')
              return
            }
          }
          next()
        })
      },
    },
  ],
  build: {
    rollupOptions: {
      input: {
        app: resolve(__dirname, 'index.html'),
        landing: resolve(__dirname, 'landing.html'),
        materials: resolve(__dirname, 'materials.html'),
        lab: resolve(__dirname, 'lab.html'),
        studio: resolve(__dirname, 'ai-studio.html'),
        visualiser: resolve(__dirname, 'visualiser.html'),
        services: resolve(__dirname, 'services.html'),
        journal: resolve(__dirname, 'journal.html'),
        contact: resolve(__dirname, 'contact.html'),
        catalogue: resolve(__dirname, 'catalogue.html'),
        estimator: resolve(__dirname, 'estimator.html'),
        profile: resolve(__dirname, 'profile.html'),
      },
    },
  },
})
