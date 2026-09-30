import fs from 'node:fs/promises'
const records=JSON.parse(await fs.readFile('src/data/studio-textures.json','utf8'))
const ids=['crepe_satin','curly_teddy_natural','polar_fleece','floral_jacquard','poly_wool_herringbone','rough_linen','scuba_suede','stretch_poplin','terlenka','waffle_pique_cotton','hessian_230','knitted_fleece']
for(const id of ids){
 const j=await(await fetch(`https://api.polyhaven.com/files/${id}`)).json()
 const file=j.Diffuse?.['1k']?.jpg || Object.entries(j.blend?.['1k']?.blend?.include||{}).find(([key])=>/_(diff|col|color|albedo)_1k\.jpg$/.test(key))?.[1]
 if(!file){console.log(id,'missing',Object.keys(j));continue}
 const image=`/assets/textures/${id}.jpg`,r=await fetch(file.url)
 if(!r.ok)throw Error(id)
 await fs.writeFile(`public${image}`,Buffer.from(await r.arrayBuffer()))
 records.push({...records[0],id:`cc0-${id}`,name:id.replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase()),image,sourceUrl:`https://polyhaven.com/a/${id}`,downloadUrl:file.url,imageAlt:`${id.replaceAll('_',' ')} source texture`})
 console.log(id)
}
await fs.writeFile('src/data/studio-textures.json',JSON.stringify(records,null,2))
