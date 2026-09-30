import './styles.css'
import { renderHome } from './pages/home.js'
import { renderLanding } from './pages/landing.js'
import { renderMaterials } from './pages/materials.js'
import { renderLab } from './pages/lab.js'
import { renderStudio } from './pages/studio.js'
import { mountStudio } from './studio/controller.js'
import './studio/studio.css'
import { renderVisualiser } from './pages/visualiser.js'
import { renderCatalogue } from './pages/catalogue.js'
import { renderServices } from './pages/services.js'
import { renderJournal } from './pages/journal.js'
import { renderEstimator } from './pages/estimator.js'
import { renderContact } from './pages/contact.js'
import { renderProfile } from './pages/profile.js'
import { materialGroups, materialUses, materials } from './data/materials.js'
import { furnitureCategories, furnitureForms } from './data/furniture.js'
import { furnitureCatalogueUrl, shopCategories, shopProducts } from './data/shop-products.js'

const models = {
  chesterfield: ['Kensington Chesterfield', '17.3', 'Deep button', 'sofa'],
  wingback: ['Mayfair Wingback', '5.2', 'Fluted back', 'wingback'],
  sectional: ['Modern Cloud Sectional', '18.6', 'Double welt', 'sectional'],
  ottoman: ['Atelier Ottoman', '3.1', 'Tufted grid', 'ottoman'],
  'apartment-sofa': ['Apartment sofa', '12.0', 'Compact silhouette', 'sofa'],
  loveseat: ['Two-seat loveseat', '13.0', 'Two-seat form', 'sofa'],
  chaise: ['Chaise lounge', '11.0', 'Extended seat', 'chaise'],
  'club-chair': ['Club chair', '6.0', 'Rounded arms', 'chair'],
  'tub-chair': ['Tub chair', '5.0', 'Curved back', 'tub'],
  'slipper-chair': ['Slipper chair', '4.5', 'Armless profile', 'slipper'],
  'accent-chair': ['Accent chair', '6.0', 'Statement form', 'chair'],
  'dining-chair': ['Dining chair', '1.5', 'Compact seat', 'dining'],
  'dining-bench': ['Dining bench', '5.0', 'Long seat', 'bench'],
  headboard: ['Upholstered headboard', '3.0', 'Panel form', 'headboard'],
  footstool: ['Tufted footstool', '2.5', 'Small accent', 'ottoman'],
}

const pageInfo = {
  home: { title: 'Upholstery Showroom', description: 'Thoughtful upholstery, material inspiration and a digital showroom for Upholstery Warehouse.' },
  landing: { title: 'All Things Upholstery', description: 'Discover upholstery, restoration, custom work and thoughtfully chosen materials.' },
  materials: { title: 'Material Library', description: `Browse ${materials.length} illustrative upholstery material directions with tactile swatch interactions and careful material-selection notes.` },
  catalogue: { title: 'Furniture Shop', description: `Shop ${shopProducts.length} curated furniture pieces across sofas, dining, bedroom, outdoor and occasional forms.` },
  lab: { title: '3D Material Lab', description: 'Explore upholstery materials and furniture forms in an interactive material study.' },
  studio: { title: 'AI Studio', description: 'Try fabrics on your furniture with on-device AI selection and live camera material previews.' },
  visualiser: { title: 'Photo Material Studio', description: 'Preview upholstery colour and surface treatments locally on your furniture photo.' },
  services: { title: 'Upholstery Services', description: 'Explore upholstery, restoration, custom furniture and project services.' },
  journal: { title: 'Workshop Journal', description: 'Upholstery material notes, care ideas and stories about furniture worth keeping.' },
  estimator: { title: 'Project Planner', description: 'Build an indicative upholstery project brief before a consultation.' },
  profile: { title: 'Your Swatch Book', description: 'Review your locally saved upholstery material shortlist.' },
  contact: { title: 'Visit & Contact', description: 'Contact Upholstery Warehouse in Johannesburg to discuss your furniture project.' },
}

const navItems = [
  ['home', '/index.html', 'Home'],
  ['materials', '/materials.html', 'Materials'],
  ['catalogue', '/catalogue.html', 'Furniture'],
  ['studio', '/ai-studio.html', 'AI Studio'],
  ['services', '/services.html', 'Services'],
  ['journal', '/journal.html', 'Journal'],
  ['contact', '/contact.html', 'Contact'],
]

const requestedFurnitureForm = new URLSearchParams(window.location.search).get('form')

const state = {
  route: 'home',
  material: materials[0],
  model: 'chesterfield',
  filter: 'all',
  useFilter: 'all',
  query: '',
  furnitureFilter: 'all',
  shopQuery: '',
  shopCategory: 'all',
  shopPrice: 'all',
  shopSort: 'featured',
  cart: loadLocalList('uw-furniture-cart'),
  wishlist: loadLocalList('uw-furniture-wishlist'),
  theme: 'dark',
  swatches: loadSwatches(),
  uploaded: '',
  previewFinish: 'natural',
  previewIntensity: 35,
  estimator: { furniture: requestedFurnitureForm in models ? requestedFurnitureForm : 'chesterfield', quantity: 1, tier: 'artisan' },
}

function loadLocalList(key) {
  try {
    const stored = JSON.parse(localStorage.getItem(key) || '[]')
    return Array.isArray(stored) ? stored : []
  } catch (error) {
    console.warn(`Could not read ${key}.`, error)
    return []
  }
}

function persistShopState() {
  try {
    localStorage.setItem('uw-furniture-cart', JSON.stringify(state.cart))
    localStorage.setItem('uw-furniture-wishlist', JSON.stringify(state.wishlist))
  } catch (error) {
    console.warn('Could not save the furniture bag.', error)
  }
}

let arPreview
let disposeStudio
let currentCameraStream

