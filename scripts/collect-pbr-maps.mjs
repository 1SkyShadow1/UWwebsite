import fs from 'node:fs/promises'
const records=JSON.parse(await fs.readFile('src/data/studio-textures.json','utf8'))
for(const item of records.filter(m=>m.sourceLabel==='Poly Haven')){
 const id=item.id.slice(4),j=await(await fetch(`https://api.polyhaven.com/files/${id}`)).json()
 const pbr={albedo:item.image,resolution:1024,metalness:0}
 for(const [key,apiKey] of [['normal','nor_gl'],['roughness','Rough']]){
  const file=j[apiKey]?.['1k']?.jpg
  if(!file)continue
  const response=await fetch(file.url);if(!response.ok)throw Error(`${id} ${key}`)
  const path=`/assets/textures/${id}-${key}.jpg`
  await fs.writeFile(`public${path}`,Buffer.from(await response.arrayBuffer()));pbr[key]=path
 }
 item.pbr=pbr;console.log(id,Object.keys(pbr).join(','))
}
await fs.writeFile('src/data/studio-textures.json',JSON.stringify(records,null,2))
