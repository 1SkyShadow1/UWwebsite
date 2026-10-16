export function bindOverlays({ signal }) {
  const overlays = [...document.querySelectorAll('.swatch-drawer, .shop-cart-drawer, .shop-modal')]
  let previousFocus
  let current
  const refresh = () => {
    const active = overlays.find(element => element.getAttribute('aria-hidden') === 'false')
    if (active && active !== current && !current) previousFocus = document.activeElement
    overlays.forEach(element => { element.inert = element !== active })
    document.querySelectorAll('#main-content, .site-header, .site-footer, .mobile-dock, .comparison-tray, .store-compare-tray').forEach(element => { element.inert = Boolean(active) })
    document.body.classList.toggle('modal-open', Boolean(active))
    if (active !== current) {
      if (active) {
        const first = active.querySelector('button, a[href], input')
        first?.focus()
      } else previousFocus?.isConnected && previousFocus.focus()
      current = active
    }
  }
  const observer = new MutationObserver(refresh)
  overlays.forEach(element => observer.observe(element, { attributes: true, attributeFilter: ['aria-hidden'] }))
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      current?.querySelector('[data-action="close-swatches"], [data-close-cart], [data-close-shop-modal]')?.click()
      const menu = document.querySelector('.site-nav.open')
      if (menu) document.querySelector('[data-action="menu"]')?.click()
    }
    if (event.key !== 'Tab' || !current) return
    const focusable = [...current.querySelectorAll('a[href], button:not([disabled]), input, select, textarea')].filter(element => element.getClientRects().length && !element.closest('[inert]'))
    const first = focusable[0], last = focusable.at(-1)
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
  }, { signal })
  signal.addEventListener('abort', () => { observer.disconnect(); document.body.classList.remove('modal-open') }, { once: true })
  refresh()
}
