const base = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '')
let browserKey

function privateKey() {
  if (browserKey) return browserKey
  try { browserKey = localStorage.getItem('uw-browser-key') } catch {}
  if (!/^[a-zA-Z0-9-]{32,128}$/.test(browserKey || '')) {
    browserKey = `${crypto.randomUUID()}${crypto.randomUUID()}`
    try { localStorage.setItem('uw-browser-key', browserKey) } catch {}
  }
  return browserKey
}

export async function request(path, { method = 'GET', body, signal, headers = {}, keepalive = false, timeoutMs = 12000 } = {}) {
  let response
  try {
    response = await fetch(`${base}${path}`, {
      method,
      headers: { Authorization: `Bearer ${privateKey()}`, ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs),
      keepalive,
    })
  } catch (error) {
    if (signal?.aborted) throw error
    throw new Error('The workshop connection is unavailable. Your work is still here; please try again.')
  }
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(payload.error || 'Something went wrong. Please try again.')
    error.status = response.status
    error.retryAfter = Number(response.headers.get('retry-after')) || 0
    throw error
  }
  return payload.data
}

export function readLocal(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback } catch { return fallback }
}

export function writeLocal(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true } catch { return false }
}
