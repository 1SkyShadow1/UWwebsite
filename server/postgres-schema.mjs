// These records are accessed only through the Node API's private browser keys.
// Supabase's public Data API must not expose saved enquiries or generated images,
// even when its default privileges grant new tables to client roles.
export const postgresSchema = [
  `CREATE TABLE IF NOT EXISTS public.uw_owner_records (
    owner TEXT PRIMARY KEY,
    records JSONB NOT NULL DEFAULT '[]'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS public.uw_image_jobs (
    id TEXT PRIMARY KEY,
    owner TEXT NOT NULL,
    request_key TEXT NOT NULL,
    digest TEXT NOT NULL,
    created_ms BIGINT NOT NULL,
    expires_ms BIGINT NOT NULL,
    result JSONB NOT NULL,
    UNIQUE(owner, request_key)
  )`,
  'CREATE INDEX IF NOT EXISTS uw_image_jobs_expiry ON public.uw_image_jobs(expires_ms)',
  'ALTER TABLE public.uw_owner_records ENABLE ROW LEVEL SECURITY',
  'ALTER TABLE public.uw_image_jobs ENABLE ROW LEVEL SECURITY',
  'REVOKE ALL PRIVILEGES ON TABLE public.uw_owner_records, public.uw_image_jobs FROM PUBLIC',
  `DO $privacy$
  DECLARE client_role TEXT;
  BEGIN
    FOREACH client_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = client_role) THEN
        EXECUTE format(
          'REVOKE ALL PRIVILEGES ON TABLE public.uw_owner_records, public.uw_image_jobs FROM %I',
          client_role
        );
      END IF;
    END LOOP;
  END
  $privacy$`,
]
