# Store and showroom validation

Latest local review: 19 October 2026.

## Generated upholstery photographs — 19 October 2026

- Photograph mode now displays the actual original image until a generated edit is ready. Its material shader is no longer used for the photo result; live camera studies and 3D remain separate estimates. Generation controls sit above the photograph, and the original/new comparison appears only for a generated result.
- Added explicit native 1K/2K/4K AI detail, with 4K selected initially. Export uses the finished generated image directly. 8K export remains explicitly labelled as resizing the native master.
- Google requests use the documented generateContent endpoint with one candidate, bounded output tokens, a swatch and a protected selection guide. Nonstandard photo proportions are padded to a supported ratio and cropped back after generation, without stretching the furniture. Native detail is part of both local and durable retry fingerprints.
- Recent edits are cached in the browser with count/byte limits. Returning to a cached fabric/detail restores the existing image without another paid request. Generation locks photo/material/selection changes until completion or explicit cancellation.
- All 66 automated tests pass and the 84-module production build succeeds. Local browser checks with a mocked provider confirmed an untouched original, disabled pre-generation export, generated comparison, original view, detail-cache restoration and no console errors. Mock images are workflow fixtures, not evidence of AI realism.
- Live Google token-count validation found that the newer `responseFormat.image` fields require enums rather than the string size/aspect values used by `imageConfig`. The adapter now uses `imageConfig`, which Google accepted with HTTP 200. This compatibility check does not generate an image.
- The single subsequent 1K live proof reached the corrected endpoint but failed with Google's HTTP 429 quota/billing/rate limit response; no image was returned and no automatic paid retry was made. Live generated realism and native 4K output remain unverified until that API project has usable generation quota. The interface keeps the original on failure, clears stale error text when a new request starts, and preserves the last failure when a configuration-only refresh cannot validate provider quota.

## Supabase production connection — 19 October 2026

- Created a dedicated Upholstery Warehouse project on the quoted $0/month Supabase Free plan, in the organization selected by the user. Connected it to the storefront's Vercel Production environment through the Marketplace integration; database credentials are stored as Vercel secrets.
- Applied and queried the server tables. Both have row-level security enabled, and neither `anon` nor `authenticated` has table access. Supabase's security advisor reported only the two expected [informational notices for deliberately policy-free server tables](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy); there were no security warnings or errors.
- Shared schema initialization preserves these restrictions after future deployments. A PostgreSQL regression simulates permissive Supabase default grants, checks that they are revoked, and verifies that row-level security still hides records if SELECT is later granted.
- All 64 tests pass; the 83-module production build succeeds; all 237 referenced assets exist. Provider tests use mocks and do not charge API credits. Live provider output quality remains unverified.
- A live save exposed `SELF_SIGNED_CERT_IN_CHAIN` with Supabase's pooler certificate. The Node adapter now bundles the provider's public root CA and retains certificate/hostname verification. The regression exercises pg's real URL/options parser to ensure integration SSL parameters cannot replace that configuration.
- After redeployment, production health and capabilities returned HTTP 200 with hosted storage and the Google connection configured. A disposable-owner smoke check passed actual saves/reloads, concurrent quantity updates, duplicate retries, rollback, projects, Studio recipes, CORS rejection and owner isolation. Both disposable owner rows were removed afterward. No paid image generation was requested; provider billing, model access and generated output quality remain unverified.

## Vercel API routes and persistence — 16 October 2026

