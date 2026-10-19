# Vercel frontend and backend

The Vercel deployment serves the Vite build from `dist/` and sends every `/api/*` request to `api/handler.mjs`. This fixes the missing capabilities, selections, shortlist, projects and enquiry routes without requiring a separate public backend URL. Keep `VITE_API_BASE` empty for this same-origin deployment.

## One-time dashboard setup

1. Open the project serving `u-wwebsite.vercel.app` in Vercel.
2. Under **Storage**, connect a Supabase or Neon Postgres database through the Marketplace. Connect it to the project's **Production** environment. The application accepts the pooled `DATABASE_URL` or `POSTGRES_URL` supplied by the integration. For Supabase, use the **Transaction pooler** connection on port **6543**, with SSL enabled; the public project URL and publishable key are not PostgreSQL credentials.
3. Under **Settings → Environment Variables**, add `GEMINI_API_KEY` with the Google AI Studio key and select **Production**. This is a server secret: never use a `VITE_` prefix. The encrypted Windows key on your computer is not uploaded to Vercel.
4. Optional server settings: `AI_IMAGE_PROVIDER=google`, `GOOGLE_IMAGE_MODEL=gemini-3.1-flash-image`, `GOOGLE_IMAGE_SIZE=1K`, `AI_DAILY_GENERATION_LIMIT=20`. The hosted backend defaults to Google and 1K. The generation limit is shared across instances and counts attempts over a rolling 24-hour window.
5. Deploy the latest `main` commit. Changes to environment variables require a new deployment. Use the repository root as Vercel's Root Directory; `vercel.json` supplies the build, output and API routing settings. Node is pinned to 24.x.

If the Marketplace asks you to choose a plan, review the terms and choose the plan you intend to use. This repository does not provision or purchase hosting or storage automatically.

## Check the deployment

- `/api/health` returns HTTP 200 and `storageConfigured: true` once a database URL is configured. This flag indicates configuration; saving a swatch also verifies database access.
- `/api/studio/capabilities` returns HTTP 200 and reports Google configuration. Missing hosted storage or a missing server key produces explicit setup guidance, not a fake generated result.
- Save a swatch or change a furniture quantity, reload, and confirm that it is restored. These operations use the browser's existing private owner key.
- A paid AI generation is a separate, explicit action. Adding the key, calling capabilities, and running the automated suite do not generate paid images. Model access, provider billing and actual output quality still need a live test.

Missing storage returns HTTP 503 with `STORAGE_NOT_CONFIGURED` for private saves. The browser retains its local copy. Never use `/tmp` SQLite as production persistence on Vercel.

## Storage and concurrency

PostgreSQL stores each browser owner's record set under a row lock. Each request runs the existing validation and SQLite transaction logic in a private, in-memory repository; a successful mutation is committed to PostgreSQL before its HTTP response is released. Failed mutations leave the durable state unchanged. Separate function instances therefore share authoritative selections, swatches and retry references. No SQLite file is written on Vercel.

Both server tables enable row-level security and revoke access from `PUBLIC` and Supabase's `anon`/`authenticated` roles. There are deliberately no client policies: the Node backend connects as the table owner and enforces browser ownership itself. Do not grant these tables to browser clients or put database credentials in `VITE_` variables. The same schema statements live in `server/postgres-schema.mjs` for deployment and automated verification.

Supabase connections use its [published database CA](https://supabase.com/docs/guides/platform/ssl-enforcement), bundled in `server/certs/supabase-prod-ca-2021.crt`. The Node adapter explicitly verifies the server certificate and hostname, and prevents integration URL parameters from overriding that configuration. The public CA is valid until 26 April 2031 and was downloaded from `https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt`; its SHA-256 fingerprint is `80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA`. Rotate it when the provider publishes a replacement. Other PostgreSQL providers retain their connection URL configuration.

Image request claims and results also live in PostgreSQL. The claim is committed before contacting the provider. A retry on another function instance returns the existing job instead of creating another paid request. The originating function awaits completion within its 300-second duration; it does not depend on work continuing after a 202 response. Other instances can retrieve or cancel the owner-private job. A daily attempt limit and two active jobs bound provider use. Interrupted jobs do not automatically retry the provider.

Original photographs and masks are not stored in PostgreSQL. Generated results include the restored room and are temporarily stored for private recovery and duplicate-safe retries. Results become inaccessible after 15 minutes; expired image payloads are purged when a subsequent job read/claim runs. Request metadata is retained for up to 24 hours to enforce the rolling limit and is cleaned during new claims. Saved recipes contain settings only. Physical deletion of expired payloads is lazy; this is not a guaranteed timed-erasure service.

Hosted uploads are bounded below Vercel's request limit. The client sends a high-quality JPEG of the original plus a PNG mask, preserving the full original locally for exports. Large result JSON is streamed. 4K/8K downloads still report the actual AI master and disclose resizing. A cancellation aborts local provider work when detected, but cannot guarantee already-started provider work is unbilled.

The function bundles only the 50 catalogue fabric references it needs. `npm run prepare:vercel` prepares these during the install phase; browser depth models, WASM runtimes and furniture assets remain static files. `.vercelignore` and function exclusions keep local credentials and databases out of the deployment.

The local workshop inbox command still reads the local SQLite database; it is not an administrator interface for the hosted PostgreSQL records.

References: [Vercel Node functions](https://vercel.com/docs/functions/runtimes/node-js), [Vercel storage integrations](https://vercel.com/docs/marketplace-storage), [environment variables](https://vercel.com/docs/environment-variables), [streaming large responses](https://vercel.com/kb/guide/how-to-bypass-vercel-body-size-limit-serverless-functions).
