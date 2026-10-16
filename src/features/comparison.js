import { escapeHtml } from '../lib/html.js'

export function comparisonMarkup(materials, ids) {
  const selected = ids.map(id => materials.find(item => item.id === id)).filter(Boolean)
  return `<div class="comparison-heading"><div><p class="spec-label">SIDE BY SIDE, WITH CONTEXT</p><h2>Find your kind of feel.</h2><p>Surface studies are indicative. Confirm an exact physical sample.</p></div><button type="button" data-close-comparison aria-label="Close material comparison">×</button></div><div class="material-comparison">${selected.map(item => `<article><img src="${item.image}" alt="${escapeHtml(item.imageAlt)}"><p class="spec-label">${item.group} / ${item.shade}</p><h3>${item.name}</h3><dl><div><dt>THE FEEL</dt><dd>${item.feel}</dd></div><div><dt>EXPLORE FOR</dt><dd>${item.use}</dd></div><div><dt>CARE</dt><dd>${item.care}</dd></div><div><dt>ASK BEFORE CHOOSING</dt><dd>${item.caution}</dd></div></dl><a class="button gold" href="/ai-studio.html?material=${item.id}">Try this surface ↗</a></article>`).join('')}</div>`
}

export function bindComparison({ materials, state, notify, signal }) {
  const dialog = document.querySelector('#comparison-dialog')
  const tray = document.querySelector('#comparison-tray')
  const update = () => {
    document.querySelectorAll('[data-compare-material]').forEach(button => {
      const selected = state.compare.includes(button.dataset.compareMaterial)
      button.setAttribute('aria-pressed', String(selected))
      button.classList.toggle('selected', selected)
      button.textContent = selected ? 'Compare ✓' : 'Compare +'
    })
    tray.hidden = state.compare.length === 0
    tray.querySelector('[data-compare-count]').textContent = String(state.compare.length)
    tray.querySelector('[data-open-comparison]').disabled = state.compare.length < 2
    tray.querySelector('.comparison-chips').innerHTML = state.compare.map(id => {
      const item = materials.find(material => material.id === id)
      return `<button type="button" data-compare-material="${id}" aria-label="Remove ${item.name} from comparison"><span style="background:${item.color}"></span>${item.name} ×</button>`
    }).join('')
  }
  document.querySelector('#app').addEventListener('click', event => {
    const toggle = event.target.closest('[data-compare-material]')
    if (toggle) {
      const id = toggle.dataset.compareMaterial
      if (state.compare.includes(id)) state.compare = state.compare.filter(item => item !== id)
      else if (state.compare.length < 3) state.compare.push(id)
      else { notify('Choose up to three materials. Remove one to make space.'); return }
      update()
    }
    if (event.target.closest('[data-clear-comparison]')) { state.compare = []; update() }
    if (event.target.closest('[data-open-comparison]') && state.compare.length >= 2) {
      dialog.innerHTML = comparisonMarkup(materials, state.compare)
      dialog.showModal()
    }
    if (event.target.closest('[data-close-comparison]')) dialog.close()
  }, { signal })
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close() }, { signal })
  update()
}
