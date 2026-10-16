import { request, readLocal, writeLocal } from '../lib/api.js'
import { applyShoppingOperations, validateSelection, validateShoppingOperations } from '../data/shopping.js'

const cacheKey = 'uw-shopping-state'
const copy = value => structuredClone(value)

export function createShoppingSync({ state, onChange }) {
  let pending = [], working = false, timer, baseline, nextAttempt = 0, failures = 0, status = 'Your selection stays with this browser.'
  let validCache = false
  const saved = readLocal(cacheKey, null)
  try {
    const selection = validateSelection(saved || state)
    state.cart = selection.cart; state.wishlist = selection.wishlist
    if (saved?.pending?.length) {
      for (let index = 0; index < saved.pending.length; index += 50) pending.push(...validateShoppingOperations(saved.pending.slice(index, index + 50)))
    }
    validCache = Boolean(saved)
  } catch { /* Keep the valid local catalogue selection if an old cache is malformed. */ }
  baseline = copy({ cart: state.cart, wishlist: state.wishlist })
  const operation = (productId, type, value) => ({ mutationId: crypto.randomUUID(), productId, type, value })
  if (!validCache) {
    pending.push(...state.cart.map(line => operation(line.id, 'quantity', line.quantity)), ...state.wishlist.map(id => operation(id, 'favourite', true)))
  }

  const persist = () => {
    writeLocal(cacheKey, { cart: state.cart, wishlist: state.wishlist, pending })
    writeLocal('uw-furniture-cart', state.cart)
    writeLocal('uw-furniture-wishlist', state.wishlist)
  }
  const publish = message => {
    if (message) status = message
    onChange?.(status)
  }
  const accept = selection => {
    const combined = applyShoppingOperations(selection, pending)
    state.cart = combined.cart; state.wishlist = combined.wishlist
    baseline = copy(combined)
    persist()
    publish()
  }
  const initial = request('/api/selections').then(selection => {
    // A queued command may already be on the server if its response was lost.
    // Replay it first so an acknowledged delta is never shown twice on reload.
    if (!pending.length) accept(selection)
    publish(pending.length ? 'Saving your selection…' : 'Your selection is saved.')
  }).catch(() => publish('Saved on this browser. Reconnect to finish saving.'))

  async function flush({ keepalive = false } = {}) {
    if (working) return
    if (Date.now() < nextAttempt) { window.clearTimeout(timer); timer=window.setTimeout(flush,nextAttempt-Date.now()); return }
    working = true
    try {
      await initial
      while (pending.length) {
        const batch = pending.slice(0, 50)
        const result = await request('/api/selections', { method: 'POST', body: { operations: batch }, keepalive })
        const sent = new Set(batch.map(item => item.mutationId))
        pending = pending.filter(item => !sent.has(item.mutationId))
        accept(result)
      }
      failures=0;nextAttempt=0
      publish('Your selection is saved.')
    } catch (error) {
      failures++
      if (error.status===429 || failures<=3) {
        const delay=error.status===429 ? Math.max(1000,(error.retryAfter || 60)*1000) : 1000*2**failures
        nextAttempt=Date.now()+delay
        window.clearTimeout(timer);timer=window.setTimeout(flush,delay)
        publish('Kept on this browser. Saving will retry shortly.')
      } else publish('Saved on this browser. Reconnect to finish saving.')
    }
    finally { working = false; persist() }
  }
  function capture(change) {
    const next = validateSelection(state)
    const before = new Map(baseline.cart.map(line => [line.id, line.quantity]))
    const after = new Map(next.cart.map(line => [line.id, line.quantity]))
    for (const id of new Set([...before.keys(), ...after.keys()])) {
      if ((before.get(id) || 0) !== (after.get(id) || 0)) pending.push(change?.id === id && Number.isInteger(change.delta) ? operation(id, 'delta', change.delta) : operation(id, 'quantity', after.get(id) || 0))
    }
    for (const id of new Set([...baseline.wishlist, ...next.wishlist])) {
      if (baseline.wishlist.includes(id) !== next.wishlist.includes(id)) pending.push(operation(id, 'favourite', next.wishlist.includes(id)))
    }
    baseline = copy(next)
    persist(); publish('Saving your selection…')
    window.clearTimeout(timer)
    timer = window.setTimeout(flush, Math.max(250, nextAttempt-Date.now()))
  }
  const reconnect = async () => {
    if (working) return
    failures=0
    if (pending.length) return flush()
    try { accept(await request('/api/selections')); publish('Your selection is saved.') } catch {}
  }
  const onPageHide = () => { window.clearTimeout(timer); persist(); if (pending.length) void flush({ keepalive: true }) }
  window.addEventListener('online', reconnect)
  window.addEventListener('focus', reconnect)
  window.addEventListener('pagehide', onPageHide, { once: true })
  persist()
  void initial.then(() => { if (pending.length) void flush() })
  return { capture, retry: reconnect, get status() { return status } }
}
