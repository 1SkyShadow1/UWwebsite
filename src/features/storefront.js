import { materials, materialGroups, materialUses } from '../data/materials.js'
import { shopProducts } from '../data/shop-products.js'
import { findMaterialDirections, formatMoney, pairMaterials, productUrl, searchShowroom } from '../data/discovery.js'
import { readLocal, writeLocal } from '../lib/api.js'
import { escapeHtml } from '../lib/html.js'
import { icon } from '../lib/icons.js'
import { downloadText } from '../lib/download.js'
import { selectionDetails } from '../data/shopping.js'
import { chosenMaterialIds } from '../data/planning.js'

export function recentProducts() {
  const ids = readLocal('uw-recent-products', [])
  return Array.isArray(ids) ? [...new Set(ids)].map(id => shopProducts.find(item => item.id === id)).filter(Boolean).slice(0, 8) : []
}

export function recordRecentProduct(id) {
  if (!shopProducts.some(item => item.id === id)) return
  writeLocal('uw-recent-products', [id, ...recentProducts().map(item => item.id).filter(value => value !== id)].slice(0, 8))
  paintRecentProducts()
}

export function paintRecentProducts() {
  document.querySelectorAll('[data-recent-products]').forEach(container => {
    const items = recentProducts().slice(0, 4)
    container.hidden = !items.length
    container.innerHTML = `<div class="section-heading"><div><p class="spec-label">PICK UP WHERE YOU LEFT OFF</p><h2>A second <em>look.</em></h2></div><span class="quiet-caption">Recently viewed on this browser</span></div><div class="recent-grid">${items.map(item => `<button class="recent-card" type="button" data-quick-view="${item.id}"><img src="${item.image}" alt="Illustrative view of ${escapeHtml(item.name)}" loading="lazy"><span>${escapeHtml(item.category)}</span><h3>${escapeHtml(item.name)}</h3><small>${formatMoney(item.price)} · reference</small></button>`).join('')}</div>`
  })
}

export function productDetailMarkup(item, state) {
  const saved = state.wishlist.includes(item.id)
  const comparing = state.productCompare.includes(item.id)
  const pairs = pairMaterials(item)
  return `<div class="shop-modal-panel product-detail" role="dialog" aria-modal="true" aria-label="${escapeHtml(item.name)}">
    <button class="shop-modal-close" type="button" data-close-shop-modal aria-label="Close product details">×</button>
    <div class="shop-modal-media"><button class="product-image-zoom" type="button" data-product-zoom aria-label="Enlarge illustrative product image" aria-pressed="false"><img src="${item.image}" alt="Illustrative reconstruction of ${escapeHtml(item.name)}"><span>Illustrative image · tap to look closer ${icon('search')}</span></button></div>
    <div class="shop-modal-copy"><a class="detail-category" href="/catalogue.html?category=${encodeURIComponent(item.category)}#shop-collection">${escapeHtml(item.category)} / ${escapeHtml(item.supplier)}</a><h2>${escapeHtml(item.name)}</h2><p>${escapeHtml(item.description)}</p>
      <div class="detail-price"><strong>${formatMoney(item.price)}</strong><span>Reference price · 29 September 2026</span></div>
      <dl><div><dt>SURFACE</dt><dd>${escapeHtml(item.material)}</dd></div><div><dt>STOCK & FINISH</dt><dd>Confirm the exact options with ${escapeHtml(item.supplier)}</dd></div><div><dt>DELIVERY</dt><dd>Supplier confirms the area, cost and lead time</dd></div></dl>
      <div class="detail-purchase"><label>Quantity<input type="number" data-product-quantity min="1" max="99" step="1" value="1" inputmode="numeric"></label><button class="shop-primary" type="button" data-add-cart="${item.id}">Add to selection ${icon('bag')}</button></div>
      <div class="detail-tools"><button type="button" data-wishlist="${item.id}" aria-pressed="${saved}" aria-label="${saved ? 'Remove' : 'Save'} ${escapeHtml(item.name)}">${icon('heart')} <span>${saved ? 'Saved piece' : 'Save piece'}</span></button><button type="button" data-compare-product="${item.id}" aria-pressed="${comparing}">${icon('compare')} <span>${comparing ? 'Comparing' : 'Compare'}</span></button><button type="button" data-copy-product="${item.id}">${icon('grid')} Copy link</button></div>
      <input class="share-link-input" data-share-link readonly hidden aria-label="Product link">
      <a class="detail-supplier-link" href="${item.sourceUrl}" target="_blank" rel="noreferrer">Check the exact piece at Hertex HAUS ↗</a>
      <details class="detail-checklist"><summary>Before you choose</summary><p>Confirm the supplier’s dimensions, finish, current price and stock. Check the space, doorways and access route before ordering. Our image is a reconstruction and details can differ.</p></details>
      <div class="detail-pairings"><p class="spec-label">EXPLORE A SURFACE DIRECTION</p><div>${pairs.map(material => `<a href="/ai-studio.html?material=${material.id}"><span class="discovery-sample ${material.preserveTextureColor ? 'original' : ''}" style="--discovery-color:${material.color}"><img src="${material.image}" alt=""></span><span>${escapeHtml(material.name)}<small>Try in the Studio ↗</small></span></a>`).join('')}</div><small>Material inspiration; confirm suitability and an exact physical sample.</small></div>
    </div></div>`
}