function loadSwatches() {
  try {
    const stored = JSON.parse(localStorage.getItem('uw-swatches') || '[]')
    return Array.isArray(stored) ? stored.filter(id => materials.some(material => material.id === id)).slice(0, 8) : ['leather', 'velvet', 'boucle']
  } catch (error) {
    console.warn('Could not read the local swatch book.', error)
    return ['leather', 'velvet', 'boucle']
  }
}

function persistSwatches() {
  try {
    localStorage.setItem('uw-swatches', JSON.stringify(state.swatches))
  } catch (error) {
    console.warn('Could not save the local swatch book.', error)
  }
}

function href(path) { return path }
function media(path, alt = '') { return `<img src="${path}" alt="${alt}" loading="lazy">` }
function linkButton(text, path, cls = '') { return `<a class="button ${cls}" href="${href(path)}">${text}<span>↗</span></a>` }

function materialCard(material) {
  const saved = state.swatches.includes(material.id)
  const number = String(materials.indexOf(material) + 1).padStart(2, '0')
  return `<article class="swatch-card" style="--card-accent:${material.color}">
    <div class="swatch-card-inner">
      <div class="swatch-face swatch-front" aria-hidden="false">
        <div class="swatch-art texture-${material.texture}" data-image-mode="${material.imageMode}" style="--swatch-color:${material.color};--swatch-image:url('${material.image}')">
          <img src="${material.image}" alt="${material.imageAlt}" loading="lazy" decoding="async"><span class="swatch-surface-name">${material.shade}</span><span class="swatch-index">${number}</span>${material.supplier ? `<span class="catalogue-source-badge">${material.supplier}</span>` : ''}
          <button class="swatch-turn" type="button" data-card-flip="${material.id}" aria-label="Turn ${material.name} swatch over for details" aria-expanded="false">↻ <span>TURN SWATCH</span></button>
          <div class="swatch-material-info"><small>${material.group}</small><h2>${material.name}</h2><span>${material.type}</span></div>
        </div>
        <div class="swatch-front-foot"><a href="/ai-studio.html?material=${encodeURIComponent(material.id)}">Try on your furniture ↗</a><button type="button" data-card-flip="${material.id}" aria-label="Read about ${material.name}" aria-expanded="false">Feel & details ↗</button></div>
      </div>
      <div class="swatch-face swatch-back" aria-hidden="true">
        <div class="swatch-back-heading"><span style="--swatch-color:${material.color}"></span><div><small>${material.group} / ${material.shade}</small><h2>${material.name}</h2></div><button type="button" data-card-flip="${material.id}" aria-label="Turn ${material.name} swatch back to front" aria-expanded="true">×</button></div>
        <p class="swatch-feel">${material.feel}</p><small class="swatch-image-credit">${material.textureCredit || 'Illustrative study'}${material.pbr?.normal ? ' · PBR maps available' : ''}</small>
        ${material.sourceUrl ? `<a class="swatch-source-link" href="${material.sourceUrl}" target="_blank" rel="noreferrer">CATALOGUE SOURCE / ${material.sourceLabel} ↗</a>` : ''}
        <dl class="swatch-facts"><div><dt>GOOD TO EXPLORE FOR</dt><dd>${material.use}</dd></div><div><dt>CARE STARTING POINT</dt><dd>${material.care}</dd></div><div><dt>CHECK BEFORE CHOOSING</dt><dd>${material.caution}</dd></div></dl>
        <div class="swatch-tags">${material.tags.slice(0, 3).map(tag => `<span>${tag.replace('-', ' ')}</span>`).join('')}</div>
        <div class="swatch-back-foot"><span>${material.style}</span><button class="${saved ? 'saved' : ''}" type="button" data-save-swatch="${material.id}">${saved ? 'SAVED TO BOOK ✓' : '＋ SAVE SWATCH'}</button></div>
      </div>
    </div>
  </article>`
}

function furnitureCard(form, index) {
  return `<article class="form-card" style="--folio-order:${index % 5}">
    <a class="form-card-image" href="/estimator.html?form=${encodeURIComponent(form.model)}" aria-label="Plan ${form.name}">
      <img src="${form.image}" alt="${form.imageAlt}" loading="lazy" decoding="async" style="object-position:${form.imagePosition || 'center'}">
      <span class="form-card-number">${String(index + 1).padStart(2, '0')}</span>
      <span class="form-card-arrow" aria-hidden="true">↗</span>
      <span class="form-card-category">${form.category}</span>
      ${form.supplier ? `<span class="form-source-badge">${form.supplier}</span>` : ''}
    </a>
    <div class="form-card-copy"><div class="form-card-rule"><span>${form.category}</span><i></i><span>FORM ${String(index + 1).padStart(2, '0')}</span></div><h2>${form.name}</h2><p>${form.description}</p><div class="form-card-actions"><a href="/estimator.html?form=${encodeURIComponent(form.model)}">Planning study <span>↗</span></a>${form.sourceUrl ? `<a class="source" href="${form.sourceUrl}" target="_blank" rel="noreferrer">View ${form.supplier} <span>↗</span></a>` : ''}</div></div>
  </article>`
}

const money = value => `R ${Number(value).toLocaleString('en-ZA')}`
const cartCount = () => state.cart.reduce((total, line) => total + line.quantity, 0)
const cartSubtotal = () => state.cart.reduce((total, line) => {
  const item = shopProducts.find(product => product.id === line.id)
  return total + (item ? item.price * line.quantity : 0)
}, 0)

