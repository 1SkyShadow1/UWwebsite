import { mkdir, writeFile } from 'node:fs/promises'
import { shopProducts } from '../src/data/shop-products.js'
await mkdir('tmp/product-references', { recursive: true })
const records = []
for (const p of shopProducts) {
  try {
    const response = await fetch(`${p.sourceUrl}.js`)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const data = await response.json()
    const url = `https:${data.images[0]}`.replace('https:https:', 'https:')
    const image = await fetch(url)
    if (!image.ok) throw new Error('Reference unavailable')
    const file = `tmp/product-references/${p.id}.jpg`
    await writeFile(file, Buffer.from(await image.arrayBuffer()))
    records.push({ id:p.id, name:p.name, sourceUrl:p.sourceUrl, reference:file, description:data.description.replace(/<[^>]*>/g, ' ').replace(/\s+/g,' ').trim(), imageUrl:url })
    console.log(p.id)
  } catch (error) { console.log(`${p.id}: ${error.message}`) }
}
await writeFile('tmp/product-references/manifest.json', JSON.stringify(records, null, 2))