- Added a Vercel Node entry point and `/api/*` rewrite for capabilities, selections, shortlist and the other shared API routes. The prior Vite-only deployment had no server function.
- Added PostgreSQL-backed owner repositories with transaction/row-lock protection. Tests run a real embedded PostgreSQL engine and verify persistence across independent handlers, owner isolation, rollback and duplicate-safe quantities.
- Hosted AI jobs use a durable claim before provider work and persist temporary results for retries on another function instance. Generation completion is awaited within the request; large JSON responses are streamed. Uploads are compressed below the hosted request limit. Quotas, cancellation, expiry and cached results are tested without paid API calls.
- All 62 tests pass; production build passes with 83 modules; the asset check has 237 references and no missing assets. Server deployment prepares only the 50 required fabric references and excludes local keys, databases and browser model/runtime bundles.
- Hosted operation still requires a PostgreSQL URL and the server-only Google key in Vercel Production environment variables, followed by redeployment. Local encrypted Windows credentials are not transferred. See `docs/VERCEL.md` for the dashboard steps. No live provider generation or cloud database connection was tested locally.

## Google connection — 16 October 2026

- Added a Google-specific encrypted connection form and Gemini image-edit adapter, with provider-tagged credentials and per-job provider routing. Legacy OpenAI credentials remain supported. Google defaults to 1K to limit cost.
- All 58 automated tests pass. Google request tests use mocked responses and check the endpoint, key header, original/swatch/opaque guide, thought-image exclusion, sanitized errors, provider dispatch and credential isolation. Production build passes with 83 modules. The Google key form was verified in the browser.
- No live Google generation has been run. Saving the key does not generate an image; successful account access, quota and output realism remain unverified until an explicit generation.

## Generative fabric replacement — 16 October 2026

- Added server-side OpenAI image editing from the original photograph, transparent upholstery mask and a separate catalogue fabric reference. The local texture preview is never sent as the original or reapplied over a generated result. Protected room pixels are restored from the original.
- Added the Windows local connection helper. The actual user-saved credential is encrypted with current-user DPAPI in ignored private storage. A read-only provider check returned HTTP 200 for the selected model; no key appeared in logs or public responses.
- `npm test`: 56 tests pass, including the real adapter with mocked provider responses, exact selected/unselected pixel checks, private HTTP jobs, duplicate-request protection, cancellation, provider timeout, sanitized errors and Windows encryption. `npm run check:assets`: 237 references, zero missing assets. Production build: 83 modules, 12 entry points.
- Browser checks confirmed on-device selection/depth, connected-state refresh, keyboard comparison, a single range input and a narrow mobile layout without horizontal overflow. No warnings/errors appeared in those controls. The runtime sync now skips identical files to avoid Windows locks on browser-loaded WASM assets.
- The user authorized one low-budget live test. The temporary test server enforced one upstream attempt at `low` quality and 1024 × 768 output. OpenAI returned HTTP 429 (billing quota or rate limit), so no image was returned and no paid retry was made. Normal generation defaults remain high quality with the supported native output cap.
- Live generated-image quality and a successful provider-backed 4K/8K export remain unverified because of that provider limit. Existing local photo/3D exports retain their earlier verification. Physical camera hardware remains unverified.

## Photo layering and shading — 16 October 2026

- Replaced broad, flattening illumination smoothing and strong synthetic relighting with separate linear-light diffuse, contact-shadow and smoothed geometry layers. New photo material presets retain quiet velvet pile and stronger bouclé relief. Highlights fade in creases and at boundaries; matched channels share texture projections and mipmaps.
- Corrected the support-protection rule that clipped the sloping sofa base. AI mask enlargement uses bilinear confidence sampling instead of nearest-neighbour steps.
- Lighting runs in a separate worker with coalesced updates and stale photo-result rejection. Refinement remains interactive; photo export waits for selection, depth and lighting. Camera export freezes its source before settling the layers.
- `npm test`: 47 tests pass. New regressions cover sloping bases versus actual legs, velvet/bouclé microstructure, retained form shadows and suppressed weave, independent contact occlusion, finite smooth normals and fractional selection coverage.
- `npm run build`: passes, 82 modules and all 12 entry points. The existing large lazy-bundle advisories remain. `npm run check:assets`: 237 references, zero missing assets.
- Browser checks exercised local selection/depth, velvet and leather, an uploaded Alba chair, comparison controls, clear/undo recovery and the actual WebGL 2 renderer. No warnings/errors were observed in these checks.
- The revised photo export returned a PNG header verified as 7680 × 5760. The compiled production build also completed a 3840 × 2880 export. Output continues to preserve the original room and image proportions.
- Saved proof: `uw-studio-layered-realism.jpg` in the task visualization directory. The compiled app is served locally on port 3010 for review, with the development server on port 3000.
- This revision does not establish measured reflectance or perfect intrinsic-image decomposition from an arbitrary photo. Strong original prints can still need refinement, and physical camera hardware remains unverified.

