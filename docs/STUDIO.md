# Material Studio

The October 2026 revisions are scoped to AI Studio and its material processing. Hosted persistence and provider deployment are described in [VERCEL.md](VERCEL.md).

## Current photograph workflow

Photograph mode shows the original until an explicit AI generation completes. It skips unused PBR texture downloads and local relighting analysis. The backend prepares inputs once, caches prepared swatches in a bounded cache and sends compact JPEG references. Actual processing stages stream to the browser alongside elapsed time; provider queue time remains variable. Quick is the default: a compact 1K Pollinations Flux 2 Klein edit, with no additional recognition or refinement pass. Realism explicitly selects the direct Gemini image-editing connection and defaults to 2K, with 1K/2K/4K detail choices. Each mode checks its own server credential; failures never silently switch to another paid provider. Older API clients retain their configured provider routing. Provider inference and queuing still determine actual latency.

Uploads first locate a couch, chair or bed with the local MediaPipe EfficientDet model. Magic Touch selects upholstery inside that furniture boundary; a non-furniture upload stays unselected rather than selecting the room. Quick and Realism both leave cushion recognition off by default. Switching modes never starts paid recognition.

**Find cushions with AI** explicitly runs local quantized SlimSAM boundary proposals, then sends the original photo and coloured candidate guide to Gemini for structured part identification. Only confidently identified cushions, seat cushions, back cushions and loose pillows become separate cards. Arms, bases, fixed back panels and ambiguous fragments stay in the main upholstery item. This recognition is an analysis request, not an image edit, and uses Gemini credits. Optional identification on upload must be enabled explicitly and runs at most once per new photograph; failures do not automatically retry. Successful recognition is reused for matching boundaries in the current photograph. The initial local model download is about 18 MB, and CPU boundary analysis can take a minute. Progress and Stop detection are available. Recognition is not guaranteed for every photograph: inspect outlines and correct them manually.

Select the main furniture card or a cushion/pillow card, then choose its fabric. A selected part type can be corrected without losing its outline or fabric. Manual types are limited to Cushion, Pillow, Seat cushion and Back cushion; old API recipe types remain readable for compatibility. Up to six cushions/pillows can be separated. Later outlines win overlaps, exact detected bitmaps retain holes, and every edit stays clipped to the furniture selection. Tapping the room never selects a part merely because its outline encloses that point. Keep unassigned upholstery original to change just the cushions. The original-versus-result comparison remains available.

Each distinct fabric uses one isolated AI edit with only its own swatch and a white-edit/black-protect guide. Matching fabrics share a call. At most two calls run concurrently, with up to seven calls per design. The UI shows the expected edit count before Generate; provider credits apply to each edit. Server-owned region labels restrict each returned image to that fabric's assigned pixels, and inward-only feathering protects the room. The design is shown only after all edits succeed. Failures stop queued calls and never retry automatically; started calls can still consume credits. Provider inference can still alter details inside an editable section, so compare seams and shape against the original.

Tap corners and finish the outline, or use the focused photograph's keyboard crosshair: arrows move, Shift makes larger steps, Space adds a corner, Enter finishes, Backspace removes a corner and Escape cancels. Version 2 saved recipes preserve fabrics and native detail, but contain no photographs, masks, section bitmaps or outlines. Restored parts must be outlined again before generation. Actual returned pixel dimensions are shown; mixed-resolution provider results use the smallest returned scale. 4K/8K export can enlarge a smaller master without inventing native detail.

## Generative upholstery replacement

Google Gemini can be selected with `npm run configure:ai -- --google`. Its key form is separate from the public site, uses the same Windows encryption, and saves a provider tag so a Google credential is never reused for an OpenAI request. Existing records without a provider tag remain OpenAI connections. For hosted configuration use `AI_IMAGE_PROVIDER=google` and `GEMINI_API_KEY` (or `GOOGLE_API_KEY`). Google defaults to `gemini-3.1-flash-image` with `GOOGLE_IMAGE_SIZE=1K` to limit cost; 2K and 4K can be selected explicitly. 4K/8K download sizes still resize the returned master.