export function storefrontMarkup(state) {
  return `<dialog class="showroom-dialog search-dialog" id="showroom-search" aria-labelledby="showroom-search-title"><div class="dialog-top"><div><p class="spec-label">YOUR NEXT GOOD FIND</p><h2 id="showroom-search-title">Search the <em>showroom.</em></h2></div><button type="button" data-close-native aria-label="Close showroom search">×</button></div><label class="global-search-field">${icon('search')}<input id="global-search-input" type="search" placeholder="A piece, a fabric, a fresh idea…" autocomplete="off" aria-label="Search the showroom" aria-describedby="search-keyboard-hint" aria-controls="global-search-results"></label><div class="search-scopes" role="group" aria-label="Search category">${[['all','Everything'],['furniture','Furniture'],['materials','Materials'],['tools','The workshop']].map(([value,label]) => `<button type="button" data-search-scope="${value}" aria-pressed="${value === 'all'}">${label}</button>`).join('')}</div><p class="search-result-note" id="search-result-note" role="status"></p><div class="global-search-results" id="global-search-results"></div><p class="quiet-caption" id="search-keyboard-hint">↓ to explore results · Enter to open · Esc to close</p></dialog>
    <dialog class="showroom-dialog finder-dialog" id="material-finder" aria-labelledby="material-finder-title"><div class="dialog-top"><div><p class="spec-label">A LITTLE GUIDANCE GOES A LONG WAY</p><h2 id="material-finder-title">Find your <em>feeling.</em></h2></div><button type="button" data-close-native aria-label="Close material finder">×</button></div><p class="dialog-intro">Start with your setting, surface and colour mood. These are directions to explore; the exact fabric specification makes the final choice.</p><form id="material-finder-form"><label>Where will it live?<select name="setting">${materialUses.map(([value,label]) => `<option value="${value}">${label}</option>`).join('')}</select></label><label>What kind of surface?<select name="family"><option value="all">Any surface</option>${materialGroups.map(group => `<option>${escapeHtml(group)}</option>`).join('')}</select></label><label>Your colour mood<select name="tone"><option value="any">Open to possibilities</option><option value="light">Light & neutral</option><option value="earthy">Warm & earthy</option><option value="deep">Deep & quiet</option><option value="colour">A little colour</option></select></label></form><p id="finder-result-note" role="status" class="search-result-note"></p><div class="finder-results" id="finder-results"></div><a class="text-link" href="/materials.html">Explore all ${materials.length} directions ↗</a></dialog>
    <dialog class="showroom-dialog product-compare-dialog" id="product-comparison" aria-labelledby="product-comparison-title"><div class="dialog-top"><div><p class="spec-label">A CONSIDERED CHOICE</p><h2 id="product-comparison-title">Side by <em>side.</em></h2></div><button type="button" data-close-native aria-label="Close furniture comparison">×</button></div><div id="product-comparison-content"></div></dialog>
    <div class="store-compare-tray" id="store-compare-tray" hidden><div><span class="spec-label">YOUR FURNITURE EDIT</span><div id="product-compare-chips"></div></div><div><button type="button" data-clear-product-comparison>Clear</button><button class="button gold" type="button" data-open-product-comparison>Compare pieces ↗</button></div></div>
    <nav class="mobile-dock" aria-label="Quick showroom navigation">${[['home','/index.html','home','Home'],['catalogue','/catalogue.html','bag','Shop'],['studio','/ai-studio.html','spark','Studio'],['profile','/profile.html','heart','Saved']].map(([route,path,symbol,label])=>`<a href="${path}" ${state.route === route ? 'aria-current="page"' : ''}>${icon(symbol)}<span>${label}</span></a>`).join('')}</nav>`
}