## AI Studio — 15 October 2026

- `npm test`: 42 tests pass, including material profiles, ten distinct meshes, selection consensus, mask repair, crease preservation, local model integrity, worker recovery, camera cancellation, encoded PNG dimensions and private setup API validation/idempotency.
- `npm run build`: passes, 80 modules and all 12 HTML entry points. Lazy rendering/AI bundles produce size advisories.
- `npm run check:assets`: 237 references, zero missing assets. `npm audit --omit=dev`: zero vulnerabilities.
- Browser verification exercised real local segmentation and depth inference, all ten 3D forms, material changes, comparison keyboard controls and compiled worker export. Only the original/new comparison range remains.
- Native exported PNG files were independently inspected: 3D Chesterfield 7680 × 4320, photograph 3840 × 2880. Export labels use encoded dimensions, with smaller-device limits disclosed.
- Mobile checks at 390px and 320px found no horizontal page overflow; output controls and navigation fit. The 320px light theme computed to white; dark mode preserves the black brand treatment.
- Production HTTP checks confirmed the model, WASM, JavaScript runtime MIME and capabilities endpoint. Photos and camera frames remain on the device; saved setups contain recipes only.
- Physical camera permission did not complete in this browser session; the UI recovered with its permission timeout and photograph/retry guidance. Deadline, cancellation and late-grant cleanup are covered by tests; hardware capture, live tracking and camera export still need device verification. A large export does not recover absent source detail, and generated 3D studies do not reconstruct an uploaded object.

Visual evidence and an independently verified native 8K PNG are saved in the task visualization directory. The development server remains available on port 3000.

## Store polish — 14 October 2026

- `npm test`: all 27 tests pass. Added actual HTTP coverage for private furniture selections, catalogue prices, command retries, atomic rollback, simultaneous additions, quantity validation, duplicate-safe enquiries and project creation, project editing, operator status changes and redacted customer receipts. Studio tests verify source-pattern smoothing while retaining broad lighting and exact unselected pixels.
- `npm run build`: successful production build, 70 modules and all 12 HTML entry points.
- `npm run check:assets`: 99 material directions, 35 furniture listings, 58 furniture forms, 214 referenced assets and zero missing assets.
- `git diff --check`: no whitespace errors.
- Reviewed every compiled page at 1440px and 390px: home, materials, furniture, services, journal, contact, planner, My showroom, lab, landing, photo visualiser and AI Studio. Page scroll width matched client width, header controls fit, and the mobile dock appeared at the mobile breakpoint. No browser errors or warnings were observed in these route checks.
- Reviewed home, furniture, contact, My showroom, Studio and planner in light mode at 320px. Header controls remained within the viewport and page overflow checks passed. Dark mode computed to pure black; light mode computed to white.

Verified customer and workshop flows:

- Unified search finds bouclé materials from the unaccented query `boucle`; keyboard Enter opens a matching furniture detail. Search and guided finder dialogs fit on mobile.
- Product details support quantity selection, favourites, comparison, source links and material pairing directions. Comparing Alba and Porter uses two desktop columns and one mobile column.
- Two Alba chairs produce the authoritative R13,800 reference subtotal. The compiled store reports the selection saved, and favourites/materials remain available after navigation.
- The finder saves Cream bouclé directly into My showroom without a page reload; the swatch download button becomes available immediately.
- A wingback brief for two chairs was saved, reopened, changed to three and updated in place, with one record and a recalculated 13.3–17.9 m indicative range. The exact selected material was restored.
- A local enquiry with furniture quantities, a material and the project plan returned a private receipt. Its downloaded text contained those attachments. A host-side change to `reviewing` appeared as “Being reviewed” in My showroom.
- The sample Studio sofa was selected on-device. Preview export, clear, undo and redo changed correctly. Removing a saved material while the Studio was active preserved the 1000px photo canvas and enabled export.
- The generic 3D study rendered with matched base-colour, normal and roughness maps, with no browser warnings or errors in that check.