The Google adapter uses Google's Generate Content REST API with the original photograph, fabric swatch and an opaque white-edit/black-protect selection guide. Gemini treats the guide as an image reference rather than a strict inpainting mask; the server therefore restores protected room pixels and rejects excessive framing changes. Google quota, credentials, filtered outputs and missing images have sanitized errors. Switching the saved provider changes subsequent jobs; each running job keeps its original provider. No provider request is made when saving a key. See [Google's image editing documentation](https://ai.google.dev/gemini-api/docs/generate-content/image-generation). The OpenAI-specific configuration and limits below apply when OpenAI is selected.

Generate AI reupholstery runs a server-side image edit using the untouched photograph, upholstery selection and separate colour-matched catalogue swatches. The prompt asks the model to reconstruct fitted fabric, fine yarn scale, panel direction, seams, contact shadows and the selected material's light response. Shader output is never an input to the image edit, and generated upholstery is not tinted or textured again. Protected room pixels are restored from the original photograph. The comparison slider compares the original with the completed edit.

On Windows, run `npm run configure:ai`, open the printed local URL and save the key in its password field. The helper uses a short-lived loopback listener and an unguessable session token. Windows DPAPI encrypts the credential for the current account in the ignored `.data/studio-ai-provider.json` file. It cannot be moved to another account or deployed as a shared credential. Saving a connection makes no image request. The helper closes shortly after saving; Refresh AI connection in Studio discovers it without restarting the site.

For a server deployment, supply `OPENAI_API_KEY` through the host's environment or secret manager. `OPENAI_IMAGE_MODEL` defaults to `gpt-image-2.5-sunburst`; an override must support the same edit schema and custom image dimensions. Provider keys stay server-side. A connected status means a credential is present; model access, billing and actual image quality require a successful live request. The browser owner key isolates results but is not a customer login or billing account. Apply the intended customer authentication, quotas and provider-project spend limits before offering paid generations publicly.

Each explicit generation sends the photograph, mask and fabric reference to `https://api.openai.com/v1/images/edits` and uses the API project's billing. There are no automatic provider retries. A request reference makes a repeated submission return the existing job instead of charging for a second edit. Cancellation stops local work and aborts the provider connection; it cannot guarantee that already-started provider work is unbilled. Results are private to the requesting browser and retained in server memory for up to 15 minutes, with bounded concurrency and a bounded image cache. They are never stored in the recipe database. The instant preview, selection and depth processing stay on-device.

Native generation targets the largest supported matching aspect ratio: at most a 3840-pixel edge and 8,294,400 pixels, divisible by 16. At 4:3 this is approximately 3.3K × 2.5K. Larger native sizes are experimental at the provider. The 4K/8K download choices resize this master and preserve the retained original room; they do not create native 8K fibre detail. Native master dimensions are shown beside the result. See [OpenAI's image generation guide](https://developers.openai.com/api/docs/guides/image-generation) and [image edit reference](https://developers.openai.com/api/reference/resources/images/methods/edit).

Generation endpoints validate the files, matching mask dimensions, selected coverage and catalogue material. Jobs expose preparation, generation, finishing, completion and recoverable failure states. A four-minute deadline, explicit cancel action, stale-result guards and provider-error redaction protect the original photo and keep credentials out of customer messages. Refining the selection, changing fabric or replacing the photo invalidates the old result. A camera generation freezes its current native frame first; the ongoing camera preview uses local rendering.

Generative editing can alter fine seams or edges despite the prompt and mask. Compare the output with the original before using it as a design reference. A physical sample remains necessary for exact colour and reflectance.

## Rendering pipeline

Photos use local MediaPipe Magic Touch selection. Automatic selection scores several candidate points, merges agreeing object predictions, repairs fine mask gaps and conservatively removes thin lower supports. The local quantized Depth Anything V2 Small model and relighting pipeline support camera studies; AI photographs do not need that lighting analysis. Brush, eraser and selection undo/redo remain under Refine selection. The before/after comparison is the only range slider.

The depth model runs in a separate worker using Transformers.js and ONNX WASM. It does not upload the photograph. A second worker separates linear-light diffuse illumination, coherent contact creases and smoothed surface normals. Intermediate-scale cushion shading is retained instead of being erased by a broad blur. Source weave is attenuated independently of the new material's microstructure.

The WebGL 2 renderer uses bilinearly resampled 16-bit relative depth and bounded normals. Colour, normal and roughness maps share three texture projections and mipmapped sampling. Photographed illumination remains the primary light; the renderer adds restrained, occluded fabric highlights instead of a second strong key light. Velvet has quiet colour variation and fine relief, while bouclé retains stronger loops. Linear-light edge blending and reduced boundary highlights avoid pale seams. Leg protection requires an abrupt narrow support below the body; a gradually sloping upholstered base remains selected.

Preview, high-resolution export and compatibility rendering use the same diffuse/contact/geometry layers. Analysis coalesces updates in a worker, discards stale photo results and retains responsive painting. Exports wait for pending photo selection/depth/lighting. A camera export freezes the native frame and settles its lighting before rendering.

The 3D viewer builds ten distinct forms: tailored sofa, Chesterfield, corner sectional, loveseat, wingback, dining chair, round ottoman, bench, channel headboard and a cushion/bolster collection. It includes piping, padded surfaces, tuft details where applicable, a room environment for reflections, shadows, three lighting presets, orbit controls, reset and a turntable. These are generated form studies, not reconstructions of the uploaded object.

Live camera requests up to 3840 × 2160 at 30 fps. Actual capture resolution is displayed. The same renderer processes the video; AI selection refreshes approximately every 1.5 seconds, local point tracking bridges those updates, and depth refreshes when its worker is available. Freeze preserves the full camera frame for export. Streams stop on navigation, hiding the page, explicit stop and cancellation. Uncompleted permission requests time out; late grants are stopped.

## Output quality

All three modes offer 4K and 8K PNG output. 3D renders at 3840 × 2160 or 7680 × 4320, subject to graphics limits, pausing interactive rendering during capture. Photo/camera exports render in an OffscreenCanvas worker where available, preserve source proportions and use the retained original photo/full camera frame. The encoded PNG header is checked before reporting dimensions. A persistent link lets the customer save the last export without rerendering.

Devices with smaller graphics or memory limits receive a smaller output with the actual dimensions reported. The compatibility renderer keeps previews available without WebGL 2; its export is explicitly described as enlarged from the preview. More output pixels do not recover detail absent from the camera or photograph. Native matched 2K colour, normal and roughness maps are supplied for the core leather, velvet and linen sources; other directions use their existing maps.

Automatic masks and single-view depth are estimates. Small edge strips, deeply occluded surfaces and strong original patterns can require the supplied brush/eraser refinement. Material-family response is illustrative rather than a measured supplier BRDF; use physical samples to confirm colour, weave and finish.

## Backend and privacy

- `GET /api/studio/capabilities` describes local depth assets, forms, lighting, material presets, output qualities and optional provider connection status.
- `POST /api/studio/generations` starts an owner-private job with a UUID `Idempotency-Key`; `GET/DELETE /api/studio/generations/:id` retrieves or cancels it. Image bodies are limited to 24 MB; inputs are decoded with a 50-megapixel limit.
- `GET/POST /api/studio/designs` saves private material/form/lighting/mode/output recipes using the existing browser key and SQLite owner isolation. It validates IDs and enumerated settings, with idempotent creation and atomic writes.
- Saved setups contain no photos, masks or camera frames. Restoring a photo/camera setup restores its recipe; the customer supplies the image or starts the camera again.
- Worker timeouts, cancellation, missing textures, unsupported graphics, image limits, camera failures, disconnected APIs and PNG encoding failures have recovery messages. Optional HD maps fall back to existing local maps.
- The production server serves ONNX runtime modules with JavaScript MIME types. Vite excludes binary model/runtime files from filesystem watching to avoid Windows file-lock crashes during synchronization.

## Assets and reproducibility

```sh
npm ci
npm run prepare:studio
npm run test:studio
npm test
npm run check:assets
npm run build
```

`prepare:studio` downloads missing local model files, records their SHA-256 provenance, includes the Apache license, prepares three matched 2K CC0 map sets, verifies upstream checksums and registers minor channel-size differences to the colour map's non-square frame. Builds synchronize runtime binaries with the installed lockfile versions. Transformers.js is pinned to 4.3.1.

Primary implementation references:

- [Depth Anything V2 and its Small-model Apache license](https://github.com/DepthAnything/Depth-Anything-V2).
- [ONNX-compatible Depth Anything V2 Small](https://huggingface.co/onnx-community/depth-anything-v2-small).
- [Transformers.js](https://github.com/huggingface/transformers.js) and its [depth example](https://github.com/huggingface/transformers.js-examples/tree/main/depth-anything).
- [MediaPipe Interactive Segmenter](https://developers.google.com/edge/api/mediapipe/js/tasks-vision.interactivesegmenter).
- [Three.js physical materials](https://threejs.org/docs/pages/MeshPhysicalMaterial.html).
- [Filament's diffuse/specular energy conservation and cloth guidance](https://github.com/google/filament/blob/main/docs/Filament.md.html). The photo renderer is an approximation informed by these principles, not a measured reconstruction of scene lighting.
- Poly Haven CC0 sources: [brown leather](https://polyhaven.com/a/brown_leather), [velour velvet](https://polyhaven.com/a/velour_velvet), [rough linen](https://polyhaven.com/a/rough_linen).

## Practical realism limits

One uncalibrated image cannot establish exact dimensions, hidden geometry, fibre structure or measured reflectance. Relative depth, automatic scale and family response are estimates. Broad source prints can still influence inferred lighting, and difficult boundaries can need refinement. Fine grain is limited by the source texture. A screen preview remains a design study; confirm the actual specification and a physical sample before ordering.
