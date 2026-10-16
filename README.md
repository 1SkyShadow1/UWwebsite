# Upholstery Warehouse

A Vite store and upholstery showroom with a shared design system, textile discovery, furniture selection, a material studio with local previews and optional generative image editing, and a persistent SQLite API.

The shared theme uses the supplied Upholstery Warehouse logo and its black, white and yellow-gold palette. Dark mode uses pure black; light mode uses white with contrast-adjusted gold text and the same bright gold controls. Brand colors live in `src/atelier.css`.

## Run locally

Use Node.js 24 or newer.

```sh
npm ci
npm run dev
```

Open `http://localhost:3000`. Vite serves the frontend and API together; a second API process is unnecessary. Optional configuration goes in `.env`, using `.env.example` as a reference. Only variables prefixed with `VITE_` are exposed to the frontend.

## Production

```sh
npm run build
npm start
```

The production server serves the built `dist/` site and `/api/` on the same origin. `PORT` defaults to 3000. The build also synchronizes the MediaPipe browser bundle and WASM files with the installed dependency version.

The API uses [Node’s SQLite module](https://nodejs.org/api/sqlite.html). Records are stored in `.data/warehouse.sqlite`, outside the public site and ignored by Git. Set `UW_DB_PATH` to a persistent disk path when deploying, and back up that database. Swatches and briefs survive API restarts. Each browser keeps its own private key; this is device-scoped saving, not a cross-device account system.

The workshop can read and update enquiries on the server host:

```sh
npm run inbox
npm run inbox -- --status received
npm run inbox -- --set-status <full-enquiry-id> reviewing
```

The inbox prints the latest 100 enquiry records, including contact information and attached selections. Status choices are `received`, `reviewing`, `in-conversation` and `closed`; changes appear in the customer's private receipt. This is a host operator command. Customer endpoints cannot change workshop status or retrieve other browsers' records. Enquiries are saved in the database; email delivery and CRM forwarding are not configured.

For a separate API host, use `npm run api` (port 3001 by default), set `VITE_API_BASE` before building the frontend and set `CORS_ORIGIN` to the exact frontend origin.

## Features

- Black, white and yellow-gold branding, pure black dark mode, a persistent theme, responsive navigation, a mobile dock, keyboard-accessible overlays and reduced-motion support.
- A store homepage with room collections, featured pieces and clear paths into furniture, fabric discovery and the Studio.
- Unified search across furniture, materials and planning tools, including unaccented searches for names such as bouclé. Open it with Ctrl/Cmd+K and navigate results with the arrow keys.
- 99 material directions with a guided finder, filters, shareable search URLs, flip cards, eight saved swatches and comparison of up to three materials.
- 35 furniture listings with search, category/price filters, sorting, favourites, rich product details, quantity selection, source links, material pairings, comparison of up to three pieces and recently viewed products.
- A private server-backed furniture selection with catalogue-calculated totals, validated quantities, atomic command batches and duplicate-safe retries. Additions from overlapping requests merge; offline commands stay cached for reconnection.
- My showroom brings saved furniture, materials, editable project briefs and private enquiry receipts together. Recently viewed products stay on the browser.
- A planner with shared frontend/API calculation rules, pattern allowance, local draft recovery, individual material choices, private brief creation/editing and downloadable text briefs.
- A contact form that validates contact details and consent, attaches exact material choices, furniture quantities and a plan, and returns a downloadable enquiry receipt. Repeated submissions with the same request key do not create duplicates.
- A swatch book with downloads, comparisons and server restoration, without interrupting the active Studio preview when a saved material changes.
- Journal notes that expand into readable articles.
- On-device image selection and depth, automatic material response, brush/eraser refinement, undo/redo, keyboard controls, original/new comparison, 4K/8K export and ten generated 3D upholstery studies. Source-pattern suppression and structural crease preservation improve photo previews; difficult prints and selection edges can still require refinement.

Material studies, AI product reconstructions, screen previews and reference prices are indicative. Exact material specification, live supplier pricing/availability and final project quantities need confirmation. Planning ranges are illustrative linear metres at 140 cm fabric width; leather requires separate assessment.

AI Studio has a server-side OpenAI image-editing integration. On Windows, run `npm run configure:ai` and enter the key in the temporary local connection page; Windows encrypts it for the signed-in account, outside the public site. Alternatively, set `OPENAI_API_KEY` on the server. `OPENAI_IMAGE_MODEL` defaults to `gpt-image-2.5-sunburst`. Never prefix a provider key with `VITE_`. The browser's Refresh AI connection control detects a newly saved connection without a server restart.

Generate AI reupholstery sends the original photograph, upholstery mask and selected fabric reference to OpenAI and uses the API project's billing. The local preview works without that connection. Generated results stay in server memory for up to 15 minutes and are not saved in the database. 4K/8K downloads report the AI master's dimensions and disclose resizing. See the [Studio guide](docs/STUDIO.md) for setup, endpoints and operating limits.

The older standalone `/api/visualiser/preview` flow still reports `awaiting-provider`; `AI_IMAGE_PROVIDER` does not enable it. R2 and 8th Wall integrations require their documented configuration; camera access depends on the browser, device and HTTPS.

## AI Studio realism

AI Studio now uses local AI depth estimation, automatic selection, depth-guided fabric placement and material-specific light response. It has ten generated 3D upholstery forms, live camera tracking, 4K/8K PNG exports and private saved setup recipes. The comparison slider remains; the other sliders have been replaced with automatic settings. See [the Studio guide](docs/STUDIO.md) for the pipeline, licenses, asset preparation, privacy and practical realism limits.

## API

Private endpoints accept `Authorization: Bearer <browser-key>`. The browser creates the key with Web Crypto, saves it locally and sends it in headers. The database stores an owner hash. Bodies are validated JSON with a streaming 2 MB limit (24 MB for image-generation requests); unapproved origins are rejected and writes are rate limited.

| Endpoint | Purpose |
| --- | --- |
| `GET /api/health` | Service health |
| `GET /api/materials` | Same material catalogue used by the site |
| `GET /api/furniture` | Same furniture catalogue used by the site |
| `GET/PUT /api/shortlist` | Private saved material IDs |
| `GET/POST /api/selections` | Private furniture bag/favourites and validated, retry-safe changes |
| `GET/POST /api/projects` | Private project briefs |
| `PUT /api/projects/:id` | Edit an owned project brief |
| `DELETE /api/projects/:id` | Delete a brief owned by that browser |
| `POST /api/estimates` | Validated planning calculation |
| `GET/POST /api/enquiries` | Private receipts and consented project enquiry submission |
| `GET /api/studio/capabilities` | Local Studio features and provider connection status; no credentials |
| `GET/POST /api/studio/designs` | Private settings-only Studio recipes |
| `POST /api/studio/generations` | Start an owner-private image edit with an `Idempotency-Key` |
| `GET/DELETE /api/studio/generations/:id` | Read or cancel that browser's temporary AI edit |
| `POST /api/visualiser/sessions` | Private preview session |
| `POST /api/visualiser/preview` | Report cloud provider availability |

## Verify

```sh
npm test
npm run check:assets
npm run build
```

Tests exercise actual HTTP requests, catalogue parity, owner isolation, enquiry validation, malformed/oversized bodies, authoritative prices and planning quantities, transaction rollback, concurrent additions, duplicate-safe retries, project editing, operator status changes, persistence after closing/reopening SQLite, production static-file boundaries, Studio composition and asset integrity. Browser checks should include desktop and mobile, saving, comparison, project submission, enquiries and compiled production assets. See `docs/QA.md` for the completed local verification.