Saved visual evidence: `uw-store-showroom.jpg`, `uw-store-comparison.jpg` and `uw-store-mobile.jpg` in the task's visualization directory.

The labelled local verification enquiry and brief were removed after checking the receipt and workshop status flow. Temporary preview servers were stopped after verification.

## Original atelier redesign — 12 October 2026

Validated locally on 12 October 2026.

## Automated checks

- `npm test`: 16 passing tests covering HTTP API validation, private records, authoritative planning calculations, enquiry consent/contact validation, streaming body limits, database restart persistence, production file boundaries, studio compositing and asset integrity.
- `npm run check:assets`: 99 materials, 35 shop listings, 58 furniture forms, 214 referenced assets and zero missing assets.
- `npm run build`: successful Vite production build for all 12 HTML entry points.
- `git diff --check`: no whitespace errors.

## Browser checks

Checked the primary pages at 1440 px and 390 px viewport widths, including home, materials, furniture, services, journal, contact, studio, planner, swatch book and material lab. Also checked the standalone landing and photo visualiser pages. No horizontal page overflow or browser errors were observed in those checks.

Verified interactions:

- Home mood switching and saving materials.
- Material search, filter counts, card flipping with inactive faces made inert, and a native comparison dialog on desktop and mobile.
- Furniture search, favourites, the saved-only filter, quick view, adding to the bag, and Escape dismissal.
- Planner quantity updates, pattern allowance, saved draft recovery, server-backed brief saving, and retrieval in the swatch book.
- Contact submission with consent, attached selections and an enquiry receipt.
- The compiled production contact form served by `npm start`, with enquiry records confirmed in SQLite.
- Theme switching and persistence through page navigation.
- Lab furniture form selection.
- On-device AI selection on the sample sofa, with preview export enabled.
- 3D inspector rendering with matched base colour, normal and roughness maps.

The review found and repaired a stale quantity display, mismatched workshop imagery, a legacy CSS block overriding the material palette, an unnecessary scroll container and selected-control contrast.

## Brand palette review — 14 October 2026

The supplied logo is used unchanged in the header, footer and loading screen. Shared UI tokens now use black, white and bright yellow-gold; dark mode has a pure black page background. Gold fills use black labels, while gold text on white uses a deeper shade for contrast.

- All 16 existing tests and the production build passed. The asset audit found 214 referenced assets and no missing files.
- Reviewed the shared branding across the desktop pages, including materials, furniture, planner, contact, Studio, journal, services, lab and saved materials. Theme choice persisted through navigation.
- Checked both homepage themes at 1440px, and the homepage, materials, planner, contact, furniture and Studio in dark mode at 390px. The 320px light theme check found and repaired a clipped menu button; all header controls now fit.
- Verified pure black computed backgrounds, the supplied logo loading, gold controls with black labels, and neutral Studio surfaces. Browser checks reported no errors or warnings in the reviewed flows.

## Configuration boundaries

AI Studio's image-editing adapter and encrypted local connection are implemented, but the live request is currently blocked by the API project's quota or rate limit. The older standalone visualiser and email/CRM forwarding remain unconnected. Enquiries are persisted and available with `npm run inbox`. Hardware camera access and 8th Wall tracking were not exercised; these require the intended device, browser permissions and configuration. Material previews and planning allowances remain indicative. No live hosting deployment was performed.
