import http from 'node:http'
import { createHash, randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { getR2Status } from './storage.mjs'
import { openDatabase } from './database.mjs'
import { materials } from '../src/data/materials.js'
import { shopProducts } from '../src/data/shop-products.js'
import { calculateAllowance, serviceOptions, tiers } from '../src/data/planning.js'
import { applyShoppingOperations, selectionDetails, validateSelection, validateShoppingOperations } from '../src/data/shopping.js'
import { receiptFor } from './enquiries.mjs'
import { studioForms, studioLights, materialResponse } from '../src/studio/material-response.js'
import { createStudioGenerationService, validatePartFabrics } from './studio-generation.mjs'
import { validateGenerationMode } from '../src/studio/generation-modes.js'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

const materialIds = new Set(materials.map(item => item.id))
const productIds = new Set(shopProducts.map(item => item.id))
const bodyLimit = 2_000_000

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status }
}

function textField(value, label, { max = 200, min = 0 } = {}) {
  if (value == null && min === 0) return ''
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) {
    throw new HttpError(400, `${label} must contain ${min || 1}–${max} characters.`)
  }
  return value.trim()
}

function selectedIds(value = [], allowed = materialIds, limit = 8) {
  if (!Array.isArray(value) || value.length > limit || value.some(id => typeof id !== 'string' || !allowed.has(id))) {
    throw new HttpError(400, 'The selection contains an unknown item or too many items.')
  }
  return [...new Set(value)]
}

function planning(body) {
  let allowance
  try { allowance = calculateAllowance({ furnitureType: body.furnitureType, quantity: body.quantity, pattern: body.pattern ?? false }) }
  catch (error) { throw new HttpError(400, error.message) }
  const tier = body.tier || 'artisan'
  if (!tiers.includes(tier)) throw new HttpError(400, 'Choose a valid material direction.')
  return { ...allowance, tier }
}

async function readJson(req,limit=bodyLimit) {
  if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) throw new HttpError(415, 'Send an application/json body.')
  let size = 0
  const chunks = []
  for await (const chunk of req) {
    size += chunk.length
    if (size > limit) throw new HttpError(413, `Request body exceeds the ${limit/1_000_000} MB limit.`)
    chunks.push(chunk)
  }
  let body
  try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')) }
  catch { throw new HttpError(400, 'The request contains invalid JSON.') }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Send a JSON object.')
  return body
}

export function ownerFor(req) {
  const match = /^Bearer ([a-zA-Z0-9-]{32,128})$/.exec(req.headers.authorization || '')
  if (!match) throw new HttpError(401, 'A private browser key is required.')
  return createHash('sha256').update(match[1]).digest('hex')
}

function validated(work) {
  try { return work() } catch (error) { throw new HttpError(400, error.message) }
}

function submissionFor(req, owner, body, kind) {
  const key = req.headers['idempotency-key']
  if (!key) return { id: null }
  if (!/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(key)) throw new HttpError(400, 'Use a valid submission reference.')
  return { id: createHash('sha256').update(`${kind}:${owner}:${key}`).digest('hex'), digest: createHash('sha256').update(JSON.stringify(body)).digest('hex') }
}

function previousSubmission(database, submission, owner) {
  if (!submission.id) return null
  const previous = database.get('submission', submission.id, owner)
  if (previous && previous.digest !== submission.digest) throw new HttpError(409, 'This submission reference was already used for another request.')
  return previous?.response || previous?.receipt || null
}

