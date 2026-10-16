import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { randomUUID } from 'node:crypto'
import { createApiHandler } from '../server/index.mjs'
import { openDatabase } from '../server/database.mjs'
import { findMaterialDirections, searchShowroom } from '../src/data/discovery.js'
import { setEnquiryStatus } from '../server/enquiries.mjs'

async function fixture(t) {
  const database = openDatabase(':memory:')
  const server = http.createServer(createApiHandler({ database }))
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(async () => { await new Promise(resolve => server.close(resolve)); database.close() })
  const owner = randomUUID() + randomUUID()
  const base = `http://127.0.0.1:${server.address().port}`
  const call = async (path, { body, key = owner, headers = {}, method = body ? 'POST' : 'GET' } = {}) => {
    const response = await fetch(base + path, { method, headers: { ...(key ? { Authorization: `Bearer ${key}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined })
    return { status: response.status, data: (await response.json()).data }
  }
  return { call, database }
}
const change = (productId, type, value) => ({ mutationId: randomUUID(), productId, type, value })

test('selection totals use catalogue prices and stay private to the owning browser', async t => {
  const { call } = await fixture(t)
  assert.equal((await call('/api/selections', { key: null })).status, 401)
  const result = await call('/api/selections', { body: { operations: [change('alba-swivel', 'quantity', 2), change('porter-two', 'favourite', true)], subtotal: 1, unitPrice: 1 } })
  assert.equal(result.status, 200)
  assert.equal(result.data.totals.subtotal, 13800)
  assert.equal(result.data.totals.lines[0].unitPrice, 6900)
  assert.deepEqual(result.data.wishlist, ['porter-two'])
  assert.equal((await call('/api/selections', { key: randomUUID() })).data.totals.subtotal, 0)
})

test('selection retries preserve newer changes and reject reused commands with different values', async t => {
  const { call } = await fixture(t)
  const original = change('alba-swivel', 'quantity', 2)
  await call('/api/selections', { body: { operations: [original] } })
  await call('/api/selections', { body: { operations: [change('porter-two', 'quantity', 1)] } })
  const replay = await call('/api/selections', { body: { operations: [original] } })
  assert.equal(replay.data.revision, 2)
  assert.equal(replay.data.totals.subtotal, 35600)
  assert.equal((await call('/api/selections', { body: { operations: [{ ...original, value: 3 }] } })).status, 409)
  assert.equal((await call('/api/selections')).data.totals.subtotal, 35600)
})

test('a rejected selection batch rolls back all its changes and retry markers', async t => {
  const { call } = await fixture(t)
  const original = change('alba-swivel', 'quantity', 2)
  await call('/api/selections', { body: { operations: [original] } })
  const fresh = change('porter-two', 'quantity', 1)
  assert.equal((await call('/api/selections', { body: { operations: [fresh, { ...original, value: 5 }] } })).status, 409)
  assert.equal((await call('/api/selections')).data.cart.length, 1)
  assert.equal((await call('/api/selections', { body: { operations: [fresh] } })).data.cart.length, 2)
})

test('selection commands validate products, types, whole quantities and bounds', async t => {
  const { call } = await fixture(t)
  for (const value of [-1, 100, 1.5, '2', null]) assert.equal((await call('/api/selections', { body: { operations: [change('alba-swivel','quantity',value)] } })).status, 400)
  assert.equal((await call('/api/selections', { body: { operations: [change('missing','quantity',1)] } })).status, 400)
  assert.equal((await call('/api/selections', { body: { operations: [change('alba-swivel','favourite','true')] } })).status, 400)
  assert.equal((await call('/api/selections', { body: { operations: [] } })).status, 400)
  assert.equal((await call('/api/selections', { body: { operations: Array.from({length:51},()=>change('alba-swivel','quantity',1)) } })).status, 400)
})

test('independent additions to the same piece merge and replaying an addition never doubles it', async t => {
  const { call } = await fixture(t)
  const first=change('alba-swivel','delta',1), second=change('alba-swivel','delta',1)
  await Promise.all([call('/api/selections',{body:{operations:[first]}}),call('/api/selections',{body:{operations:[second]}})])
  assert.equal((await call('/api/selections')).data.cart[0].quantity,2)
  await call('/api/selections',{body:{operations:[first]}})
  assert.equal((await call('/api/selections')).data.cart[0].quantity,2)
})

test('enquiry receipt retries are idempotent and quantity/pricing attachments are authoritative', async t => {
  const { call, database } = await fixture(t)
  const body = { name: 'Store QA', email: 'store-qa@example.com', service: 'Furniture selection', message: 'A local store test with three occasional chairs.', consent: true, materialIds: ['linen'], furnitureLines: [{ id:'alba-swivel', quantity:3, unitPrice:1 }], status:'paid' }
  const headers = { 'Idempotency-Key': randomUUID() }
  const first = await call('/api/enquiries', { body, headers })
  assert.equal(first.status, 201)
  assert.equal(first.data.status, 'received')
  assert.equal(first.data.furnitureLines[0].lineTotal, 20700)
  assert.equal(first.data.email, undefined)
  const retry = await call('/api/enquiries', { body, headers })
  assert.equal(retry.status, 200)
  assert.equal(retry.data.id, first.data.id)
  assert.equal(database.listAll('enquiry').length, 1)
  assert.equal((await call('/api/enquiries', { body: { ...body, message: 'A different enquiry sharing the same key.' }, headers })).status, 409)
  assert.equal((await call('/api/enquiries')).data[0].id, first.data.id)
  assert.deepEqual((await call('/api/enquiries', { key: randomUUID() })).data, [])
})

test('material discovery uses real catalogue tags and search handles unaccented names', () => {
  assert.ok(searchShowroom('boucle', 'materials').some(item => /bouclé/i.test(item.name)))
  assert.equal(searchShowroom('alba swivel', 'furniture')[0].name, 'Alba Swivel Chair')
  assert.ok(findMaterialDirections({ setting:'outdoor' }).length)
  assert.ok(findMaterialDirections({ setting:'outdoor' }).every(item => item.tags.includes('outdoor')))
  assert.ok(findMaterialDirections({ family:'Leather' }).every(item => item.group === 'Leather'))
})

test('project creation retries do not duplicate briefs, and edits remain owner-scoped', async t => {
  const { call } = await fixture(t)
  const body = { furnitureType:'wingback', quantity:2, tier:'artisan', pattern:false, name:'Store reading chairs', notes:'A test project.', materialIds:['linen'] }
  const headers = { 'Idempotency-Key':randomUUID() }
  const first = await call('/api/projects',{body,headers})
  const retry = await call('/api/projects',{body,headers})
  assert.equal(first.data.id,retry.data.id)
  assert.equal((await call('/api/projects')).data.length,1)
  assert.equal((await call(`/api/projects/${first.data.id}`,{method:'PUT',body,key:randomUUID()})).status,404)
  const updated=await call(`/api/projects/${first.data.id}`,{method:'PUT',body:{...body,quantity:3,materialIds:['velvet'],metres:999}})
  assert.equal(updated.data.metres,15.6)
  assert.equal(updated.data.id,first.data.id)
  assert.deepEqual(updated.data.materialIds,['velvet'])
  assert.equal((await call('/api/projects')).data.length,1)
})

test('only operator-side status changes appear in a private customer receipt', async t => {
  const { call,database } = await fixture(t)
  const receipt=await call('/api/enquiries',{body:{name:'Operator QA',email:'operator-qa@example.com',service:'Furniture selection',message:'A local enquiry status integration test.',consent:true,status:'closed'}})
  assert.equal(receipt.data.status,'received')
  setEnquiryStatus(database,receipt.data.id,'reviewing')
  const updated=(await call('/api/enquiries')).data[0]
  assert.equal(updated.status,'reviewing')
  assert.deepEqual(updated.history.map(item=>item.status),['received','reviewing'])
  assert.equal(updated.email,undefined)
  assert.throws(()=>setEnquiryStatus(database,receipt.data.id,'paid'))
  assert.equal((await call('/api/enquiries/'+receipt.data.id,{method:'PUT',body:{status:'closed'}})).status,404)
})
