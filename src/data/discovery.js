import { materials } from './materials.js'
import { shopProducts } from './shop-products.js'

export const normaliseSearch = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
export const formatMoney = value => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(value)
export const productUrl = id => `/catalogue.html?product=${encodeURIComponent(id)}`

export const roomEdits = [
  { name: 'The living room', category: 'Sofas', note: 'Room to settle in.', productId: 'alessio-three' },
  { name: 'Your favourite corner', category: 'Armchairs', note: 'A seat with character.', productId: 'diane-swivel' },
  { name: 'Around the table', category: 'Dining', note: 'Good company. Better gatherings.', productId: 'archer-dining' },
  { name: 'Life outdoors', category: 'Outdoor', note: 'A fresh perspective.', productId: 'casablanca-lounger' },
]

const destinations = [
  ['Project planner', 'Plan your upholstery and fabric allowance', '/estimator.html'],
  ['Material Studio', 'Try a surface on your furniture photo', '/ai-studio.html'],
  ['My showroom', 'Saved furniture, fabrics, briefs and enquiries', '/profile.html'],
  ['The workshop', 'Reupholstery, repairs and custom projects', '/services.html'],
  ['Workshop journal', 'Material notes and ideas worth keeping', '/journal.html'],
  ['Contact the workshop', 'Discuss a piece or a project', '/contact.html'],
]
const searchIndex = [
  ...shopProducts.map(item => ({ id: `product-${item.id}`, type: 'furniture', name: item.name, detail: `${item.category} · ${formatMoney(item.price)} reference`, image: item.image, href: productUrl(item.id), search: `${item.name} ${item.category} ${item.material} ${item.description}` })),
  ...materials.map(item => ({ id: `material-${item.id}`, type: 'materials', name: item.name, detail: `${item.group} · ${item.shade}`, image: item.image, color:item.color, preserveTextureColor:item.preserveTextureColor, href: `/materials.html?q=${encodeURIComponent(item.name)}`, search: `${item.name} ${item.group} ${item.shade} ${item.feel} ${item.type} ${item.tags.join(' ')}` })),
  ...destinations.map(([name, detail, href], index) => ({ id: `page-${index}`, type: 'tools', name, detail, href, search: `${name} ${detail}` })),
].map(item => ({ ...item, search: normaliseSearch(item.search), normalisedName: normaliseSearch(item.name) }))

export function searchShowroom(query, type = 'all', limit = 12) {
  const text = normaliseSearch(query)
  const terms = text.split(/\s+/).filter(Boolean)
  return searchIndex.filter(item => (type === 'all' || item.type === type) && terms.every(term => item.search.includes(term)))
    .map(item => ({ ...item, score: !text ? 0 : item.normalisedName === text ? 4 : item.normalisedName.startsWith(text) ? 3 : item.normalisedName.includes(text) ? 2 : 1 }))
    .sort((a, b) => b.score - a.score).slice(0, limit)
}

export function findMaterialDirections({ setting = 'all', family = 'all', tone = 'any' } = {}) {
  return materials.filter(item => {
    if (setting !== 'all' && !item.tags.includes(setting) || family !== 'all' && item.group !== family) return false
    const rgb = item.color.replace('#', '').match(/.{2}/g)?.map(value => parseInt(value, 16)) || [128, 128, 128]
    const lightness = (Math.max(...rgb) + Math.min(...rgb)) / 510
    const chroma = Math.max(...rgb) - Math.min(...rgb)
    return tone === 'any' || tone === 'light' && lightness >= .65 || tone === 'deep' && lightness <= .35 || tone === 'earthy' && rgb[0] > rgb[2] + 15 || tone === 'colour' && chroma > 45
  })
}

export function pairMaterials(product, limit = 3) {
  const setting = product.category === 'Outdoor' ? 'outdoor' : product.category === 'Bedroom' ? 'bedroom' : product.category === 'Dining' ? 'dining' : 'living'
  const choices = materials.filter(item => item.tags.includes(setting))
  const groups = new Set()
  return choices.filter(item => { if (groups.has(item.group)) return false; groups.add(item.group); return true }).slice(0, limit)
}
