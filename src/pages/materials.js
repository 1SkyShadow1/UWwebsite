export function renderMaterials({ materials, state, materialGroups, materialUses, materialCard }) {
  const matches = material => (
    (state.filter === 'all' || material.group === state.filter) &&
    (state.useFilter === 'all' || material.tags.includes(state.useFilter)) &&
    `${material.name} ${material.type} ${material.group} ${material.shade} ${material.feel} ${material.use} ${material.care} ${material.style} ${material.supplier || ''} ${material.sourceLabel || ''} ${material.tags.join(' ')}`
      .toLowerCase()
      .includes(state.query.trim().toLowerCase())
  )
  const visible = materials.filter(matches)
  const families = ['All swatches', ...materialGroups]

  return `<section class="swatchbook-hero">
    <div class="swatchbook-copy"><p class="spec-label gold-text">THE UPHOLSTERY WAREHOUSE TEXTILE ROOM</p><h1>Find your<br><strong>new favourite feel.</strong></h1><p>${materials.length} material directions, from velvet pile and woven wool to outdoor, marine and technical surfaces. Turn every swatch to reveal its character, uses and care questions.</p><div class="swatchbook-stats"><span><b>${materials.length}</b> TEXTILE DIRECTIONS</span><span><b>${materialGroups.length}</b> SURFACE FAMILIES</span><span><b>8</b> SHORTLIST SLOTS</span></div></div>
    <div class="swatchbook-hero-swatch" aria-hidden="true"><img src="/assets/stitch/stitch-boucle.png" alt=""><span>TOUCH / TURN / COMPARE</span><b>THE<br>TEXTILE<br>ROOM</b><i>UW / MATERIAL STUDY</i></div>
  </section>
  <section class="swatchbook-intro"><div><span class="swatchbook-kicker">01 / OPEN THE FOLIO</span><h2>A closer look.<br><strong>A different feel.</strong></h2><a class="text-link" href="/ai-studio.html">Try a surface on your furniture ↗</a></div><p>Explore photographed CC0 textures and clearly labelled illustrative material studies. Every card opens directly in AI Studio. Supplier collection links offer further inspiration; exact colourways, fibres and performance require a physical sample.</p></section>
  <section class="material-compass" aria-label="Curated material paths"><button type="button" data-family-filter="Loops & texture"><span>01</span><small>SOFT SCULPTURE</small><strong>Bouclé, fleece & loops</strong><i>Explore tactile surfaces ↗</i></button><button type="button" data-family-filter="Natural fibres"><span>02</span><small>NATURAL CHARACTER</small><strong>Wool, cotton & alpaca</strong><i>Explore honest fibres ↗</i></button><button type="button" data-family-filter="Technical"><span>03</span><small>HARDWORKING SURFACES</small><strong>Contract & specialist cloth</strong><i>Explore technical textiles ↗</i></button></section>
  <section class="swatchbook-library" aria-label="Browse upholstery swatches">
    <div class="swatchbook-tools">
      <label class="material-search"><span>Search feel, fibre, colour or use</span><input id="material-search" type="search" value="${state.query}" placeholder="Try nubby, natural, woven…" autocomplete="off"></label>
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
