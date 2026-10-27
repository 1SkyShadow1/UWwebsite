# Real showroom photography

All six photographs supplied in the `Done` folder were inspected individually before placement. The existing colour tokens, header, logo and theme controls are retained. Photograph colours are preserved without tinting or blend filters.

| Original file | Subject | Placement and purpose |
| --- | --- | --- |
| `555255774_1793000159880457.jpg` | Interior, sample books and illuminated logo | Prominent Home story, Materials hero and Services invitation; connects digital material discovery to the physical showroom. |
| `586750410_1792998696758734.jpg` | Corner sign and sunset | Home collage inset and Contact introduction; a distinctive brand and arrival cue. |
| `698878542_1792998489265728.jpg` | Garden and boundary-wall sign | Home contact sheet and full gallery; provides street context. |
| `106183034_1792999059532742.jpg` | Daylight entrance | Contact arrival switch and Home contact sheet; helps visitors recognise the entrance. |
| `1030998835_1792999048580396.jpg` | Warmly lit gate and entrance | Alternate Contact arrival view and gallery; keeps the warmer scene available in full. |
| `467752420_1792999218611606.jpg` | Front-gate banner | Services and Home contact sheet; reinforces the real business behind the services. |

## Interaction and accessibility

- The Home photo story appears directly after the hero discovery paths. Its `#our-showroom` link and the Contact `#visit-showroom` link account for JavaScript rendering and the fixed header.
- The native modal gallery offers all six full photographs, zoom/fit, thumbnails, previous/next, touch swipes, Left/Right and Home/End keys, Escape, explicit Tab focus cycling and focus restoration. Selecting a photograph resets zoom and centres its thumbnail.
- Full-image links remain normal links for modified clicks and browsers without native modal support. Decode failures leave a readable status. Closing or re-rendering cancels stale image updates and releases scroll locking.
- Arrival views change only on request. The displayed image and gallery link update together after successful decoding; a failed alternate view leaves the current image available.
- Slow hover zooms, the tilted inset, existing scroll reveals and arrival transitions honour reduced-motion preferences. There are no autoplay carousels or new third-party requests.

## Asset preparation

Run `node scripts/prepare-showroom-photos.mjs <original-folder>` to rebuild the assets and generated manifest. Original files are read only.

Each photo has 240 px, 480 px, 960 px and at most 1600 px WebP variants, without enlarging originals. The 24 files total approximately 3.48 MB; `srcset` and `sizes` let each placement request an appropriate variant, and below-fold photos are lazy loaded. Original dimensions reserve layout space. EXIF/XMP metadata is not copied. The generated manifest records dimensions, byte lengths and SHA-256 digests.

## Verification

- `node --test tests/showroom-photos.test.mjs`: asset integrity, actual dimensions, aspect ratios, no enlargement, absent private metadata and combined file-size budget.
- `npm run check:assets`: 260 referenced assets, zero missing.
- `npm run build`: production build succeeds; existing Three.js chunk-size advisory remains.
- Browser checks at 390 px and 1440 px CSS widths: Home, Materials, Services and Contact layouts, both themes, all six gallery images, zoom reset, keyboard navigation and closing, arrival switching, active-photo links and no horizontal page overflow. Phone layouts request smaller WebP variants.

These additions require no database migration, API credentials or paid AI calls.