export function paintShoppingUi(state, cardRenderer, status) {
  document.querySelectorAll('[data-wishlist-count]').forEach(node => { node.textContent = state.wishlist.length })
  document.querySelectorAll('[data-saved-count]').forEach(node => { node.textContent = state.wishlist.length + state.swatches.length })
  document.querySelectorAll('.store-sync-status').forEach(node => { if (status) node.textContent = status })
  const attached = document.querySelector('[data-selection-summary]')
  if (attached) {
    const units = state.cart.reduce((sum, line) => sum + line.quantity, 0)
    const hasPlan = Boolean(readLocal('uw-plan-draft', null))
    const directions = hasPlan ? chosenMaterialIds(state) : state.swatches
    attached.innerHTML = `<span class="spec-label">READY TO BRING INTO THE CONVERSATION</span><div class="selection-summary-chips">${state.cart.slice(0,3).map(line => `<span>${line.quantity} × ${escapeHtml(shopProducts.find(item => item.id === line.id)?.name)}</span>`).join('')}${directions.slice(0,3).map(id => `<span>${escapeHtml(materials.find(item => item.id === id)?.name)}</span>`).join('')}</div>${!units && !directions.length ? '<p>Your choices can start here. The showroom is ready when you are.</p>' : ''}`
    const count = document.querySelector('[data-selection-count]')
    if (count) count.textContent = `${directions.length} material directions, ${units} furniture piece${units === 1 ? '' : 's'}${hasPlan ? ' and your project plan' : ''}.`
  }
  const saved = document.querySelector('#saved-furniture')
  if (saved) saved.innerHTML = shopProducts.filter(item => state.wishlist.includes(item.id)).map(cardRenderer).join('') || '<div class="store-empty"><span>♡</span><h3>A little room for a favourite.</h3><p>Save a piece from the collection and it will be waiting here.</p><a class="text-link" href="/catalogue.html">Explore furniture ↗</a></div>'
  document.querySelectorAll('[data-wishlist]').forEach(button => {
    const active = state.wishlist.includes(button.dataset.wishlist)
    const name = shopProducts.find(item => item.id === button.dataset.wishlist)?.name || 'piece'
    button.classList.toggle('active', active)
    button.setAttribute('aria-pressed', String(active))
    button.setAttribute('aria-label', `${active ? 'Remove' : 'Save'} ${name}`)
    if (button.classList.contains('shop-wish')) button.innerHTML = icon('heart')
    else button.querySelector('span')?.replaceChildren(document.createTextNode(active ? 'Saved piece' : 'Save piece'))
  })
}

