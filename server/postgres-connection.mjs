import { readFileSync } from 'node:fs'

export function hostedPostgresOptions(env) {
  const connectionString = (env.DATABASE_URL || env.POSTGRES_URL)?.trim()
  if (!connectionString) return null
  let url
  try {
    url = new URL(connectionString)
    if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error()
  } catch {
    throw new Error('The hosted PostgreSQL connection URL is invalid.')
  }
  const options = { connectionString, max: 3, idleTimeoutMillis: 10000, connectionTimeoutMillis: 10000, allowExitOnIdle: true, application_name: 'upholstery-warehouse' }
  const supabase = url.hostname.endsWith('.pooler.supabase.com') || /^db\.[a-z0-9]+\.supabase\.co$/.test(url.hostname)
  if (supabase) {
    // pg's URL SSL parameters replace its explicit `ssl` options. Remove them
    // before supplying the provider CA, retaining certificate and hostname checks.
    for (const name of ['ssl', 'sslmode', 'sslrootcert', 'sslcert', 'sslkey', 'uselibpqcompat']) url.searchParams.delete(name)
    options.connectionString = url.toString()
    options.ssl = { ca: readFileSync(new URL('./certs/supabase-prod-ca-2021.crt', import.meta.url), 'utf8'), rejectUnauthorized: true }
  }
  return options
}