export function createApiHandler({ database, corsOrigin = process.env.CORS_ORIGIN, generationService=createStudioGenerationService() } = {}) {
  let store = database
  const db = () => store ||= openDatabase()
  const limits = new Map()
  const send = (res, status, payload) => {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' })
    const encoded=JSON.stringify(payload)
    if(res.uwStreamJson&&encoded.length>262144){
      const bytes=Buffer.from(encoded)
      return pipeline(Readable.from((function*(){for(let i=0;i<bytes.length;i+=65536)yield bytes.subarray(i,i+65536)})()),res).catch(()=>{res.destroy()})
    }
    res.end(encoded)
  }
  return async function api(req, res) {
    try {
      const origin = req.headers.origin
      let sameHost = false
      if (origin) {
        try { sameHost = new URL(origin).host === req.headers.host }
        catch { throw new HttpError(403, 'This origin is not allowed.') }
      }
      if (origin && !sameHost && origin !== corsOrigin) throw new HttpError(403, 'This origin is not allowed.')
      if (origin) { res.setHeader('access-control-allow-origin', origin); res.setHeader('vary', 'Origin') }
      if (req.method === 'OPTIONS') {
        res.writeHead(204, { 'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS', 'access-control-allow-headers': 'content-type,authorization,idempotency-key' })
        return res.end()
      }
      const path = new URL(req.url, 'http://localhost').pathname
      if (req.method === 'GET' && path === '/api/health') return send(res, 200, { ok: true, service: 'upholstery-warehouse-api', persistence: 'sqlite', time: new Date().toISOString() })
      if (req.method === 'GET' && path === '/api/config/storage') return send(res, 200, { data: getR2Status() })
      if (req.method === 'GET' && path === '/api/config/ar') return send(res, 200, { data: { eightWallConfigured: Boolean(process.env.EIGHTH_WALL_APP_KEY), trackingMode: process.env.EIGHTH_WALL_TRACKING_MODE || 'fallback', threeRenderer: 'pbr' } })
      if (req.method === 'GET' && path === '/api/materials') return send(res, 200, { data: materials })
      if (req.method === 'GET' && path === '/api/furniture') return send(res, 200, { data: shopProducts })
      if (req.method === 'GET' && path === '/api/studio/capabilities') return send(res,200,{data:{
        engine:'local-preview-with-optional-generative-editing',photosLeaveDevice:true,localPreviewPhotosLeaveDevice:false,
        generation:await generationService.capabilities(),
        depthModel:{name:'Depth Anything V2 Small',license:'Apache-2.0',available:existsSync(resolve('public/models/depth-anything-v2-small/onnx/model_quantized.onnx')) || existsSync(resolve('dist/models/depth-anything-v2-small/onnx/model_quantized.onnx'))},
        forms:studioForms,lights:studioLights.map(({id,name,note})=>({id,name,note})),exportQualities:['4k','8k'],
        materialResponses:materials.map(material=>({id:material.id,...materialResponse(material)})),
      }})

      if (['POST', 'PUT', 'DELETE'].includes(req.method)) {
        const key = req.socket.remoteAddress || 'local'
        const now = Date.now()
        for (const [ip, item] of limits) if (item.reset < now) limits.delete(ip)
        if (!limits.has(key) && limits.size >= 5000) throw new HttpError(429, 'Please try again shortly.')
        const entry = limits.get(key) || { count: 0, reset: now + 60_000 }
        entry.count++
        limits.set(key, entry)
        if (entry.count > 60) { res.setHeader('retry-after', '60'); throw new HttpError(429, 'Too many requests. Please try again in a minute.') }
      }

      if((path==='/api/studio/generations'||path==='/api/studio/parts/identify')&&req.method==='POST'){
        const owner=ownerFor(req),body=await readJson(req,24_000_000)
        const operation=new AbortController(),cancel=()=>operation.abort()
        res.on?.('close',cancel)
        let streaming=false
        const onProgress=progress=>{
          if(!req.headers.accept?.includes('application/x-ndjson')||operation.signal.aborted)return
          if(!streaming){res.writeHead(200,{'content-type':'application/x-ndjson; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','x-accel-buffering':'no'});res.flushHeaders?.();streaming=true}
          res.write(JSON.stringify({progress})+'\n')
        }
        try{
          const result=await generationService[path==='/api/studio/parts/identify'?'identify':'start'](owner,body,req.headers['idempotency-key'],materials,{signal:operation.signal,onProgress})
          if(!streaming)return send(res,202,{data:result})
          const bytes=Buffer.from(JSON.stringify({data:result})+'\n')
          return await pipeline(Readable.from((function*(){for(let i=0;i<bytes.length;i+=65536)yield bytes.subarray(i,i+65536)})()),res).catch(()=>res.destroy())
        }catch(error){
          if(!streaming)throw error
          res.end(JSON.stringify({error:error.status?error.message:'The hosted AI connection was interrupted. Retry to recover your edit.',status:error.status || 503})+'\n')
        }
        finally{res.removeListener?.('close',cancel)}
      }
      if(path.startsWith('/api/studio/generations/')){
        const owner=ownerFor(req),id=path.split('/').pop()
        if(req.method==='GET')return send(res,200,{data:await generationService.get(owner,id)})
        if(req.method==='DELETE')return send(res,200,{data:await generationService.cancel(owner,id)})
      }

      if(path==='/api/studio/designs'){
        const owner=ownerFor(req)
        if(req.method==='GET')return send(res,200,{data:db().list('studio-design',owner)})
        if(req.method==='POST'){
          const body=await readJson(req)
          if(!materialIds.has(body.materialId))throw new HttpError(400,'Choose a known fabric for this setup.')
          if(!studioForms.some(form=>form.id===body.formId))throw new HttpError(400,'Choose a supported upholstery form.')
          if(!studioLights.some(light=>light.id===body.lighting))throw new HttpError(400,'Choose a supported lighting environment.')
          if(!['photo','camera','3d'].includes(body.mode)||!['4k','8k'].includes(body.quality))throw new HttpError(400,'Choose a supported Studio mode and output quality.')
          const submission=submissionFor(req,owner,body,'studio-design'),previous=previousSubmission(db(),submission,owner)
          if(previous)return send(res,200,{data:previous})
          const material=materials.find(item=>item.id===body.materialId)
          const components=validatePartFabrics(body)
          const generationMode=validateGenerationMode(body.generationMode)
          if(!['1K','2K','4K'].includes(body.nativeSize || '1K'))throw new HttpError(400,'Choose a supported AI image detail.')
          if(generationMode==='quick'&&body.nativeSize&&body.nativeSize!=='1K')throw new HttpError(400,'Quick mode stays at 1K. Choose Realism for higher detail.')
          const design={id:randomUUID(),version:2,name:textField(body.name || `${material.name} study`,'Study name',{min:2,max:100}),materialId:body.materialId,formId:body.formId,lighting:body.lighting,mode:body.mode,quality:body.quality,nativeSize:body.nativeSize || (generationMode==='realism'?'2K':'1K'),...(generationMode?{generationMode}:{}),components,keepRest:body.keepRest===true,createdAt:new Date().toISOString()}
          db().transaction(()=>{db().put('studio-design',design.id,owner,design);if(submission.id)db().put('submission',submission.id,owner,{digest:submission.digest,response:design,createdAt:design.createdAt})})
          return send(res,201,{data:design})
        }
      }
      if (path === '/api/shortlist') {
        const owner = ownerFor(req)
        if (req.method === 'GET') return send(res, 200, { data: db().get('shortlist', owner, owner) || { materialIds: [], updatedAt: null } })
        if (req.method === 'PUT') {
          const body = await readJson(req)
          const data = { materialIds: selectedIds(body.materialIds), updatedAt: new Date().toISOString() }
          db().put('shortlist', owner, owner, data)
          return send(res, 200, { data })
        }
      }
      if (path === '/api/selections') {
        const owner = ownerFor(req)
        const current = () => db().get('selection', owner, owner) || { cart: [], wishlist: [], revision: 0, updatedAt: null }
        if (req.method === 'GET') { const data = current(); return send(res, 200, { data: { ...data, totals: selectionDetails(data) } }) }
        if (req.method === 'POST') {
          const body = await readJson(req)
          const operations = validated(() => validateShoppingOperations(body.operations))
          const data = db().transaction(() => {
            let selection = current()
            let changed = false
            for (const operation of operations) {
              const id = createHash('sha256').update(`${owner}:${operation.mutationId}`).digest('hex')
              const digest = createHash('sha256').update(JSON.stringify(operation)).digest('hex')
              const previous = db().get('selection-mutation', id, owner)
              if (previous) {
                if (previous.digest !== digest) throw new HttpError(409, 'This selection change was already used. Refresh and try again.')
                continue
              }
              selection = { ...selection, ...validated(() => applyShoppingOperations(selection, [operation])) }
              db().put('selection-mutation', id, owner, { digest, createdAt: new Date().toISOString() })
              changed = true
            }
            if (changed) {
              selection.revision++
              selection.updatedAt = new Date().toISOString()
              db().put('selection', owner, owner, selection)
            }
            return { ...selection, totals: selectionDetails(selection) }
          })
          return send(res, 200, { data })
        }
      }
      if (path === '/api/projects') {
        const owner = ownerFor(req)
        if (req.method === 'GET') return send(res, 200, { data: db().list('project', owner) })
        if (req.method === 'POST') {
          const body = await readJson(req)
          const submission = submissionFor(req, owner, body, 'project')
          const previous = previousSubmission(db(), submission, owner)
          if (previous) return send(res, 200, { data: previous })
          const project = { id: randomUUID(), name: textField(body.name, 'Project name', { min: 2, max: 100 }), materialIds: selectedIds(body.materialIds), notes: textField(body.notes, 'Notes', { max: 3000 }), ...planning(body), createdAt: new Date().toISOString() }
          db().transaction(() => {
            db().put('project', project.id, owner, project)
            if (submission.id) db().put('submission', submission.id, owner, { digest:submission.digest, response:project, createdAt:project.createdAt })
          })
          return send(res, 201, { data: project })
        }
      }
      if (req.method === 'PUT' && /^\/api\/projects\/[a-f0-9-]{36}$/.test(path)) {
        const owner = ownerFor(req)
        const id = path.split('/').pop()
        const existing = db().get('project', id, owner)
        if (!existing) throw new HttpError(404, 'Project not found.')
        const body = await readJson(req)
        const project = { ...existing, name:textField(body.name,'Project name',{min:2,max:100}), materialIds:selectedIds(body.materialIds), notes:textField(body.notes,'Notes',{max:3000}), ...planning(body), updatedAt:new Date().toISOString() }
        db().put('project', id, owner, project)
        return send(res, 200, { data:project })
      }
      if (req.method === 'DELETE' && /^\/api\/projects\/[a-f0-9-]{36}$/.test(path)) {
        const owner = ownerFor(req)
        if (!db().remove('project', path.split('/').pop(), owner)) throw new HttpError(404, 'Project not found.')
        return send(res, 200, { data: { deleted: true } })
      }
      if (req.method === 'POST' && path === '/api/estimates') {
        const body = await readJson(req)
        return send(res, 201, { data: { ...planning(body), status: 'consultation-guide' } })
      }
      if (req.method === 'GET' && path === '/api/enquiries') {
        return send(res, 200, { data: db().list('enquiry', ownerFor(req)).map(receiptFor) })
      }
      if (req.method === 'POST' && path === '/api/enquiries') {
        const owner = ownerFor(req)
        const body = await readJson(req)
        if (body.website) return send(res, 201, { data: { id: randomUUID(), status: 'received' } })
        const submission = submissionFor(req, owner, body, 'enquiry')
        const previous = previousSubmission(db(), submission, owner)
        if (previous) return send(res, 200, { data: previous })
        if (body.consent !== true) throw new HttpError(400, 'Please consent to being contacted about this enquiry.')
        const email = textField(body.email, 'Email', { max: 254 })
        const phone = textField(body.phone, 'Phone', { max: 40 })
        if (!email && !phone) throw new HttpError(400, 'Add an email address or phone number.')
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Enter a valid email address.')
        const phoneDigits = phone.replace(/\D/g, '')
        if (phone && (!/^[+()\d\s.-]{7,40}$/.test(phone) || phoneDigits.length < 7 || phoneDigits.length > 15)) throw new HttpError(400, 'Enter a valid phone number.')
        if (!serviceOptions.includes(body.service)) throw new HttpError(400, 'Choose a project service.')
        const furnitureIds = selectedIds(body.furnitureIds, productIds, 50)
        const cart = validated(() => validateSelection({ cart: body.furnitureLines ?? furnitureIds.map(id => ({ id, quantity: 1 })) })).cart
        const enquiry = { id: randomUUID(), name: textField(body.name, 'Name', { min: 2, max: 100 }), email, phone, service: body.service, message: textField(body.message, 'Project details', { min: 10, max: 3000 }), materialIds: selectedIds(body.materialIds), furnitureIds: cart.map(line => line.id), furnitureLines: selectionDetails({ cart }).lines, plan: body.plan ? planning(body.plan) : null, consent: true, status: 'received', createdAt: new Date().toISOString() }
        const receipt = receiptFor(enquiry)
        db().transaction(() => {
          db().put('enquiry', enquiry.id, owner, enquiry)
          if (submission.id) db().put('submission', submission.id, owner, { digest:submission.digest, response:receipt, createdAt:enquiry.createdAt })
        })
        return send(res, 201, { data: receipt })
      }
      if (req.method === 'POST' && path === '/api/visualiser/sessions') {
        const owner = ownerFor(req)
        const body = await readJson(req)
        if (!materialIds.has(body.materialId)) throw new HttpError(400, 'Choose a known material.')
        const session = { id: randomUUID(), materialId: body.materialId, furnitureType: textField(body.furnitureType || 'unknown', 'Furniture type', { max: 100 }), createdAt: new Date().toISOString(), status: 'ready-for-render' }
        db().put('session', session.id, owner, session)
        return send(res, 201, { data: session })
      }
      if (req.method === 'POST' && path === '/api/visualiser/preview') {
        const owner = ownerFor(req)
        const body = await readJson(req)
        const session = db().get('session', String(body.sessionId), owner)
        if (!session) throw new HttpError(404, 'Visualiser session not found.')
        if (!materialIds.has(body.materialId)) throw new HttpError(400, 'Choose a known material.')
        if (body.imageData && (typeof body.imageData !== 'string' || !/^data:image\/(jpeg|png|webp);base64,/.test(body.imageData))) throw new HttpError(400, 'Use a supported image data URL.')
        const preview = { id: randomUUID(), sessionId: session.id, materialId: body.materialId, status: 'awaiting-provider', message: 'Cloud image generation is not connected. The on-device material studio is available.', createdAt: new Date().toISOString() }
        db().put('preview', preview.id, owner, preview)
        return send(res, 202, { data: preview })
      }
      if (req.method === 'GET' && path.startsWith('/api/visualiser/preview/')) {
        const preview = db().get('preview', path.split('/').pop(), ownerFor(req))
        if (!preview) throw new HttpError(404, 'Preview not found.')
        return send(res, 200, { data: preview })
      }
      return send(res, 404, { error: 'Not found.' })
    } catch (error) {
      if (!res.headersSent) return send(res, error.status || 500, { error: error.status ? error.message : 'The request could not be saved. Please try again.' })
      res.end()
    }
  }
}

export const handleApiRequest = createApiHandler()

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const port = Number(process.env.PORT || process.env.API_PORT || 3001)
  http.createServer(handleApiRequest).listen(port, '0.0.0.0', () => console.log(`Upholstery Warehouse API listening on http://localhost:${port}`))
}
