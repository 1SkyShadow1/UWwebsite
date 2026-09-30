# 8th Wall camera material preview

The current AI Studio includes a browser camera preview, a Three.js PBR sofa renderer, and a local fallback when 8th Wall is not configured. The 8th Wall adapter is loaded only on the AI Studio route and activates once the approved engine runtime is available.

The supplied `8thwall-main` source confirms the open-source `@8thwall/engine@0.1.0` runtime and its required SLAM integration boundary. `visualiser.html` now loads the MIT-licensed open-source engine and explicitly maps its `slam` preload to the distributed engine binary's `xr-slam.js` chunk for world tracking. The open-source engine alone supports image targets, face effects, and sky effects; world tracking requires the separately licensed distributed chunk.

## 1. Create the 8th Wall project

1. Sign in to the 8th Wall Console and create a WebAR project.
2. Choose an image-target or world-tracking starter, depending on the experience:
   - **Image target** for a known product card, showroom marker, or supplied furniture photo.
   - **World tracking** for placing a virtual sofa/chair on a detected floor.
3. Add the project domain and local development domain to the allowed origins.
4. Keep any project credentials in server environment variables such as `EIGHTH_WALL_APP_KEY`; never hard-code them in the browser or commit them.

## 2. Prepare realistic material assets

1. Capture the chosen furniture from several angles with diffuse lighting.
2. For each fabric or leather, prepare tileable **base colour**, **normal**, **roughness**, and (for velvet/bouclé) **height/fuzz** textures.
3. Keep textures physically calibrated: use measured colour samples and a known reference scale.
4. Build a GLB furniture model with separate material slots for frame, piping, cushions, and upholstery.
5. Validate the model in a desktop WebGL viewer before loading it into 8th Wall.

## 3. Add the 8th Wall runtime

1. Set `VITE_EIGHTH_WALL_SCRIPT_URL` to a self-hosted open-source `xr.js` build when needed. The frontend loads it only on the AI Studio route.
2. Set `VITE_EIGHTH_WALL_SLAM_URL` to a permitted self-hosted `xr-slam.js` URL if the default CDN URL is not appropriate.
3. Initialise `XR8.XrController` and the chosen camera pipeline.
4. Use `XR8.GlTextureRenderer` for the camera background and Three.js/R3F for the tracked furniture layer.
5. Add a tap-to-place reticle, scale/rotate gestures, and a reset button.
6. Keep a non-AR fallback: the current 2D camera preview and material tint must remain available when WebGL, camera permission, or tracking fails.

## 4. Make the material change realtime

1. Map each library material to a texture bundle and physically based parameters.
2. On swatch selection, update the upholstery material's `map`, `normalMap`, `roughnessMap`, `color`, and `roughness`.
3. Preserve the camera video and furniture geometry; only replace the upholstery material slot.
4. Use a segmentation/masking pass for a user photograph. For production, run segmentation server-side or with a privacy-approved on-device model, then return a mask to the Three.js compositor.
5. For a true “try it on” render, send the photo, material id, and mask metadata to `/api/visualiser/preview`; stream the generated image result back to the UI.

## 5. Test on real devices

1. Serve over HTTPS; mobile camera APIs do not work reliably on plain HTTP.
2. Test iOS Safari and Android Chrome with low light, reflective leather, patterned fabrics, and partial occlusion.
3. Measure camera permission denial, tracking loss, orientation changes, memory use, and battery drain.
4. Always show a clear fallback message and let the visitor continue with a normal upload preview.

## Current implementation boundary

- `src/ar-material-preview.js` owns the Three.js scene, PBR surface updates, resize handling, pointer rotation, and optional `window.XR8` runtime loader.
- When the engine is available, `startEightWallSession()` registers the engine's WebGL texture and world-tracking pipeline modules and starts XR8 on its dedicated camera canvas.
- `src/main.js` mounts the renderer on the AI Studio route and updates it when a material swatch changes.
- `GET /api/config/ar` reports whether the server has an 8th Wall app key without exposing that key to the browser.
- `.env.example` documents the required environment variables. No runtime URL or commercial key is committed.

