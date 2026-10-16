import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, sep } from 'node:path'
import { createApiHandler } from '../server/index.mjs'
import { openDatabase } from '../server/database.mjs'
import { materials } from '../src/data/materials.js'
import { shopProducts } from '../src/data/shop-products.js'

async function fixture(t, dbPath = ':memory:') {
  const database = openDatabase(dbPath)
  const server = http.createServer(createApiHandler({ database }))
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const owner = `${randomUUID()}${randomUUID()}`
  const base = `http://127.0.0.1:${server.address().port}`
  const close = async () => { await new Promise(resolve => server.close(resolve)); database.close() }
  t.after(close)
  const call = async (path, { body, key = owner, method = body ? 'POST' : 'GET', headers = {} } = {}) => {
    const response = await fetch(base + path, { method, headers: { ...(key ? { Authorization: `Bearer ${key}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined })
    return { status: response.status, body: await response.json(), headers: response.headers }
  }
  return { call, database, base, owner }
}

const plan = { furnitureType: 'wingback', quantity: 2, tier: 'artisan', pattern: true }

test('API catalogue uses all of the actual frontend materials and furniture', async t => {
  const { call } = await fixture(t)
  const material = await call('/api/materials')
  const furniture = await call('/api/furniture')
  assert.deepEqual(material.body.data.map(item => item.id), materials.map(item => item.id))
  assert.deepEqual(furniture.body.data.map(item => item.id), shopProducts.map(item => item.id))
})

test('shortlists are validated, persisted and private to a browser key', async t => {
  const { call } = await fixture(t)
  assert.equal((await call('/api/shortlist', { key: null })).status, 401)
  assert.equal((await call('/api/shortlist', { method: 'PUT', body: { materialIds: ['velvet', 'linen', 'velvet'] } })).status, 200)
  assert.deepEqual((await call('/api/shortlist')).body.data.materialIds, ['velvet', 'linen'])
  assert.deepEqual((await call('/api/shortlist', { key: randomUUID() })).body.data.materialIds, [])
  assert.equal((await call('/api/shortlist', { method: 'PUT', body: { materialIds: ['invented'] } })).status, 400)
  assert.equal((await call('/api/shortlist', { method: 'PUT', body: { materialIds: materials.slice(0, 9).map(item => item.id) } })).status, 400)
})

test('project quantities are authoritative and projects cannot be read or deleted by another browser', async t => {
  const { call } = await fixture(t)
  const result = await call('/api/projects', { body: { ...plan, name: 'Reading chair', materialIds: ['linen'], metres: 999, status: 'paid' } })
  assert.equal(result.status, 201)
  assert.equal(result.body.data.metres, 12.5)
  assert.equal(result.body.data.low, 10.6)
  assert.equal(result.body.data.status, undefined)
  const id = result.body.data.id
  assert.equal((await call('/api/projects')).body.data.length, 1)
  assert.deepEqual((await call('/api/projects', { key: randomUUID() })).body.data, [])
  assert.equal((await call(`/api/projects/${id}`, { key: randomUUID(), method: 'DELETE' })).status, 404)
  assert.equal((await call(`/api/projects/${id}`, { method: 'DELETE' })).status, 200)
  assert.equal((await call('/api/projects')).body.data.length, 0)
})

test('persistent storage survives closing and reopening a database', () => {
  const folder = mkdtempSync(resolve(tmpdir(), 'uw-persistence-'))
  assert.ok(folder.startsWith(resolve(tmpdir()) + sep))
  const path = resolve(folder, 'test.sqlite')
  let db = openDatabase(path)
  try {
    db.put('project', 'fixture', 'owner', { name: 'Survives restart', createdAt: new Date().toISOString() })
    db.close()
    db = openDatabase(path)
    assert.equal(db.get('project', 'fixture', 'owner').name, 'Survives restart')
    assert.equal(db.get('project', 'fixture', 'other'), null)
  } finally { db.close(); rmSync(folder, { recursive: true, force: true }) }
})

test('invalid planning inputs and JSON are rejected without leaking internals', async t => {
  const { call, base } = await fixture(t)
  for (const quantity of [0, 1.5, 13, '2', null]) assert.equal((await call('/api/estimates', { body: { ...plan, quantity } })).status, 400)
  assert.equal((await call('/api/estimates', { body: { ...plan, furnitureType: 'constructor' } })).status, 400)
  assert.equal((await call('/api/estimates', { body: { ...plan, pattern: 'yes' } })).status, 400)
  const malformed = await fetch(base + '/api/estimates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' })
  assert.equal(malformed.status, 400)
  const wrongType = await fetch(base + '/api/estimates', { method: 'POST', body: '{}' })
  assert.equal(wrongType.status, 415)
  const large = await fetch(base + '/api/estimates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ notes: 'x'.repeat(2_000_001) }) })
  assert.equal(large.status, 413)
})

test('enquiry validates contact and consent, stores selections, and returns only a reference', async t => {
  const { call, database } = await fixture(t)
  const body = { name: 'Site QA', email: 'qa@example.com', phone: '', service: 'Reupholstery & repair', message: 'A local integration test for two reading chairs.', consent: true, materialIds: ['linen'], furnitureIds: [shopProducts[0].id], plan }
  assert.equal((await call('/api/enquiries', { body: { ...body, consent: false } })).status, 400)
  assert.equal((await call('/api/enquiries', { body: { ...body, email: '' } })).status, 400)
  assert.equal((await call('/api/enquiries', { body: { ...body, email: 'invalid' } })).status, 400)
  assert.equal((await call('/api/enquiries', { body: { ...body, phone: '.......' } })).status, 400)
  assert.equal((await call('/api/enquiries', { body: { ...body, phone: '1234567890123456' } })).status, 400)
  const response = await call('/api/enquiries', { body })
  assert.equal(response.status, 201)
  assert.equal(response.body.data.status, 'received')
  assert.equal(response.body.data.email, undefined)
  assert.equal((await call('/api/enquiries')).status, 200)
  assert.equal((await call('/api/enquiries', { key: null })).status, 401)
  assert.deepEqual((await call('/api/enquiries', { key: randomUUID() })).body.data, [])
  assert.equal((await call('/api/enquiries/' + response.body.data.id)).status, 404)
  const spam = await call('/api/enquiries', { body: { website: 'spam' } })
  assert.equal(spam.status, 201)
  assert.equal(database.get('enquiry', spam.body.data.id, ''), null)
})

test('unapproved origins are rejected and browser preflight supports auth', async t => {
  const { call, base } = await fixture(t)
  assert.equal((await call('/api/materials', { headers: { Origin: 'https://unknown.example' } })).status, 403)
  const preflight = await fetch(base + '/api/shortlist', { method: 'OPTIONS', headers: { Origin: base } })
  assert.equal(preflight.status, 204)
  assert.equal(preflight.headers.get('access-control-allow-origin'), base)
  assert.match(preflight.headers.get('access-control-allow-headers'), /authorization/)
})

test('cloud previews report the missing provider and remain private', async t => {
  const { call } = await fixture(t)
  const session = await call('/api/visualiser/sessions', { body: { materialId: 'velvet' } })
  assert.equal(session.status, 201)
  const preview = await call('/api/visualiser/preview', { body: { sessionId: session.body.data.id, materialId: 'velvet' } })
  assert.equal(preview.status, 202)
  assert.equal(preview.body.data.status, 'awaiting-provider')
  assert.equal((await call(`/api/visualiser/preview/${preview.body.data.id}`, { key: randomUUID() })).status, 404)
})
