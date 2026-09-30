import { mkdir, writeFile } from 'node:fs/promises'
await mkdir('public/assets/textures', { recursive:true })
const records=[]
const headers={'User-Agent':'UpholsteryWarehouseStudio/1.0'}
const poly=['brown_leather','denim_fabric','denim_fabric_03','denim_fabric_04','denim_fabric_05','denim_fabric_06','fabric_leather_01','fabric_leather_02','fabric_pattern_05','fabric_pattern_07','leather_red_02','leather_red_03','leather_white','quatrefoil_jacquard_fabric','ribbed_corduroy','velour_velvet','wool_boucle']
for(const id of poly){
 try{
  const j=await(await fetch(`https://api.polyhaven.com/files/${id}`,{headers})).json()
  const included=j.blend?.['1k']?.blend?.include || {}
  const file=j.Diffuse?.['1k']?.jpg || j.diff?.['1k']?.jpg || Object.entries(included).find(([key])=>/_(diff|col)_1k\.jpg$/.test(key))?.[1]
  if(!file)throw new Error('No diffuse map')
  const image=`/assets/textures/${id}.jpg`
  const r=await fetch(file.url);if(!r.ok)throw new Error(r.status)
  await writeFile(`public${image}`,Buffer.from(await r.arrayBuffer()))
  records.push({id:`cc0-${id}`,name:id.replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase()),image,sourceUrl:`https://polyhaven.com/a/${id}`,textureCredit:'Poly Haven · CC0',tags:['accent','living','cc0'],type:'CC0 surface study',group:'CC0 texture archive',texture:'woven',shade:'Original source colour',color:'#a69682',preserveTextureColor:true,imageMode:'photo',imageAlt:`${id.replaceAll('_',' ')} diffuse texture`,feel:'Explore the original texture map, retaining its visible surface structure.',use:'Digital material exploration; choose an upholstery-rated physical fabric separately.',care:'Confirm the care instructions of your chosen physical fabric.',caution:'This is a digital texture asset, not a purchasable fabric SKU or a performance specification.',style:'An authentic source texture.',sourceLabel:'Poly Haven',downloadUrl:file.url})
  console.log(id)
 }catch(e){console.log(id,e.message)}
}
const ids=['Fabric005','Fabric006','Fabric019','Fabric034','Fabric036','Fabric041','Fabric051','Fabric052','Fabric054','Fabric068','Fabric071','Fabric078','Fabric080','Fabric083']
const assets=await(await fetch('https://ambientcg.com/api/v2/full_json?type=Material&category=Fabric&limit=100')).json()
for(const id of ids){
 const a=assets.foundAssets.find(a=>a.assetId===id)
 const url=new URL(a.previewLinks[0].url.replace('#','?')).searchParams.get('color_url')
 const r=await fetch(url);if(!r.ok)throw new Error(`${id} HTTP ${r.status}`)
 const image=`/assets/textures/${id}.jpg`;await writeFile(`public${image}`,Buffer.from(await r.arrayBuffer()))
 const label=a.tags.filter(t=>!/^\d+$/.test(t)&&!['fabric','cloth','clean','smooth','textile','indoor','modern','table','clothing'].includes(t)).slice(0,3).join(' ')
 records.push({...records[0],id:`cc0-${id}`,name:`${label.charAt(0).toUpperCase()+label.slice(1)} · ${id.slice(6)}`,image,sourceUrl:a.shortLink,textureCredit:'ambientCG · CC0',sourceLabel:'ambientCG',downloadUrl:url,imageAlt:`${a.displayName} source surface texture`,tags:['accent','cc0',...a.tags.filter(t=>!/^\d+$/.test(t))]})
 console.log(id)
}
await writeFile('src/data/studio-textures.json',JSON.stringify(records,null,2))
