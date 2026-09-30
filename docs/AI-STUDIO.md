# AI Studio implementation and asset audit

## Delivered workflow

`/ai-studio.html` shares the complete material dataset with `/materials.html`.
Upload JPG/PNG/WebP locally, select an object with MediaPipe Magic Touch, refine the mask with Brush/Erase, select a texture, adjust scale/rotation/strength/softness, drag the keyboard-accessible comparison divider, and download a labelled PNG. Images and camera frames remain in the browser.

The photo compositor preserves original pixels outside the mask and preserves luminance variation inside it. It is a 2D surface preview, not a depth reconstruction or physically measured cloth simulation. Perspective, seams, occlusion and texture scale can require manual correction.

The optional 3D inspector uses a generic rounded sofa and Three.js MeshPhysicalMaterial. It uses matching OpenGL normal and roughness maps where the source provides them. Colour maps are sRGB; data maps remain linear. Fabric metalness is zero. The viewer loads only the current material and releases superseded textures, geometries and the renderer. Pixel ratio is capped at 1.5, anisotropy at 4, and source maps at 1024 pixels on their longest side. Uniform roughness is used and disclosed when a study has no measured maps.

The standard camera and self-hosted 8th Wall engine feed the same mask/compositor. Live masks refresh periodically around a selected point. This is experimental, may drift, and is not world-anchored SLAM or a production garment/furniture tracker. Freeze frame enables precise brush correction. HTTPS (or localhost), camera permission, WebGL and a compatible device are required. Camera streams stop on visibility change or leaving the studio.

## Asset audit

- 35 furniture listings have unique reference-guided AI reconstructions in `public/assets/products`. Original generated PNGs and optimized WebP derivatives are retained. They are labelled reconstructions and are not claimed to be exact supplier photographs. Supplier reference images remain outside the public directory under `tmp/product-references`.
- Removed category-image overrides that assigned unrelated chairs/tables to multiple products. Corrected four broken product handles and the Noah outdoor category.
- All 60 legacy material directions have explicit assignments in `src/data/material-audit.js`; no room photographs or category fallback images remain in the material cards.
- Added 39 CC0 source texture studies: 25 Poly Haven and 14 ambientCG. The 25 Poly Haven sets include matching albedo, normal and roughness maps. Per-asset URLs, original downloads and credits are in `src/data/studio-textures.json`.
- Generated 11 missing illustrative surfaces: bouclé, chenille, cork, moiré, kilim, tapestry, printed linen, rattan-look, tweed, basketweave and matelassé. No generated surface is advertised as having measured normal/roughness maps.
- Corrected checked wool bouclé naming; the plain bouclé cards now use a plain loop texture. Corrected the earlier plaid/herringbone, leather/cork, flat weave/fleece and plastic/automotive-cloth substitutions.
- Exact Hertex colourways were not verified from licensed close-ups. Those 15 cards now use descriptive study names instead of presenting a substitute image as a specific supplier SKU. Collection references remain for discovery. Fibre content, recycled content and outdoor performance are physical specifications, not properties established by a digital illustration.

## Research decisions

- [ARFurniture](https://github.com/chayanforyou/ARFurniture): separate catalogue choice from model rendering.
- [Interior-Design-AR](https://github.com/abinovarghese/Interior-Design-AR): observed material tint controls in `MainActivity.java`. Its two material-property controls both write `metallic` in that file, so it was not copied as a roughness implementation.
- [FurnitureTryOut](https://github.com/KartikBhargava/FurnitureTryOut): observed model selection, transform nodes and asynchronous loading. It does not solve segmentation of uploaded furniture.
- [TensorFlow arbitrary style transfer](https://www.tensorflow.org/lite/examples/style_transfer/overview): image stylization is not a source of accurate normal maps, UVs or furniture segmentation. It was not introduced as a false replacement for the actual swatch texture.
- [texturize](https://github.com/texturedesign/texturize) is a Python texture synthesis tool, not a browser PBR runtime. Its code is AGPL-3.0 and its example assets are BY-NC-SA, so those examples were not bundled in this commercial-site library.
- [Material Maker](https://www.materialmaker.org/) is an authoring tool; runtime graph compilation is not integrated. Matched ready-made maps keep the browser implementation predictable.
- [8th Wall open source transition](https://8thwall.org/blog/8th-wall-open-source): the implementation uses the self-hosted engine package, not the retired hosted platform. It does not include the separately licensed SLAM distribution.

## Generation mode and prompts

Built-in image generation was used (no API key). Each furniture image used its own inspected supplier reference with this prompt structure:

> Create a new photorealistic catalogue rendering of the exact furniture design in the reference. Preserve silhouette, proportions, component count, colors, fabric, openings, legs and joinery. Warm pale-grey seamless studio, subtle floor shadow, front three-quarter view, entire product filling 80% of landscape 4:3 image. No accessories, writing, branding or watermark. Preserve product geometry; do not redesign.

For the Dublin table, the prompt specified only the taller individual table, since the reference showed two sizes sold separately. Nesting sets retain both tables.

Material prompt structure:

> Seamless tileable photorealistic material texture scan of [specific weave, colour and structure]. Orthographic directly overhead macro; one flat surface fills the image. Even diffuse light, sharp fibre details, no folds, shadows, edges, objects, labels or text. Square image for an upholstery swatch and texture mapping.

## Validation

Run `npm run test:studio` and `npm run build`. Prebuild bundles the pinned MediaPipe SDK into a classic worker-compatible script and syncs the worker source. A classic worker is required because the WASM loader uses `importScripts`.

Automated tests verify comparison endpoints, protected pixels, brush/erase boundaries, padded 8th Wall RGBA frames, unique furniture images, complete local material assets, map size limits and matched PBR paths.

Browser verification was blocked because permission to access the localhost preview was declined. Actual segmentation quality, WebGL appearance, camera permissions and mobile behaviour still require browser/device acceptance testing. No production-readiness or camera-frame-rate claim is made.

Acceptance flow: upload a photo → tap upholstery → erase legs/background → select striped material → rotate and scale → drag comparison → export → inspect same swatch in 3D → start camera on a supported device → freeze → stop → confirm camera indicator turns off. Test denied permission, failed model loading and keyboard comparison controls as well.
