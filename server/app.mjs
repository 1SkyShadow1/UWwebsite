import http from 'node:http'
import { createReadStream, existsSync, realpathSync, statSync } from 'node:fs'
import { extname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { handleApiRequest } from './index.mjs'

const moduleType = 'application/javascript; charset=utf-8'

const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' }

export function createAppHandler({ api = handleApiRequest, directory = resolve('dist') } = {}) {
  return (req, res) => {
    const path = new URL(req.url, 'http://localhost').pathname
    if (path.startsWith('/api/')) return api(req, res)
    res.setHeader('x-content-type-options', 'nosniff')
    res.setHeader('referrer-policy', 'strict-origin-when-cross-origin')
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { allow: 'GET, HEAD' }); return res.end('Method not allowed') }
    try {
      const decoded = decodeURIComponent(path)
      if (decoded.includes('\\') || decoded.includes('\0')) throw new Error('Invalid path')
      const root = realpathSync(directory)
      const file = resolve(root, `.${decoded === '/' ? '/index.html' : decoded}`)
      if (!file.startsWith(root + sep) || !existsSync(file) || !statSync(file).isFile()) throw new Error('Not found')
      const realFile = realpathSync(file)
      if (!realFile.startsWith(root + sep)) throw new Error('Not found')
      const stats = statSync(realFile)
      res.writeHead(200, { 'content-type': extname(file)==='.mjs' ? moduleType : types[extname(file)] || 'application/octet-stream', 'content-length': stats.size, 'cache-control': file.includes(`${sep}assets${sep}`) && /-[a-zA-Z0-9_-]{8,}\.(js|css)$/.test(file) ? 'public, max-age=31536000, immutable' : 'no-cache' })
      if (req.method === 'HEAD') return res.end()
      const stream = createReadStream(realFile)
      stream.on('error', () => res.destroy())
      stream.pipe(res)
    } catch { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); res.end('Page not found') }
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (!existsSync(resolve('dist/index.html'))) { console.error('Build the site first with npm run build.'); process.exit(1) }
  const port = Number(process.env.PORT || 3000)
  const server = http.createServer(createAppHandler())
  server.listen(port, '0.0.0.0', () => console.log(`Upholstery Warehouse is ready at http://localhost:${port}`))
}