function shopProductCard(item, index) {
  const wished = state.wishlist.includes(item.id)
  return `<article class="shop-product-card" style="--shop-order:${index % 6}">
    <div class="shop-product-media">
      <button class="shop-card-image" type="button" data-quick-view="${item.id}" aria-label="Quick view ${item.name}"><img src="${item.image}" alt="AI reconstruction of ${item.name}" loading="lazy" decoding="async"></button>
      <span class="shop-product-badge">${item.badge}</span>
      <button class="shop-wish ${wished ? 'active' : ''}" type="button" data-wishlist="${item.id}" aria-label="${wished ? 'Remove' : 'Save'} ${item.name}">${wished ? '♥' : '♡'}</button>
      <button class="shop-quick" type="button" data-quick-view="${item.id}">QUICK VIEW <span>↗</span></button>
    </div>
    <div class="shop-product-copy"><div><span>${item.category}</span><small>${item.supplier}</small></div><h3>${item.name}</h3><p>${item.description}</p><div class="shop-product-price"><strong>${money(item.price)}</strong><small>Supplier price</small></div><button class="shop-add" type="button" data-add-cart="${item.id}"><span>ADD TO BAG</span><b>＋</b></button></div>
  </article>`
}

function getVisibleShopProducts() {
  const query = state.shopQuery.trim().toLowerCase()
  const visible = shopProducts.filter(item => {
    const matchesCategory = state.shopCategory === 'all' || item.category === state.shopCategory
    const matchesQuery = `${item.name} ${item.category} ${item.material} ${item.description}`.toLowerCase().includes(query)
    const matchesPrice = state.shopPrice === 'all' ||
      (state.shopPrice === 'under5000' && item.price < 5000) ||
      (state.shopPrice === '5000-10000' && item.price >= 5000 && item.price <= 10000) ||
      (state.shopPrice === 'over10000' && item.price > 10000)
    return matchesCategory && matchesQuery && matchesPrice
  })
  if (state.shopSort === 'price-low') return visible.sort((a, b) => a.price - b.price)
  if (state.shopSort === 'price-high') return visible.sort((a, b) => b.price - a.price)
  if (state.shopSort === 'name') return visible.sort((a, b) => a.name.localeCompare(b.name))
  return visible
}

function cartMarkup() {
  const lines = state.cart.map(line => {
    const item = shopProducts.find(product => product.id === line.id)
    if (!item) return ''
    return `<article class="shop-cart-line"><img src="${item.image}" alt=""><div><span>${item.category}</span><strong>${item.name}</strong><small>${money(item.price)} each</small><div class="shop-cart-quantity"><button type="button" data-cart-quantity="${item.id}" data-delta="-1" aria-label="Decrease ${item.name} quantity">−</button><b>${line.quantity}</b><button type="button" data-cart-quantity="${item.id}" data-delta="1" aria-label="Increase ${item.name} quantity">＋</button></div></div><button class="shop-cart-remove" type="button" data-remove-cart="${item.id}" aria-label="Remove ${item.name}">×</button></article>`
  }).join('')
  return lines || '<div class="shop-cart-empty"><span>◇</span><h3>Your bag is waiting.</h3><p>Add a piece from the collection and it will stay here for your next visit.</p></div>'
}

function quickViewMarkup(item) {
  if (!item) return ''
  return `<div class="shop-modal-panel" role="dialog" aria-modal="true" aria-label="${item.name}"><button class="shop-modal-close" type="button" data-close-shop-modal aria-label="Close quick view">×</button><div class="shop-modal-media"><img src="${item.image}" alt="AI reconstruction of ${item.name}"><span>AI PRODUCT RECONSTRUCTION</span></div><div class="shop-modal-copy"><span>${item.badge} / ${item.category.toUpperCase()}</span><h2>${item.name}</h2><p>${item.description}</p><strong>${money(item.price)}</strong><dl><div><dt>MATERIAL</dt><dd>${item.material}</dd></div><div><dt>AVAILABILITY</dt><dd>${item.availability}</dd></div><div><dt>LEAD TIME</dt><dd>${item.leadTime}</dd></div></dl><small>Image is a reference-guided AI reconstruction; details can differ. Open the live supplier listing to inspect the exact item, options and stock.</small><div class="shop-modal-actions"><button class="shop-primary" type="button" data-add-cart="${item.id}">Add to bag <span>＋</span></button><a class="shop-ghost" href="${item.sourceUrl}" target="_blank" rel="noreferrer">View exact item at Hertex <span>↗</span></a></div></div></div>`
}

function checkoutMarkup() {
  const items = state.cart.map(line => {
    const item = shopProducts.find(product => product.id === line.id)
    return item ? `<a class="shop-handoff-line" href="${item.sourceUrl}" target="_blank" rel="noreferrer"><span><b>${line.quantity} × ${item.name}</b><small>${money(item.price * line.quantity)}</small></span><strong>OPEN AT HERTEX ↗</strong></a>` : ''
  }).join('')
  return `<div class="shop-modal-panel shop-handoff" role="dialog" aria-modal="true" aria-label="Supplier checkout links"><button class="shop-modal-close" type="button" data-close-shop-modal aria-label="Close supplier links">×</button><div><span>CHECKOUT HANDOFF</span><h2>Confirm each piece<br><em>at the source.</em></h2><p>This catalogue is a curated shopping layer. Hertex confirms the exact variant, delivery area, live stock and payment. Open each item below to complete the purchase with them.</p><div class="shop-handoff-list">${items}</div><a class="shop-primary" href="/contact.html">Ask us to help with the selection <span>↗</span></a></div></div>`
}

function syncCartUi() {
  document.querySelector('.cart-trigger b')?.replaceChildren(document.createTextNode(String(cartCount())))
  const list = document.querySelector('.shop-cart-list')
  if (list) list.innerHTML = cartMarkup()
  const subtotal = document.querySelector('.shop-cart-foot strong')
  if (subtotal) subtotal.textContent = money(cartSubtotal())
  const action = document.querySelector('.shop-cart-foot [data-shop-checkout], .shop-cart-foot>a.shop-checkout')
  if (action && !state.cart.length) action.outerHTML = '<a class="shop-checkout" href="/catalogue.html#shop-collection">EXPLORE THE COLLECTION <span>↗</span></a>'
  if (action && state.cart.length && action.tagName === 'A') action.outerHTML = '<button class="shop-checkout" type="button" data-shop-checkout>CONTINUE TO SUPPLIER LINKS <span>↗</span></button>'
}

