import http from 'node:http'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { getR2Status } from './storage.mjs'

const port = Number(process.env.PORT || process.env.API_PORT || 3000)
const sessions = new Map()
const projects = new Map()
const previews = new Map()

const materials = [
  { id: 'leather', name: 'Verona Cognac Hide', type: 'Aniline leather', rub: '50,000+ rubs' },
  { id: 'velvet', name: 'Imperial Emerald Velvet', type: 'Performance velvet', rub: '100,000 rubs' },
  { id: 'boucle', name: 'Alpine Pebble Bouclé', type: 'Artisan bouclé', rub: '30,000 rubs' },
  { id: 'linen', name: 'Belgian Flax Linen', type: 'Washed linen', rub: '20,000 rubs' },
  { id: 'vinyl', name: 'Mineral Contract Vinyl', type: 'Coated vinyl', rub: '100,000+ rubs' },
  { id: 'performance', name: 'Field Performance Weave', type: 'Performance weave', rub: '50,000 rubs' },
]

function send(res, status, payload) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'access-control-allow-origin': process.env.CORS_ORIGIN || '*' })
  res.end(JSON.stringify(payload))
}

async function readJson(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const raw = Buffer.concat(chunks).toString('utf8')
  if (raw.length > 2_000_000) throw new Error('Request body exceeds the 2 MB limit.')
  return raw ? JSON.parse(raw) : {}
}

function route(req) {
  return new URL(req.url, `http://${req.headers.host || 'localhost'}`).pathname
}

export async function handleApiRequest(req, res) {
  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { 'access-control-allow-origin': process.env.CORS_ORIGIN || '*', 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'content-type' })
      return res.end()
    }
    const path = route(req)
    if (req.method === 'GET' && path === '/api/health') return send(res, 200, { ok: true, service: 'upholstery-warehouse-api', time: new Date().toISOString() })
    if (req.method === 'GET' && path === '/api/config/storage') return send(res, 200, { data: getR2Status() })
    if (req.method === 'GET' && path === '/api/config/ar') return send(res, 200, { data: { eightWallConfigured: Boolean(process.env.EIGHTH_WALL_APP_KEY), trackingMode: process.env.EIGHTH_WALL_TRACKING_MODE || 'fallback', threeRenderer: 'pbr' } })
    if (req.method === 'GET' && path === '/api/materials') return send(res, 200, { data: materials })
    if (req.method === 'POST' && path === '/api/visualiser/sessions') {
      const body = await readJson(req)
      if (!body.materialId) return send(res, 400, { error: 'materialId is required.' })
      const id = randomUUID()
      const session = { id, materialId: body.materialId, furnitureType: body.furnitureType || 'unknown', createdAt: new Date().toISOString(), status: 'ready-for-render' }
      sessions.set(id, session)
      return send(res, 201, { data: session })
    }
    if (req.method === 'POST' && path === '/api/visualiser/preview') {
      const body = await readJson(req)
      if (!body.sessionId || !sessions.has(body.sessionId)) return send(res, 404, { error: 'Visualiser session not found.' })
      if (!body.materialId || typeof body.materialId !== 'string') return send(res, 400, { error: 'materialId is required.' })
      if (body.imageData && (typeof body.imageData !== 'string' || body.imageData.length > 2_000_000)) return send(res, 413, { error: 'imageData must be a data URL under 2 MB.' })
      const session = sessions.get(body.sessionId)
      session.status = 'queued'
      session.updatedAt = new Date().toISOString()
      const preview = { id: randomUUID(), sessionId: session.id, materialId: body.materialId, status: 'queued', provider: process.env.AI_IMAGE_PROVIDER || null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
      previews.set(preview.id, preview)
      if (!process.env.AI_IMAGE_PROVIDER) {
        preview.status = 'awaiting-provider'
        preview.message = 'Preview metadata accepted. Configure AI_IMAGE_PROVIDER on the server to generate an AI result.'
      }
      return send(res, 202, { data: preview })
    }
    if (req.method === 'GET' && path.startsWith('/api/visualiser/preview/')) {
      const id = path.split('/').pop()
      const preview = previews.get(id)
      if (!preview) return send(res, 404, { error: 'Preview not found.' })
      return send(res, 200, { data: preview })
    }
    if (req.method === 'POST' && path === '/api/projects') {
      const body = await readJson(req)
      if (!body.name) return send(res, 400, { error: 'Project name is required.' })
      const project = { id: randomUUID(), name: body.name, materialIds: Array.isArray(body.materialIds) ? body.materialIds : [], furnitureType: body.furnitureType || null, createdAt: new Date().toISOString() }
      projects.set(project.id, project)
      return send(res, 201, { data: project })
    }
    if (req.method === 'GET' && path === '/api/projects') return send(res, 200, { data: [...projects.values()] })
    if (req.method === 'POST' && path === '/api/estimates') {
      const body = await readJson(req)
      if (!body.furnitureType || !Number.isInteger(body.quantity) || body.quantity < 1) return send(res, 400, { error: 'furnitureType and a positive integer quantity are required.' })
      return send(res, 201, { data: { id: randomUUID(), ...body, status: 'consultation-guide', createdAt: new Date().toISOString() } })
    }
    return send(res, 404, { error: 'Not found.' })
  } catch (error) {
    return send(res, error instanceof SyntaxError ? 400 : 500, { error: error.message || 'Unexpected server error.' })
  }
}

const server = http.createServer(handleApiRequest)

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  server.listen(port, '0.0.0.0', () => console.log(`Upholstery Warehouse API listening on http://0.0.0.0:${port}`))
}
