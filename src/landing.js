const nav = document.querySelector('.landing-nav')
const menu = document.querySelector('.landing-menu')

const progress = document.createElement('div')
progress.className = 'landing-progress'
document.body.append(progress)

const cursor = document.createElement('div')
cursor.className = 'landing-cursor'
document.body.append(cursor)

const revealItems = document.querySelectorAll('.landing-intro, .material-tile, .landing-lab, .landing-proof, .landing-contact')
revealItems.forEach((item) => item.classList.add('reveal-on-scroll'))

if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible')
        observer.unobserve(entry.target)
      }
    })
  }, { threshold: 0.16 })
  revealItems.forEach((item) => observer.observe(item))
} else {
  revealItems.forEach((item) => item.classList.add('is-visible'))
}

menu?.addEventListener('click', () => {
  const open = nav.classList.toggle('is-open')
  menu.setAttribute('aria-expanded', String(open))
})

document.querySelectorAll('.landing-nav a').forEach((link) => {
  link.addEventListener('click', () => {
    nav.classList.remove('is-open')
    menu?.setAttribute('aria-expanded', 'false')
  })
})

document.querySelectorAll('.landing-swatch').forEach((swatch) => {
  swatch.addEventListener('click', () => {
    document.querySelectorAll('.landing-swatch').forEach((item) => item.classList.remove('active'))
    swatch.classList.add('active')
    document.querySelector('#landing-material-name').textContent = swatch.dataset.name.toUpperCase()
    document.querySelector('#landing-sofa').style.setProperty('--landing-color', swatch.dataset.color)
  })

  document.querySelectorAll('.material-tile').forEach((tile) => {
    tile.addEventListener('pointermove', (event) => {
      const bounds = tile.getBoundingClientRect()
      const x = (event.clientX - bounds.left) / bounds.width - 0.5
      const y = (event.clientY - bounds.top) / bounds.height - 0.5
      tile.style.setProperty('--tilt-x', `${y * -7}deg`)
      tile.style.setProperty('--tilt-y', `${x * 7}deg`)
    })
    tile.addEventListener('pointerleave', () => {
      tile.style.setProperty('--tilt-x', '0deg')
      tile.style.setProperty('--tilt-y', '0deg')
    })
  })
})

const scene = document.querySelector('.landing-scene')
const sofa = document.querySelector('#landing-sofa')
let pointerDown = false
let lastX = 0
let rotation = -8

scene?.addEventListener('pointerdown', (event) => {
  pointerDown = true
  lastX = event.clientX
  scene.setPointerCapture(event.pointerId)
})

scene?.addEventListener('pointermove', (event) => {
  if (!pointerDown) return
  rotation += (event.clientX - lastX) * 0.35
  lastX = event.clientX
  sofa.style.setProperty('--landing-rotation', `${rotation}deg`)
})

scene?.addEventListener('pointerup', () => { pointerDown = false })
scene?.addEventListener('pointercancel', () => { pointerDown = false })

let frame = 0
let targetRotation = rotation
let heroMedia = document.querySelector('.landing-hero-media')
window.addEventListener('pointermove', (event) => {
  cursor.style.setProperty('--cursor-x', `${event.clientX}px`)
  cursor.style.setProperty('--cursor-y', `${event.clientY}px`)
  if (!pointerDown) targetRotation = -8 + (event.clientX / window.innerWidth - 0.5) * 12
  if (heroMedia) {
    heroMedia.style.setProperty('--hero-x', `${(event.clientX / window.innerWidth - 0.5) * -14}px`)
    heroMedia.style.setProperty('--hero-y', `${(event.clientY / window.innerHeight - 0.5) * -10}px`)
  }
})

const animateScene = () => {
  if (!pointerDown) {
    rotation += (targetRotation - rotation) * 0.045
    sofa?.style.setProperty('--landing-rotation', `${rotation}deg`)
  }
  frame = requestAnimationFrame(animateScene)
}
frame = requestAnimationFrame(animateScene)

window.addEventListener('scroll', () => {
  const scrollable = document.documentElement.scrollHeight - window.innerHeight
  progress.style.setProperty('--progress', `${scrollable > 0 ? window.scrollY / scrollable : 0}`)
  nav.classList.toggle('is-scrolled', window.scrollY > 24)
}, { passive: true })

document.querySelectorAll('a, button, .material-tile').forEach((element) => {
  element.addEventListener('mouseenter', () => cursor.classList.add('is-hovering'))
  element.addEventListener('mouseleave', () => cursor.classList.remove('is-hovering'))
})