function shell(content) {
  const info = pageInfo[state.route] || pageInfo.home
  document.title = `${info.title} — Upholstery Warehouse`
  const description = document.querySelector('meta[name="description"]')
  if (description) description.content = info.description
  const title = document.querySelector('meta[property="og:title"]')
  if (title) title.content = document.title
  const descriptionOg = document.querySelector('meta[property="og:description"]')
  if (descriptionOg) descriptionOg.content = info.description

  return `<div class="app-shell ${state.theme === 'light' ? 'theme-light' : ''}">
    <header class="site-header">
      <a class="brand-lockup" href="/index.html"><img src="/assets/logo.png" alt=""><span>UPHOLSTERY WAREHOUSE<small>ALL THINGS UPHOLSTERY</small></span></a>
      <nav class="site-nav" aria-label="Primary navigation">${navItems.map(([key, path, label]) => `<a class="${state.route === key ? 'active' : ''}" ${state.route === key ? 'aria-current="page"' : ''} href="${path}">${label}</a>`).join('')}</nav>
      <div class="header-tools"><a class="studio-link" href="/ai-studio.html">Try a material ↗</a><button class="tool-button" data-action="theme" aria-label="Toggle colour theme">${state.theme === 'dark' ? '☼' : '☾'}</button><button class="tool-button swatch-trigger" data-action="swatches" aria-label="Open swatch book" aria-expanded="false">▦ <b>${state.swatches.length}</b></button><button class="tool-button cart-trigger" data-action="cart" aria-label="Open shopping bag" aria-expanded="false">BAG <b>${cartCount()}</b></button><button class="mobile-menu" data-action="menu" aria-label="Toggle navigation" aria-expanded="false">☰</button></div>
    </header>
    <aside class="swatch-drawer" aria-hidden="true"><div class="drawer-head"><strong>Your swatch book</strong><button data-action="close-swatches" aria-label="Close swatch book">×</button></div><div class="drawer-list">${state.swatches.map(id => { const item = materials.find(material => material.id === id); return item ? `<div class="drawer-item"><img src="${item.image}" alt=""><span><b>${item.name}</b><small>${item.type} · ${item.shade}</small><em>${item.caution}</em></span><button data-remove-swatch="${item.id}" aria-label="Remove ${item.name}">×</button></div>` : '' }).join('')}</div><div class="drawer-foot"><span>${state.swatches.length} of 8 materials saved</span><a class="button gold" href="/profile.html">View swatch book</a></div></aside>
    <div class="drawer-backdrop" data-action="close-swatches"></div>
    <aside class="shop-cart-drawer" aria-hidden="true"><div class="shop-cart-head"><div><span>YOUR SELECTION</span><strong>Furniture bag</strong></div><button type="button" data-close-cart aria-label="Close shopping bag">×</button></div><div class="shop-cart-list">${cartMarkup()}</div><div class="shop-cart-foot"><div><span>SUBTOTAL</span><strong>${money(cartSubtotal())}</strong></div><p>Prices and availability are confirmed on the supplier site. Your bag is a local shortlist and does not reserve stock.</p>${state.cart.length ? `<button class="shop-checkout" type="button" data-shop-checkout>CONTINUE TO SUPPLIER LINKS <span>↗</span></button>` : '<a class="shop-checkout" href="/catalogue.html#shop-collection">EXPLORE THE COLLECTION <span>↗</span></a>'}</div></aside>
    <div class="shop-cart-backdrop" data-close-cart></div>
    <div class="shop-modal" aria-hidden="true"><div class="shop-modal-backdrop" data-close-shop-modal></div><div class="shop-modal-content"></div></div>
    <main id="main-content">${content}</main>
    <footer class="site-footer"><div class="footer-top"><a class="brand-lockup" href="/index.html"><img src="/assets/logo.png" alt=""><span>UPHOLSTERY WAREHOUSE<small>ALL THINGS UPHOLSTERY</small></span></a><p>Thoughtful upholstery for furniture with more life in it.</p><a class="button gold" href="/contact.html">Talk to the workshop ↗</a></div><div class="footer-links">${navItems.map(([, path, label]) => `<a href="${path}">${label}</a>`).join('')}<a href="/lab.html">Material lab</a><a href="/estimator.html">Project planner</a><a href="/profile.html">Swatch book</a></div><div class="footer-bottom"><span>MADE FOR REAL LIFE / JOHANNESBURG</span><span>© ${new Date().getFullYear()} UPHOLSTERY WAREHOUSE</span></div></footer>
  </div>`
}

