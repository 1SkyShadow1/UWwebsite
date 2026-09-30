export function renderCatalogue({ state, shopProducts, shopCategories, shopProductCard, getVisibleShopProducts, furnitureCatalogueUrl }) {
  const visible = getVisibleShopProducts()
  const featured = shopProducts.filter(item => ['alessio-corner', 'diane-swivel', 'archer-dining', 'casablanca-lounger'].includes(item.id))

  return `<div class="shop-page">
    <section class="shop-hero">
      <img src="/assets/store/surreal-showroom.png" alt="Sculptural furniture in a dark glass pavilion at sunset">
      <div class="shop-hero-wash"></div>
      <div class="shop-hero-copy">
        <p class="shop-eyebrow"><span></span> THE NEW FURNITURE EDIT</p>
        <h1>Objects for a<br><em>beautifully unreal</em> life.</h1>
        <p>A considered shop of modern sofas, dining pieces, bedroom furniture and outdoor forms. Explore locally, then confirm live finish and availability with the supplier.</p>
        <div class="shop-hero-actions"><a class="shop-primary" href="#shop-collection">Shop the collection <span>↓</span></a><a class="shop-ghost" href="${furnitureCatalogueUrl}" target="_blank" rel="noreferrer">Explore the Hertex catalogue <span>↗</span></a></div>
      </div>
      <div class="shop-hero-index"><span>01</span><p>ORIGINAL EDITORIAL VISUAL<br>GENERATED FOR THIS STORE</p></div>
      <div class="shop-hero-card"><span>THE CURATOR'S NOTE</span><strong>Soft forms.<br>Earthbound colour.<br>Useful beauty.</strong><small>JOHANNESBURG / 2026</small></div>
    </section>

    <section class="shop-marquee" aria-label="Store benefits"><div><span>CURATED BEST SELLERS</span><i>✦</i><span>PERSISTENT SHOPPING BAG</span><i>✦</i><span>LIVE SUPPLIER LINKS</span><i>✦</i><span>UPHOLSTERY EXPERTISE</span><i>✦</i><span>CURATED BEST SELLERS</span><i>✦</i></div></section>

    <section class="shop-edit">
      <div class="shop-section-head"><div><span>THE DESIGN EDIT / 01</span><h2>Four pieces.<br><em>Four moods.</em></h2></div><p>Start with the pieces shaping our current point of view: generous seating, quiet curves, grounded timber and outdoor forms that feel at home indoors.</p></div>
      <div class="shop-feature-grid">${featured.map((item, index) => `<article class="shop-feature-card shop-feature-${index + 1}"><button type="button" data-quick-view="${item.id}" aria-label="Quick view ${item.name}"><img src="${item.image}" alt="AI reconstruction of ${item.name}" loading="lazy"><span>${String(index + 1).padStart(2, '0')} / ${item.category.toUpperCase()}</span><strong>${item.name}</strong><small>R ${item.price.toLocaleString('en-ZA')}</small></button></article>`).join('')}</div>
    </section>

    <section class="shop-collection" id="shop-collection">
      <div class="shop-section-head collection-head"><div><span>THE FULL COLLECTION / 02</span><h2>Find your<br><em>future favourite.</em></h2></div><p>Prices were checked against the Hertex HAUS catalogue on 29 September 2026. Each product has its own reference-guided AI reconstruction. Small details may differ; check the supplier photos, finish and stock before ordering.</p></div>

      <div class="shop-category-rail" role="group" aria-label="Furniture categories">
        ${['All furniture', ...shopCategories].map((category, index) => { const value = index === 0 ? 'all' : category; const count = index === 0 ? shopProducts.length : shopProducts.filter(item => item.category === category).length; return `<button type="button" data-shop-category="${value}" aria-pressed="${state.shopCategory === value}"><span>${category}</span><small>${String(count).padStart(2, '0')}</small></button>` }).join('')}
      </div>

      <div class="shop-toolbar">
        <label class="shop-search"><span aria-hidden="true">⌕</span><input id="shop-search" type="search" value="${state.shopQuery}" placeholder="Search sofas, tables, outdoor…" autocomplete="off"><small>SEARCH</small></label>
        <label><span>PRICE</span><select id="shop-price"><option value="all" ${state.shopPrice === 'all' ? 'selected' : ''}>All prices</option><option value="under5000" ${state.shopPrice === 'under5000' ? 'selected' : ''}>Under R 5,000</option><option value="5000-10000" ${state.shopPrice === '5000-10000' ? 'selected' : ''}>R 5,000–10,000</option><option value="over10000" ${state.shopPrice === 'over10000' ? 'selected' : ''}>R 10,000+</option></select></label>
        <label><span>SORT</span><select id="shop-sort"><option value="featured" ${state.shopSort === 'featured' ? 'selected' : ''}>Featured</option><option value="price-low" ${state.shopSort === 'price-low' ? 'selected' : ''}>Price: low to high</option><option value="price-high" ${state.shopSort === 'price-high' ? 'selected' : ''}>Price: high to low</option><option value="name" ${state.shopSort === 'name' ? 'selected' : ''}>Name</option></select></label>
        <div class="shop-result-meta"><strong id="shop-count">${visible.length}</strong><span>PIECES FOUND</span><button type="button" data-reset-shop>RESET</button></div>
      </div>

      <div class="shop-product-grid" id="shop-results" aria-live="polite">${visible.map(shopProductCard).join('') || '<p class="shop-empty">Nothing matches that combination. Reset the filters and keep exploring.</p>'}</div>
      <div class="shop-catalogue-bridge"><span>LIVE SUPPLIER CATALOGUE</span><h2>Still looking for<br><em>the impossible piece?</em></h2><p>The full supplier collection extends beyond this edit. Browse every current listing, then bring the piece back to us for upholstery advice, material pairing or a project conversation.</p><a href="${furnitureCatalogueUrl}" target="_blank" rel="noreferrer">Open the complete Hertex catalogue <span>↗</span></a></div>
    </section>

    <section class="shop-service-band"><div><span>01</span><h3>Browse with confidence</h3><p>Search, sort, shortlist and build a persistent bag across visits.</p></div><div><span>02</span><h3>Confirm the exact piece</h3><p>Every item links to its live supplier page for finishes and availability.</p></div><div><span>03</span><h3>Make it personal</h3><p>Pair the form with our material library or discuss upholstery with the workshop.</p></div></section>
  </div>`
}
