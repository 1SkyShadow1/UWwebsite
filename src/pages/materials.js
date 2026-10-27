import { escapeHtml } from '../lib/html.js'
import { normaliseSearch } from '../data/discovery.js'
import { showroomPhotoLink } from '../features/showroom-photos.js'

export function renderMaterials({ materials, state, materialGroups, materialUses, materialCard }) {
  const matches = material => (
    (state.filter === 'all' || material.group === state.filter) &&
    (state.useFilter === 'all' || material.tags.includes(state.useFilter)) &&
    normaliseSearch(`${material.name} ${material.type} ${material.group} ${material.shade} ${material.feel} ${material.use} ${material.care} ${material.style} ${material.supplier || ''} ${material.sourceLabel || ''} ${material.tags.join(' ')}`).includes(normaliseSearch(state.query))
  )
  const visible = materials.filter(matches)
  const families = ['All swatches', ...materialGroups]

  return `<section class="swatchbook-hero">
    <div class="swatchbook-copy"><p class="spec-label gold-text">THE TEXTILE ROOM</p><h1>Find your<br><em>favourite feeling.</em></h1><p>Velvet that catches the light. Linen with a little character. A weave that feels like home. Explore ${materials.length} material directions and find the ones that speak to you.</p><div class="swatchbook-stats"><span><b>${materials.length}</b> MATERIAL DIRECTIONS</span><span><b>${materialGroups.length}</b> SURFACE FAMILIES</span><span><b>3</b> TO COMPARE SIDE BY SIDE</span></div></div>
    <div class="swatchbook-showroom">${showroomPhotoLink('inside',{caption:'The real textile room / look inside',sizes:'(max-width:700px) 92vw, 46vw',loading:'eager'})}<span class="showroom-print-note">Start with a swatch. Finish with a feeling.</span></div>
  </section>
  <section class="swatchbook-intro"><div><span class="swatchbook-kicker">01 / GET A LITTLE CLOSER</span><h2>A different texture.<br><em>A different story.</em></h2><button class="text-link" type="button" data-open-finder>Help me find my fabric ↗</button></div><p>Turn a swatch to discover its feel, uses and care. Save up to eight favourites, or compare three side by side. These photographed textures and illustrative studies are a starting point; always confirm an exact physical sample.</p></section>
  <section class="material-compass" aria-label="Curated material paths"><button type="button" data-family-filter="Loops & texture"><span>01</span><small>SOFT SCULPTURE</small><strong>Bouclé, fleece & loops</strong><i>Explore tactile surfaces ↗</i></button><button type="button" data-family-filter="Natural fibres"><span>02</span><small>NATURAL CHARACTER</small><strong>Wool, cotton & alpaca</strong><i>Explore honest fibres ↗</i></button><button type="button" data-family-filter="Technical"><span>03</span><small>HARDWORKING SURFACES</small><strong>Contract & specialist cloth</strong><i>Explore technical textiles ↗</i></button></section>
  <section class="swatchbook-library" aria-label="Browse upholstery swatches">
    <div class="swatchbook-tools">
      <label class="material-search"><span>Search feel, fibre, colour or use</span><input id="material-search" type="search" value="${escapeHtml(state.query)}" placeholder="Try nubby, natural, woven…" autocomplete="off"></label>
      <label class="material-filter"><span>Project setting</span><select id="material-use-filter">${materialUses.map(([value,label]) => `<option value="${value}" ${state.useFilter === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
      <span class="swatch-results-count" id="material-count">${visible.length} OF ${materials.length} DIRECTIONS</span>
      <button class="collection-reset" type="button" data-reset-material-filters>Reset filters</button>
    </div>
    <div class="swatch-family-rail" role="group" aria-label="Filter by surface family">${families.map((family,index) => { const value = index === 0 ? 'all' : family; return `<button type="button" data-family-filter="${value}" aria-pressed="${state.filter === value}">${family}<span>${index === 0 ? materials.length : materials.filter(item => item.group === family).length}</span></button>` }).join('')}</div>
    <div class="swatch-grid" id="material-results" aria-live="polite">${visible.map(materialCard).join('') || '<p class="empty-results">No swatches fit that brief. Try a broader filter or reset your filters.</p>'}</div>
    <div class="swatchbook-footnote"><span>SCREEN COLOUR IS A STARTING POINT</span><p>Light, screens and fabric batches all change appearance. Ask to see the exact fabric cutting before confirming a project.</p></div>
  </section>
  <section class="section swatchbook-guide"><div><span class="swatchbook-kicker">02 / CHOOSE WITH CONTEXT</span><h2>Feel it. Test it.<br><strong>Then decide.</strong></h2></div><div class="swatchbook-guide-copy"><p>Upholstery suitability comes from the full specification—not the fibre name alone. Weave, backing, finish, cleaning code, test method and the way a piece is used all matter.</p><div><a href="/estimator.html">Build a project brief ↗</a><a href="/profile.html">Open your saved swatches ↗</a></div></div></section>`
}
