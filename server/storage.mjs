const required = [
  'R2_ENDPOINT',
  'R2_BUCKET',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
]

export function getR2Status() {
  const configured = required.every((name) => Boolean(process.env[name]))
  return {
    provider: 'cloudflare-r2',
    configured,
    bucket: configured ? process.env.R2_BUCKET : null,
    publicAccess: false,
    message: configured
      ? 'Private R2 storage is configured server-side.'
      : 'R2 is not configured; browser-local previews remain active.',
  }
}

export function assertR2Configured() {
  const status = getR2Status()
  if (!status.configured) {
    throw new Error('R2 storage is not configured. Add rotated server-side credentials before enabling uploads.')
  }
}