function renderMaterialResults() {
  const filtered = materials.filter(item =>
    (state.filter === 'all' || item.group === state.filter) &&
    (state.useFilter === 'all' || item.tags.includes(state.useFilter)) &&
    `${item.name} ${item.type} ${item.group} ${item.shade} ${item.feel} ${item.use} ${item.care} ${item.style} ${item.supplier || ''} ${item.sourceLabel || ''} ${item.tags.join(' ')}`.toLowerCase().includes(state.query.trim().toLowerCase()))
  const results = document.querySelector('#material-results')
  if (results) results.innerHTML = filtered.map(materialCard).join('') || '<p class="empty-results">No swatches fit that brief. Try a broader filter or reset your filters.</p>'
  const count = document.querySelector('#material-count')
  if (count) count.textContent = `${filtered.length} OF ${materials.length} DIRECTIONS`
  document.querySelectorAll('[data-family-filter]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.familyFilter === state.filter)))
}

function renderFurnitureResults() {
  const filtered = furnitureForms.filter(form =>
    (state.furnitureFilter === 'all' || form.category === state.furnitureFilter) &&
    `${form.name} ${form.category} ${form.description} ${form.supplier || ''} ${form.sourceLabel || ''}`.toLowerCase().includes(state.query.trim().toLowerCase()))
  const results = document.querySelector('#furniture-results')
  if (results) results.innerHTML = filtered.map((form, index) => furnitureCard(form, index)).join('') || '<p class="empty-results">No furniture forms match that search. Try another name or category.</p>'
  const count = document.querySelector('#furniture-count')
  if (count) count.textContent = `${filtered.length} OF ${furnitureForms.length} FORMS`
  document.querySelectorAll('[data-furniture-filter]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.furnitureFilter === state.furnitureFilter)))
}

function renderShopResults() {
  const visible = getVisibleShopProducts()
  const results = document.querySelector('#shop-results')
  if (results) results.innerHTML = visible.map(shopProductCard).join('') || '<p class="shop-empty">Nothing matches that combination. Reset the filters and keep exploring.</p>'
  const count = document.querySelector('#shop-count')
  if (count) count.textContent = String(visible.length)
  document.querySelectorAll('[data-shop-category]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.shopCategory === state.shopCategory)))
}

function render() {
  disposeStudio?.()
  if (currentCameraStream) {
    currentCameraStream.getTracks().forEach(track => track.stop())
    currentCameraStream = null
  }
  arPreview?.dispose()
  arPreview = null
  const pageKey = document.body.dataset.page
  state.route = pageKey in pageInfo ? pageKey : 'home'
  const context = { materials, materialGroups, materialUses, models, state, media, linkButton, materialCard, furnitureForms, furnitureCategories, furnitureCard, shopProducts, shopCategories, shopProductCard, getVisibleShopProducts, furnitureCatalogueUrl }
  const pageRenderers = {
    home: renderHome,
    landing: renderLanding,
    materials: renderMaterials,
    catalogue: renderCatalogue,
    lab: renderLab,
    studio: renderStudio,
    visualiser: renderVisualiser,
    services: renderServices,
    journal: renderJournal,
    estimator: renderEstimator,
    profile: renderProfile,
    contact: renderContact,
  }
  document.querySelector('#app').innerHTML = shell(pageRenderers[state.route](context))
  bind()
  if (state.route === 'studio') disposeStudio = mountStudio(materials)
  window.scrollTo(0, 0)
}

function saveSwatch(id) {
  if (!materials.some(item => item.id === id) || state.swatches.includes(id)) return
  if (state.swatches.length >= 8) {
    const trigger = document.querySelector('.swatch-trigger')
    trigger?.setAttribute('aria-label', 'Swatch book is full. Remove a material before saving another.')
    window.setTimeout(() => trigger?.setAttribute('aria-label', 'Open swatch book'), 2500)
    return
  }
  state.swatches.push(id)
  persistSwatches()
  document.querySelectorAll(`[data-save-swatch="${CSS.escape(id)}"]`).forEach(button => {
    button.classList.add('saved')
    button.textContent = 'SAVED TO BOOK ✓'
    button.setAttribute('aria-label', `${materials.find(item => item.id === id)?.name} saved to your swatch book`)
  })
  document.querySelector('.swatch-trigger b')?.replaceChildren(document.createTextNode(String(state.swatches.length)))
  const drawer = document.querySelector('.drawer-list')
  if (drawer) drawer.innerHTML = state.swatches.map(savedId => {
    const item = materials.find(material => material.id === savedId)
    return item ? `<div class="drawer-item"><img src="${item.image}" alt=""><span><b>${item.name}</b><small>${item.type} · ${item.shade}</small><em>${item.caution}</em></span><button data-remove-swatch="${item.id}" aria-label="Remove ${item.name}">×</button></div>` : ''
  }).join('')
  document.querySelector('.drawer-foot>span')?.replaceChildren(document.createTextNode(`${state.swatches.length} of 8 materials saved`))
}

function setActiveMaterial(id) {
  const next = materials.find(item => item.id === id)
  if (!next) return
  state.material = next
  arPreview?.setMaterial(next)
  document.querySelectorAll('[data-preview-material], [data-lab-material]').forEach(button => button.classList.toggle('active', button.dataset.previewMaterial === id || button.dataset.labMaterial === id))
  document.querySelector('#lab-material-name')?.replaceChildren(document.createTextNode(next.name))
  document.querySelector('#camera-material-name')?.replaceChildren(document.createTextNode(next.name))
  document.querySelector('.camera-zone')?.style.setProperty('--camera-tint', next.color)
  document.querySelector('.concept-preview')?.style.setProperty('--preview-tint', next.color)
}

async function startCamera() {
  const status = document.querySelector('#camera-status')
  const video = document.querySelector('#camera-video')
  const zone = document.querySelector('.camera-zone')
  if (!status || !video || !zone) return
  if (!navigator.mediaDevices?.getUserMedia) {
    status.textContent = 'Camera is unavailable in this browser. Choose a photo instead.'
    return
  }
  status.textContent = 'Starting camera…'
  try {
    const { loadEightWallRuntime, startEightWallSession } = await import('./ar-material-preview.js')
    const XR8 = await loadEightWallRuntime({
      scriptUrl: import.meta.env.VITE_EIGHTH_WALL_SCRIPT_URL,
      onError: message => { status.textContent = `${message} Starting standard camera preview.` },
    })
    if (XR8 && startEightWallSession({
      XR8,
      canvas: document.querySelector('#xr-camera-canvas'),
      onStatus: message => { status.textContent = message },
      onError: message => { status.textContent = `${message} Starting standard camera preview.` },
    })) {
      zone.classList.add('camera-live')
      return
    }
    currentCameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
    video.srcObject = currentCameraStream
    await video.play()
    zone.classList.add('camera-live')
    status.textContent = 'Live camera active. Select a finish to explore the material direction.'
  } catch (error) {
    status.textContent = error.name === 'NotAllowedError'
      ? 'Camera permission was denied. Enable it in browser settings or choose a photo.'
      : `Camera could not start: ${error.message || 'check permissions or choose a photo instead.'}`
  }
}

async function downloadConcept(button) {
  if (!state.uploaded) {
    button.textContent = 'Choose a photo first'
    window.setTimeout(() => { button.textContent = 'Download preview ↓' }, 1800)
    return
  }
  button.disabled = true
  button.textContent = 'Preparing image…'
  try {
    const image = new Image()
    image.src = state.uploaded
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    const context = canvas.getContext('2d')
    if (!context) throw new Error('This browser cannot create an image preview.')
    const filters = { natural: 'saturate(.92) contrast(1.02)', velvet: 'saturate(.9) contrast(1.08)', woven: 'saturate(.78) contrast(1.12)', leather: 'saturate(1.05) contrast(1.14) sepia(.1)' }
    context.filter = filters[state.previewFinish] || filters.natural
    context.drawImage(image, 0, 0)
    context.filter = 'none'
    context.globalCompositeOperation = 'color'
    context.globalAlpha = state.previewIntensity / 100
    context.fillStyle = state.material.color
    context.fillRect(0, 0, canvas.width, canvas.height)
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
    if (!blob) throw new Error('The browser could not encode the preview image.')
    const objectUrl = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = objectUrl
    anchor.download = `upholstery-${state.material.id}-${state.previewFinish}.png`
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
    button.textContent = 'Preview downloaded ✓'
  } catch (error) {
    button.textContent = error.message || 'Could not create preview'
  } finally {
    button.disabled = false
    window.setTimeout(() => { if (button.isConnected) button.textContent = 'Download preview ↓' }, 2200)
  }
}

function updateEstimator() {
  const base = Number(models[state.estimator.furniture]?.[1]) || 7.4
  const total = (base * state.estimator.quantity).toFixed(1)
  document.querySelectorAll('[data-estimate-total]').forEach(node => { node.textContent = `${total}m` })
  const tier = document.querySelector('[data-estimate-tier]')
  if (tier) tier.textContent = state.estimator.tier === 'heritage' ? 'Specialist' : state.estimator.tier === 'artisan' ? 'Detailed' : 'Everyday'
  document.querySelectorAll('.tier').forEach(label => label.classList.toggle('active', label.querySelector('input')?.value === state.estimator.tier))
}

function bind() {
  const cameraCanvas = document.querySelector('#camera-canvas')
  if (cameraCanvas) {
    import('./ar-material-preview.js').then(({ createMaterialPreview }) => {
      arPreview = createMaterialPreview({
        canvas: cameraCanvas,
        material: state.material,
        onStatus: message => { const status = document.querySelector('#camera-status'); if (status) status.textContent = message },
      })
    }).catch(error => {
      const status = document.querySelector('#camera-status')
      if (status) status.textContent = `3D preview unavailable: ${error.message}`
    })
  }

  document.querySelector('[data-action="theme"]')?.addEventListener('click', event => { state.theme = state.theme === 'dark' ? 'light' : 'dark'; document.querySelector('.app-shell').classList.toggle('theme-light',state.theme==='light');event.currentTarget.textContent=state.theme==='dark'?'☼':'☾' })
  document.querySelector('[data-action="menu"]')?.addEventListener('click', event => {
    const nav = document.querySelector('.site-nav')
    const open = nav?.classList.toggle('open') || false
    event.currentTarget.setAttribute('aria-expanded', String(open))
  })
  document.querySelector('[data-action="swatches"]')?.addEventListener('click', () => {
    document.querySelector('.swatch-drawer')?.classList.add('open')
    document.querySelector('.drawer-backdrop')?.classList.add('open')
    document.querySelector('.swatch-drawer')?.setAttribute('aria-hidden', 'false')
    document.querySelector('.swatch-trigger')?.setAttribute('aria-expanded', 'true')
  })
  document.querySelectorAll('[data-action="close-swatches"]').forEach(button => button.addEventListener('click', () => {
    document.querySelector('.swatch-drawer')?.classList.remove('open')
    document.querySelector('.drawer-backdrop')?.classList.remove('open')
    document.querySelector('.swatch-drawer')?.setAttribute('aria-hidden', 'true')
    document.querySelector('.swatch-trigger')?.setAttribute('aria-expanded', 'false')
  }))
  const openCart = () => {
    document.querySelector('.shop-cart-drawer')?.classList.add('open')
    document.querySelector('.shop-cart-backdrop')?.classList.add('open')
    document.querySelector('.shop-cart-drawer')?.setAttribute('aria-hidden', 'false')
    document.querySelector('.cart-trigger')?.setAttribute('aria-expanded', 'true')
  }
  const closeCart = () => {
    document.querySelector('.shop-cart-drawer')?.classList.remove('open')
    document.querySelector('.shop-cart-backdrop')?.classList.remove('open')
    document.querySelector('.shop-cart-drawer')?.setAttribute('aria-hidden', 'true')
    document.querySelector('.cart-trigger')?.setAttribute('aria-expanded', 'false')
  }
  const openShopModal = markup => {
    const modal = document.querySelector('.shop-modal')
    const content = document.querySelector('.shop-modal-content')
    if (!modal || !content) return
    content.innerHTML = markup
    modal.classList.add('open')
    modal.setAttribute('aria-hidden', 'false')
    document.body.classList.add('modal-open')
    window.setTimeout(() => content.querySelector('button')?.focus(), 50)
  }
  const closeShopModal = () => {
    document.querySelector('.shop-modal')?.classList.remove('open')
    document.querySelector('.shop-modal')?.setAttribute('aria-hidden', 'true')
    document.body.classList.remove('modal-open')
  }
  document.querySelector('[data-action="cart"]')?.addEventListener('click', openCart)
  document.querySelectorAll('[data-close-cart]').forEach(button => button.addEventListener('click', closeCart))
  document.querySelector('#app')?.addEventListener('click', event => {
    const button = event.target.closest('[data-remove-swatch]')
    if (!button) return
    state.swatches = state.swatches.filter(id => id !== button.dataset.removeSwatch)
    persistSwatches()
    render()
  })
  document.querySelector('#app')?.addEventListener('click', event => {
    const quickView = event.target.closest('[data-quick-view]')
    if (quickView) {
      openShopModal(quickViewMarkup(shopProducts.find(item => item.id === quickView.dataset.quickView)))
      return
    }
    if (event.target.closest('[data-close-shop-modal]')) {
      closeShopModal()
      return
    }
    const wishlist = event.target.closest('[data-wishlist]')
    if (wishlist) {
      const id = wishlist.dataset.wishlist
      state.wishlist = state.wishlist.includes(id) ? state.wishlist.filter(item => item !== id) : [...state.wishlist, id]
      persistShopState()
      wishlist.classList.toggle('active', state.wishlist.includes(id))
      wishlist.textContent = state.wishlist.includes(id) ? '♥' : '♡'
      return
    }
    const add = event.target.closest('[data-add-cart]')
    if (add) {
      const id = add.dataset.addCart
      const line = state.cart.find(item => item.id === id)
      if (line) line.quantity += 1
      else state.cart.push({ id, quantity: 1 })
      persistShopState()
      syncCartUi()
      closeShopModal()
      openCart()
      return
    }
    const quantity = event.target.closest('[data-cart-quantity]')
    if (quantity) {
      const line = state.cart.find(item => item.id === quantity.dataset.cartQuantity)
      if (line) line.quantity = Math.max(0, line.quantity + Number(quantity.dataset.delta))
      state.cart = state.cart.filter(item => item.quantity > 0)
      persistShopState()
      syncCartUi()
      return
    }
    const remove = event.target.closest('[data-remove-cart]')
    if (remove) {
      state.cart = state.cart.filter(item => item.id !== remove.dataset.removeCart)
      persistShopState()
      syncCartUi()
      return
    }
    if (event.target.closest('[data-shop-checkout]')) {
      closeCart()
      openShopModal(checkoutMarkup())
    }
  })
  document.querySelector('#material-results')?.addEventListener('click', event => {
    const flip = event.target.closest('[data-card-flip]')
    if (flip) {
      const card = flip.closest('.swatch-card')
      card?.classList.toggle('is-flipped')
      const isFlipped = card?.classList.contains('is-flipped') || false
      card?.querySelector('.swatch-front')?.setAttribute('aria-hidden', String(isFlipped))
      card?.querySelector('.swatch-back')?.setAttribute('aria-hidden', String(!isFlipped))
      card?.querySelectorAll('[data-card-flip]').forEach(toggle => toggle.setAttribute('aria-expanded', String(isFlipped)))
      card?.querySelector(isFlipped ? '.swatch-back [data-card-flip]' : '.swatch-front [data-card-flip]')?.focus()
      return
    }
    const save = event.target.closest('[data-save-swatch]')
    if (save) saveSwatch(save.dataset.saveSwatch)
  })
  document.querySelector('#material-search')?.addEventListener('input', event => { state.query = event.currentTarget.value; renderMaterialResults() })
  document.querySelector('[data-reset-material-filters]')?.addEventListener('click', () => {
    state.query = ''
    state.filter = 'all'
    state.useFilter = 'all'
    document.querySelector('#material-search').value = ''
    document.querySelector('#material-use-filter').value = 'all'
    renderMaterialResults()
  })
  document.querySelectorAll('[data-family-filter]').forEach(button => button.addEventListener('click', () => { state.filter = button.dataset.familyFilter; renderMaterialResults() }))
  document.querySelector('#material-use-filter')?.addEventListener('change', event => { state.useFilter = event.currentTarget.value; renderMaterialResults() })
  document.querySelector('#furniture-search')?.addEventListener('input', event => { state.query = event.currentTarget.value; renderFurnitureResults() })
  document.querySelector('[data-reset-furniture-filters]')?.addEventListener('click', () => {
    state.query = ''
    state.furnitureFilter = 'all'
    document.querySelector('#furniture-search').value = ''
    renderFurnitureResults()
  })
  document.querySelectorAll('[data-furniture-filter]').forEach(button => button.addEventListener('click', () => { state.furnitureFilter = button.dataset.furnitureFilter; renderFurnitureResults() }))
  document.querySelector('#shop-search')?.addEventListener('input', event => { state.shopQuery = event.currentTarget.value; renderShopResults() })
  document.querySelector('#shop-price')?.addEventListener('change', event => { state.shopPrice = event.currentTarget.value; renderShopResults() })
  document.querySelector('#shop-sort')?.addEventListener('change', event => { state.shopSort = event.currentTarget.value; renderShopResults() })
  document.querySelectorAll('[data-shop-category]').forEach(button => button.addEventListener('click', () => { state.shopCategory = button.dataset.shopCategory; renderShopResults() }))
  document.querySelector('[data-reset-shop]')?.addEventListener('click', () => {
    state.shopQuery = ''
    state.shopCategory = 'all'
    state.shopPrice = 'all'
    state.shopSort = 'featured'
    document.querySelector('#shop-search').value = ''
    document.querySelector('#shop-price').value = 'all'
    document.querySelector('#shop-sort').value = 'featured'
    renderShopResults()
  })
  document.querySelectorAll('[data-model]').forEach(button => button.addEventListener('click', () => { state.model = button.dataset.model; render() }))
  document.querySelectorAll('[data-lab-material]').forEach(button => button.addEventListener('click', () => {
    state.material = materials.find(item => item.id === button.dataset.labMaterial) || state.material
    render()
  }))
  document.querySelectorAll('[data-preview-material]').forEach(button => button.addEventListener('click', () => setActiveMaterial(button.dataset.previewMaterial)))
  document.querySelectorAll('[data-preview-finish]').forEach(button => button.addEventListener('click', () => {
    state.previewFinish = button.dataset.previewFinish
    document.querySelector('.concept-preview')?.classList.remove('finish-natural', 'finish-velvet', 'finish-woven', 'finish-leather')
    document.querySelector('.concept-preview')?.classList.add(`finish-${state.previewFinish}`)
    document.querySelectorAll('[data-preview-finish]').forEach(item => item.classList.toggle('active', item === button))
  }))
  document.querySelector('#photo-input')?.addEventListener('change', event => {
    const file = event.currentTarget.files?.[0]
    if (!file) return
    const errorNode = document.querySelector('#photo-error')
    if (!file.type.startsWith('image/')) { if (errorNode) errorNode.textContent = 'Choose an image file such as JPG, PNG or WebP.'; return }
    if (file.size > 15 * 1024 * 1024) { if (errorNode) errorNode.textContent = 'This image is larger than 15 MB. Choose a smaller file.'; return }
    if (state.uploaded) URL.revokeObjectURL(state.uploaded)
    state.uploaded = URL.createObjectURL(file)
    const preview = document.querySelector('.concept-preview')
    preview.innerHTML = `<img src="${state.uploaded}" alt="Your uploaded furniture photo"><span>LOCAL MATERIAL STUDY</span>`
    preview.classList.add('has-image')
    preview.style.setProperty('--preview-tint', state.material.color)
    if (errorNode) errorNode.textContent = ''
  })
  document.querySelector('#preview-intensity')?.addEventListener('input', event => {
    state.previewIntensity = Number(event.currentTarget.value)
    document.querySelector('.concept-preview')?.style.setProperty('--preview-intensity', `${state.previewIntensity}%`)
    const output = document.querySelector('#preview-intensity-value')
    if (output) output.textContent = `${state.previewIntensity}%`
  })
  document.querySelector('[data-action="save-concept"]')?.addEventListener('click', event => downloadConcept(event.currentTarget))
  document.querySelector('[data-action="start-camera"]')?.addEventListener('click', startCamera)
  document.querySelector('#estimate-furniture')?.addEventListener('change', event => { state.estimator.furniture = event.currentTarget.value; updateEstimator() })
  document.querySelector('#estimate-quantity')?.addEventListener('change', event => {
    state.estimator.quantity = Math.min(12, Math.max(1, Number(event.currentTarget.value) || 1))
    event.currentTarget.value = String(state.estimator.quantity)
    updateEstimator()
  })
  document.querySelectorAll('input[name="tier"]').forEach(input => input.addEventListener('change', event => { state.estimator.tier = event.currentTarget.value; updateEstimator() }))

  const viewport = document.querySelector('#viewport')
  const furniture = document.querySelector('.furniture')
  if (viewport && furniture) {
    let down = false
    let previousX = 0
    let rotation = -8
    viewport.addEventListener('pointerdown', event => { down = true; previousX = event.clientX; viewport.setPointerCapture(event.pointerId) })
    viewport.addEventListener('pointermove', event => {
      if (!down) return
      rotation += (event.clientX - previousX) * 0.35
      previousX = event.clientX
      furniture.style.transform = `translate(-50%,-50%) rotateY(${rotation}deg)`
    })
    viewport.addEventListener('pointerup', () => { down = false })
    viewport.addEventListener('pointercancel', () => { down = false })
  }

  const revealItems = document.querySelectorAll('.section, .swatchbook-intro, .swatchbook-library, .furniture-folio-heading, .form-card, .swatch-card, .journal-card, .service-list article')
  if ('IntersectionObserver' in window) {
    const revealObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return
        entry.target.classList.add('is-revealed')
        revealObserver.unobserve(entry.target)
      })
    }, { rootMargin: '0px 0px -7% 0px', threshold: 0.06 })
    revealItems.forEach((item, index) => {
      item.classList.add('reveal-ready')
      item.style.setProperty('--reveal-order', String(index % 6))
      revealObserver.observe(item)
    })
  } else {
    revealItems.forEach(item => item.classList.add('is-revealed'))
  }
}

function mountLoader(pageKey) {
  if (document.querySelector('.site-loader')) return
  document.body.insertAdjacentHTML('afterbegin', `<div class="site-loader" role="status" aria-live="polite"><div class="loader-weave"><i></i><i></i><i></i><i></i><i></i></div><div class="loader-brand"><img src="/assets/logo.png" alt=""><span>UPHOLSTERY WAREHOUSE</span><small>Preparing the ${pageKey === 'catalogue' ? 'furniture folio' : pageKey === 'materials' ? 'material room' : 'showroom'}</small></div><div class="loader-progress"><span></span></div></div>`)
  const loader = document.querySelector('.site-loader')
  const finish = () => {
    if (!loader || loader.classList.contains('is-finished')) return
    loader.classList.add('is-finished')
    window.setTimeout(() => loader.remove(), 700)
  }
  if (document.readyState === 'complete') window.setTimeout(finish, 420)
  else window.addEventListener('load', () => window.setTimeout(finish, 260), { once: true })
  window.setTimeout(finish, 1800)
}

export function mountPage(pageKey) {
  mountLoader(pageKey)
  document.body.dataset.page = pageKey
  render()
}
