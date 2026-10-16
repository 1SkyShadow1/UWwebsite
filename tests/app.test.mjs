import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, sep } from 'node:path'
import { createAppHandler } from '../server/app.mjs'

test('production serves pages and API together without exposing source or database files', async t => {
  const directory = mkdtempSync(resolve(tmpdir(), 'uw-static-'))
  assert.ok(directory.startsWith(resolve(tmpdir()) + sep))
  writeFileSync(resolve(directory, 'index.html'), '<h1>Showroom</h1>')
  writeFileSync(resolve(directory, 'contact.html'), '<h1>Enquiry</h1>')
  writeFileSync(resolve(directory, 'runtime.mjs'), 'export const studio = true')
  const server = http.createServer(createAppHandler({ directory, api: (req, res) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"ok":true}') } }))
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(async () => { await new Promise(resolve => server.close(resolve)); rmSync(directory, { recursive: true, force: true }) })
  const base = `http://127.0.0.1:${server.address().port}`
  assert.match(await (await fetch(base)).text(), /Showroom/)
  const contact = await fetch(base + '/contact.html')
  assert.equal(contact.status, 200)
  assert.match(contact.headers.get('content-type'), /text\/html/)
  assert.match((await fetch(base + '/runtime.mjs')).headers.get('content-type'), /application\/javascript/)
  assert.equal((await fetch(base + '/api/health')).status, 200)
  const head = await fetch(base, { method: 'HEAD' })
  assert.equal(head.status, 200)
  assert.equal(await head.text(), '')
  assert.equal((await fetch(base + '/contact.html', { method: 'POST' })).status, 405)
  for (const path of ['/missing.html', '/.env', '/server/index.mjs', '/.data/warehouse.sqlite', '/%2e%2e%2fpackage.json', '/%5c..%5cpackage.json']) {
    assert.equal((await fetch(base + path)).status, 404, path)
  }
})
