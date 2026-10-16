// Shared by the photo renderer, 3D renderer and API. These are visual-family
// presets, not laboratory measurements or claims about a supplier's exact SKU.
const families = {
  woven: { label:'Woven cloth', roughness:.87, sheen:.16, sheenRoughness:.78, clearcoat:0, anisotropy:.08, relief:.24, tileMetres:.32, description:'Dry, diffuse light with a quiet woven relief.' },
  velvet: { label:'Directional pile', roughness:.76, sheen:.88, sheenRoughness:.48, clearcoat:0, anisotropy:.38, relief:.15, tileMetres:.28, description:'A soft grazing sheen that changes with the direction of the pile.' },
  boucle: { label:'Looped & textured', roughness:.96, sheen:.32, sheenRoughness:.84, clearcoat:0, anisotropy:.02, relief:.72, tileMetres:.25, description:'Deep, matte loops with soft self-shadowing and scattered highlights.' },
  leather: { label:'Leather grain', roughness:.43, sheen:.05, sheenRoughness:.6, clearcoat:.16, anisotropy:.02, relief:.35, tileMetres:.4, description:'Broad reflected highlights over a fine, softly irregular grain.' },
  suede: { label:'Suede & microfibre', roughness:.94, sheen:.42, sheenRoughness:.85, clearcoat:0, anisotropy:.2, relief:.12, tileMetres:.3, description:'A muted, brushed surface with a restrained directional bloom.' },
  satin: { label:'Silk & satin', roughness:.3, sheen:.65, sheenRoughness:.26, clearcoat:0, anisotropy:.8, relief:.08, tileMetres:.3, description:'Long, directional highlights and a smooth, light-responsive face.' },
  coated: { label:'Coated surface', roughness:.35, sheen:.02, sheenRoughness:.5, clearcoat:.3, anisotropy:.02, relief:.2, tileMetres:.4, description:'A clean, broader specular response over a coated grain.' },
}

export function materialResponse(material = {}) {
  const name = `${material.name || ''} ${material.type || ''}`.toLowerCase()
  const texture = `${name} ${material.texture || ''}`
  // Names take priority: archive entries can carry a generic "woven" tag.
  const family = /suede/.test(name) ? 'suede' : /satin|silk|moire|moiré/.test(name) ? 'satin' : /velvet|velour|mohair|chenille|corduroy/.test(name) ? 'velvet' : /boucl|fleece|shearling|teddy/.test(name) ? 'boucle' : /vinyl|faux leather|leather-look|coated/.test(name) ? 'coated' : /leather/.test(name) ? 'leather' : /velvet/.test(texture) ? 'velvet' : /boucle/.test(texture) ? 'boucle' : 'woven'
  return Object.freeze({ family, ...families[family], metalness:0, ior:1.46 })
}

// Photo relief is deliberately smaller than mesh relief: the source lighting
// already describes the upholstery shape. These are microstructure corrections.
export function photoMaterialResponse(material={}) {
  const profile=materialResponse(material)
  const detail={woven:[.22,.055],velvet:[.10,.025],boucle:[.55,.13],leather:[.23,.075],suede:[.10,.025],satin:[.12,.02],coated:[.18,.045]}[profile.family]
  return {...profile,albedoContrast:detail[0],photoRelief:detail[1],specularStrength:profile.family==='velvet'?.16:profile.family==='suede'?.08:profile.family==='boucle'?.07:profile.family==='woven'?.14:.75}
}

export const studioForms = Object.freeze([
  { id:'tailored-sofa', name:'Tailored sofa', category:'Sofas', note:'Three seats · piped cushions', width:2.55 },
  { id:'chesterfield', name:'Chesterfield', category:'Sofas', note:'Rolled arms · deep buttoning', width:2.55 },
  { id:'corner-sofa', name:'Corner sectional', category:'Sofas', note:'Modular seating · chaise return', width:3.05 },
  { id:'loveseat', name:'Curved loveseat', category:'Sofas', note:'Two seats · sculpted arms', width:1.65 },
  { id:'wingback', name:'Wingback chair', category:'Chairs', note:'High back · sheltering wings', width:.9 },
  { id:'dining-chair', name:'Dining chair', category:'Chairs', note:'Upholstered seat & back', width:.55 },
  { id:'ottoman', name:'Round ottoman', category:'Occasional', note:'Drum form · piped top', width:.9 },
  { id:'bench', name:'End-of-bed bench', category:'Occasional', note:'Tailored cushion · timber frame', width:1.5 },
  { id:'headboard', name:'Channel headboard', category:'Bedroom', note:'Vertical channels · padded frame', width:1.8 },
  { id:'cushions', name:'Cushion collection', category:'Soft furnishings', note:'Square · lumbar · bolster', width:1.5 },
])

export const studioLights = Object.freeze([
  { id:'daylight', name:'Daylight', note:'Soft window light', color:0xfff8ef, intensity:2.8, position:[-3,4,3], environment:.65 },
  { id:'gallery', name:'Gallery', note:'Crisp, neutral light', color:0xffffff, intensity:3.4, position:[3,4,2], environment:.8 },
  { id:'evening', name:'Evening', note:'Warm, low light', color:0xffd6a0, intensity:2.5, position:[-3,2,1], environment:.35 },
])

export function exportSize(width, height, quality = '4k', maxDimension = 8192) {
  if (!(width > 0 && height > 0)) throw new Error('Load an image before exporting.')
  const requested = quality === '8k' ? 7680 : 3840
  const edge = Math.min(requested, maxDimension)
  const scale = edge / Math.max(width, height)
  const result = { width:Math.max(1,Math.round(width*scale)), height:Math.max(1,Math.round(height*scale)), requested, limited:edge < requested, sourceWidth:width, sourceHeight:height }
  if (result.width*result.height > 48_000_000) return exportSize(width,height,quality,Math.min(maxDimension,6144))
  return result
}

export async function encodedPngSize(blob) {
  const bytes=new DataView(await blob.slice(0,24).arrayBuffer())
  if(bytes.byteLength<24||bytes.getUint32(0)!==0x89504e47||bytes.getUint32(12)!==0x49484452)throw new Error('The preview image could not be encoded. Try 4K and download again.')
  const width=bytes.getUint32(16),height=bytes.getUint32(20)
  if(!width||!height)throw new Error('The exported image has no pixels. Try 4K and download again.')
  return {width,height}
}