## Production boundary

8th Wall supplies tracking and camera/AR capabilities; it does not replace the image-generation or segmentation service. Keep provider keys and AI calls behind the backend, rate-limit uploads, strip EXIF metadata, validate MIME/type/size, and store only explicit user-approved projects.

## Recommended Three.js + AI architecture

Use **Three.js as the active renderer** for the current product. It is already mounted in `src/ar-material-preview.js`, shares the material data model with the 3D Material Lab, and can update `MeshStandardMaterial`/`MeshPhysicalMaterial` maps in realtime. Do not render the same furniture scene with Three.js and Babylon.js simultaneously; two WebGL renderers would duplicate GPU work and make camera compositing, hit testing, memory, and lifecycle behavior harder to control.

Babylon.js is a valid alternative renderer if the project later needs its material editor, node-based shaders, glTF tooling, or WebXR abstractions. If that comparison is needed, create a separate adapter with the same interface (`loadFurniture`, `setMaterial`, `resize`, `dispose`) and select one renderer at build time or per device—not both in one canvas.

8th Wall does **not** provide an AI image-generation or upholstery-segmentation model. Its role is camera access, image targets, face/sky effects, and (when the separately licensed SLAM chunk is present) world tracking. The AI Studio should use this pipeline:

1. 8th Wall/Camera API tracks the room or target and supplies the camera background.
2. Three.js renders a calibrated GLB furniture asset with separate upholstery material slots and PBR maps.
3. A vision service segments the uploaded furniture photo or live frame and returns a mask.
4. The server applies a material transfer/concept render using the selected material metadata and mask, then streams the result back.
5. The browser keeps the Three.js/2D preview as an immediate fallback while the AI result is processing.

For segmentation, use **MediaPipe Tasks Vision** or **ONNX Runtime Web** for privacy-friendly on-device experiments, and a server worker using **SAM 2**, a managed vision API, or a hosted image-editing model for higher quality. For generation/editing, keep the provider behind `/api/visualiser/preview`; suitable providers can include OpenAI image editing, Replicate, or another approved image model. The browser should send only the image, material id, mask metadata, and consent—not provider keys.

The current implementation already has the correct boundary: the Three.js PBR preview is immediate, `/api/visualiser/preview` accepts validated job metadata and returns an explicit preview id/status, `/api/visualiser/preview/:id` exposes polling state, and the 8th Wall loader is optional. With no `AI_IMAGE_PROVIDER`, jobs intentionally return `awaiting-provider` rather than fabricating an AI result. The next production step is connecting a vetted provider worker with multipart upload validation, segmentation, streamed results, rate limiting, EXIF stripping, and explicit retention controls.

## Current prototype mode

The AI Studio currently prioritises a local photo workflow. Visitors can upload an image, switch between upholstery colours, choose Natural, Velvet sheen, Woven grain, or Leather pull-up treatments, tune surface intensity, and download a locally rendered concept. These controls use browser image processing and do not call an AI provider or upload the photo. The camera/8th Wall path remains available as an optional experiment, but realtime AI generation is intentionally deferred until the product becomes an application.

## Future R2 storage boundary

Cloudflare R2 is suitable for the later application phase as private object storage for original uploads, masks, and generated previews. It is not an AI model. The backend exposes `GET /api/config/storage` as a capability/status check, but does not accept uploads until fresh credentials are configured server-side. Keep the endpoint, bucket name, access key, and secret key out of `VITE_*` variables and source control. Use a least-privilege bucket-scoped credential, short-lived signed URLs, MIME/size validation, EXIF stripping, retention limits, and explicit deletion. Any credentials pasted into chat or committed to a repository must be revoked and replaced before enabling this boundary.