export function bindStorefront({ state, notify, signal, openProduct, retrySync }) {
  const root = document.querySelector('#app')
  const search = document.querySelector('#showroom-search')
  const finder = document.querySelector('#material-finder')
  const comparison = document.querySelector('#product-comparison')
  let scope = 'all'
  const paintSearch = () => {
    const query = document.querySelector('#global-search-input').value
    const results = searchShowroom(query, scope)
    document.querySelector('#search-result-note').textContent = query.trim() ? `${results.length}${results.length === 12 ? '+' : ''} directions found` : 'Start with something you love.'
    document.querySelector('#global-search-results').innerHTML = results.length ? results.map(item => `<a class="global-result" href="${escapeHtml(item.href)}">${item.image ? (item.type === 'materials' ? `<span class="discovery-sample ${item.preserveTextureColor ? 'original' : ''}" style="--discovery-color:${item.color}"><img src="${item.image}" alt="" loading="lazy"></span>` : `<img src="${item.image}" alt="" loading="lazy">`) : `<span class="result-symbol">${icon('spark')}</span>`}<span><small>${item.type === 'tools' ? 'THE WORKSHOP' : item.type.toUpperCase()}</small><strong>${escapeHtml(item.name)}</strong><em>${escapeHtml(item.detail)}</em></span><b aria-hidden="true">↗</b></a>`).join('') : '<p class="store-empty">No matches yet. Try a broader term, such as “linen” or “chair”.</p>'
  }
  const openSearch = () => { paintSearch(); if (!search.open) search.showModal(); document.querySelector('#global-search-input').focus() }
  const paintFinder = () => {
    const form = new FormData(document.querySelector('#material-finder-form'))
    const matches = findMaterialDirections(Object.fromEntries(form))
    const families = [...new Map(matches.map(item => [item.group, item])).values()]
    const edit = [...families, ...matches.filter(item => !families.includes(item))].slice(0,6)
    document.querySelector('#finder-result-note').textContent = `${matches.length} matching directions${state.swatches.length >= 8 ? ' · Your swatch book is full; remove one to save another.' : ''}`
    document.querySelector('#finder-results').innerHTML = matches.length ? edit.map(item => `<article class="finder-result"><a class="discovery-sample ${item.preserveTextureColor ? 'original' : ''}" style="--discovery-color:${item.color}" href="/ai-studio.html?material=${item.id}"><img src="${item.image}" alt="${escapeHtml(item.imageAlt || item.name)}" loading="lazy"></a><div><small>${escapeHtml(item.group)} / ${escapeHtml(item.shade)}</small><h3>${escapeHtml(item.name)}</h3><p>${escapeHtml(item.feel)}</p><button class="text-link" type="button" data-save-swatch="${item.id}" ${state.swatches.includes(item.id) || state.swatches.length >= 8 ? 'disabled' : ''}>${state.swatches.includes(item.id) ? 'Saved to your book ✓' : '+ Save this direction'}</button></div></article>`).join('') : '<div class="store-empty"><h3>A different combination?</h3><p>Try another colour mood or open the surface filter to see more possibilities.</p><button type="button" class="text-link" data-reset-finder>Reset the finder ↗</button></div>'
  }
  const paintComparison = () => {
    const chosen = state.productCompare.map(id => shopProducts.find(item => item.id === id)).filter(Boolean)
    document.querySelector('#store-compare-tray').hidden = !chosen.length
    document.querySelector('[data-open-product-comparison]').disabled = chosen.length < 2
    document.querySelector('#product-compare-chips').innerHTML = chosen.map(item => `<button type="button" data-compare-product="${item.id}" aria-label="Remove ${escapeHtml(item.name)} from comparison">${escapeHtml(item.name)} ×</button>`).join('')
    document.querySelectorAll('[data-compare-product]').forEach(button => {
      const active = state.productCompare.includes(button.dataset.compareProduct)
      button.setAttribute('aria-pressed', String(active))
      const text = button.querySelector('span')
      if (text) text.textContent = active ? 'Comparing' : 'Compare'
    })
    document.querySelector('#product-comparison-content').innerHTML = `<div class="product-compare-grid">${chosen.map(item => `<article><img src="${item.image}" alt="Illustrative view of ${escapeHtml(item.name)}"><span class="spec-label">${escapeHtml(item.category)}</span><h3>${escapeHtml(item.name)}</h3><dl><div><dt>REFERENCE PRICE</dt><dd>${formatMoney(item.price)}</dd></div><div><dt>SURFACE</dt><dd>${escapeHtml(item.material)}</dd></div><div><dt>SUPPLIER</dt><dd>${escapeHtml(item.supplier)}</dd></div><div><dt>AVAILABILITY & DELIVERY</dt><dd>Confirm with the supplier</dd></div></dl><a class="button gold" href="${productUrl(item.id)}">Explore this piece ↗</a></article>`).join('')}</div><p class="quiet-caption">Illustrative images and reference prices. Confirm the exact specification, price and stock before ordering.</p>`
  }
  document.querySelector('#global-search-input').addEventListener('input', paintSearch, { signal })
  document.querySelector('#global-search-input').addEventListener('keydown', event => {
    const first = search.querySelector('.global-result')
    if (event.key === 'ArrowDown') { event.preventDefault(); first?.focus() }
    if (event.key === 'Enter' && first) { event.preventDefault(); first.click() }
  }, { signal })
  search.addEventListener('keydown', event => {
    if (!['ArrowDown','ArrowUp'].includes(event.key) || !event.target.closest('.global-result')) return
    const results = [...search.querySelectorAll('.global-result')]
    const index = results.indexOf(event.target.closest('.global-result'))
    event.preventDefault(); results[(index + (event.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length]?.focus()
  }, { signal })
  document.querySelector('#material-finder-form').addEventListener('change', paintFinder, { signal })
  document.querySelector('#material-finder-form').addEventListener('submit', event => event.preventDefault(), { signal })
  document.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault()
      if (!document.body.classList.contains('modal-open') && !finder.open && !comparison.open) openSearch()
    }
  }, { signal })
  root.addEventListener('click', async event => {
    if (event.target.closest('[data-open-search]')) openSearch()
    if (event.target.closest('[data-open-finder]')) { paintFinder(); finder.showModal() }
    if (event.target.closest('[data-close-native]')) event.target.closest('dialog').close()
    const selectedScope = event.target.closest('[data-search-scope]')
    if (selectedScope) {
      scope = selectedScope.dataset.searchScope
      search.querySelectorAll('[data-search-scope]').forEach(button => button.setAttribute('aria-pressed', String(button === selectedScope)))
      paintSearch()
    }
    if (event.target.closest('[data-reset-finder]')) { document.querySelector('#material-finder-form').reset(); paintFinder() }
    if (event.target.closest('[data-save-swatch]') && finder.open) { paintFinder(); (finder.querySelector('[data-save-swatch]:not([disabled])') || finder.querySelector('[data-close-native]')).focus({preventScroll:true}) }
    const compare = event.target.closest('[data-compare-product]')
    if (compare) {
      const id = compare.dataset.compareProduct
      if (!shopProducts.some(item => item.id === id)) return
      if (state.productCompare.includes(id)) state.productCompare = state.productCompare.filter(value => value !== id)
      else if (state.productCompare.length < 3) state.productCompare.push(id)
      else { notify('Compare up to three pieces. Remove one to make room.'); return }
      writeLocal('uw-product-comparison', state.productCompare); paintComparison()
    }
    if (event.target.closest('[data-clear-product-comparison]')) { state.productCompare = []; writeLocal('uw-product-comparison', []); paintComparison() }
    if (event.target.closest('[data-open-product-comparison]')) { paintComparison(); comparison.showModal() }
    const zoom = event.target.closest('[data-product-zoom]')
    if (zoom) { const active = zoom.classList.toggle('is-zoomed'); zoom.setAttribute('aria-pressed', String(active)); zoom.setAttribute('aria-label', active ? 'Show full illustrative product image' : 'Enlarge illustrative product image') }
    const share = event.target.closest('[data-copy-product]')
    if (share) {
      const url = new URL(productUrl(share.dataset.copyProduct), location.origin).href
      try { if (!navigator.clipboard) throw new Error('Clipboard unavailable'); await navigator.clipboard.writeText(url); notify('Product link copied.') }
      catch { const input = share.closest('.product-detail').querySelector('[data-share-link]'); input.hidden = false; input.value = url; input.focus(); input.select() }
    }
    if (event.target.closest('[data-retry-shopping]')) void retrySync?.()
    if (event.target.closest('[data-download-selection]')) {
      const summary = selectionDetails(state)
      if (!summary.lines.length) { notify('Add a piece to begin your selection.'); return }
      downloadText('uw-furniture-selection.txt', `UPHOLSTERY WAREHOUSE / MY FURNITURE SELECTION\n\n${summary.lines.map(line => `${line.quantity} × ${line.name}\nReference: ${formatMoney(line.unitPrice)} each / ${formatMoney(line.lineTotal)} total\n${shopProducts.find(item => item.id === line.id).sourceUrl}`).join('\n\n')}\n\nReference subtotal: ${formatMoney(summary.subtotal)}\n\nReference prices from 29 September 2026. Confirm exact specification, live price, availability and delivery with the supplier. This selection does not reserve stock.`)
      notify('Your furniture selection is downloaded.')
    }
  }, { signal })
  paintComparison(); paintRecentProducts()
  const requested = new URLSearchParams(location.search).get('product')
  if (requested && shopProducts.some(item => item.id === requested)) openProduct(requested)
}
