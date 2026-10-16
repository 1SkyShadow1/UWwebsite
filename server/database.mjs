import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

export function openDatabase(path = process.env.UW_DB_PATH || resolve('.data', 'warehouse.sqlite')) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
  const db = new DatabaseSync(path)
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS records (
      kind TEXT NOT NULL,
      id TEXT NOT NULL,
      owner TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (kind, id)
    ) STRICT;
    CREATE INDEX IF NOT EXISTS records_owner ON records(kind, owner, created_at);
  `)
  const put = db.prepare('INSERT INTO records VALUES (?, ?, ?, ?, ?) ON CONFLICT(kind, id) DO UPDATE SET payload=excluded.payload, created_at=excluded.created_at WHERE records.owner=excluded.owner')
  const get = db.prepare('SELECT payload FROM records WHERE kind=? AND id=? AND owner=?')
  const list = db.prepare('SELECT payload FROM records WHERE kind=? AND owner=? ORDER BY created_at DESC LIMIT 100')
  const all = db.prepare('SELECT payload FROM records WHERE kind=? ORDER BY created_at DESC LIMIT 100')
  const record = db.prepare('SELECT owner, payload FROM records WHERE kind=? AND id=?')
  const remove = db.prepare('DELETE FROM records WHERE kind=? AND id=? AND owner=?')
  return {
    exportRecords() { return db.prepare('SELECT kind,id,owner,payload,created_at FROM records').all().map(row=>({...row,payload:JSON.parse(row.payload)})) },
    put(kind, id, owner, payload) { put.run(kind, id, owner, JSON.stringify(payload), payload.updatedAt || payload.createdAt || new Date().toISOString()); return payload },
    get(kind, id, owner) { const row = get.get(kind, id, owner); return row ? JSON.parse(row.payload) : null },
    list(kind, owner) { return list.all(kind, owner).map(row => JSON.parse(row.payload)) },
    listAll(kind) { return all.all(kind).map(row => JSON.parse(row.payload)) },
    getRecord(kind, id) { const row = record.get(kind, id); return row ? { owner: row.owner, payload: JSON.parse(row.payload) } : null },
    remove(kind, id, owner) { return remove.run(kind, id, owner).changes > 0 },
    transaction(work) {
      db.exec('BEGIN IMMEDIATE')
      try { const result = work(); db.exec('COMMIT'); return result }
      catch (error) { db.exec('ROLLBACK'); throw error }
    },
    close() { db.close() },
  }
}
