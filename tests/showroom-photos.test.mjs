import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { showroomPhotos } from '../src/data/showroom-photos.js'

test('all six reviewed photos ship as intact, responsive WebP assets without private metadata', async () => {
  assert.equal(showroomPhotos.length, 6)
  assert.equal(new Set(showroomPhotos.map(photo => photo.file)).size, 6)
  let totalBytes = 0
  for (const photo of showroomPhotos) {
    assert.ok(photo.alt && photo.caption)
    assert.equal(photo.variants[0].width, 240)
    for (const [index, variant] of photo.variants.entries()) {
      assert.match(variant.src, /^\/assets\/showroom\/[a-z-]+-\d+\.webp$/)
      const bytes = await readFile(new URL(`../public${variant.src}`, import.meta.url))
      const metadata = await sharp(bytes).metadata()
      assert.equal(metadata.format, 'webp')
      assert.equal(metadata.width, variant.width)
      assert.equal(metadata.height, variant.height)
      assert.ok(variant.width <= photo.width && variant.height <= photo.height, 'do not upscale originals')
      assert.ok(Math.abs(variant.height - variant.width * photo.height / photo.width) <= 1, 'retain aspect ratio')
      if (index) assert.ok(variant.width > photo.variants[index - 1].width)
      assert.equal(bytes.length, variant.bytes)
      assert.equal(createHash('sha256').update(bytes).digest('hex'), variant.sha256)
      assert.equal(metadata.exif, undefined)
      assert.equal(metadata.xmp, undefined)
      totalBytes += bytes.length
    }
  }
  assert.ok(totalBytes < 4 * 1024 * 1024, 'all 24 responsive variants must stay below 4 MB combined')
})
