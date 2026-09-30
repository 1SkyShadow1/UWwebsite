import * as THREE from 'three'

const textureCache = new Map()

function loadTexture(url) {
  if (!url) return null
  if (!textureCache.has(url)) {
    const loader = new THREE.TextureLoader()
    textureCache.set(url, loader.load(url))
  }
  return textureCache.get(url)
}

export function createMaterialPreview({ canvas, material, onStatus }) {
  if (!canvas) return { setMaterial() {}, resize() {}, dispose() {} }
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.15

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100)
  camera.position.set(0, 0.25, 4.9)
  camera.lookAt(0, 0.2, 0)
  scene.add(new THREE.HemisphereLight(0xffe5bd, 0x15181a, 2.1))
  const key = new THREE.DirectionalLight(0xffd38b, 3.4)
  key.position.set(-2, 4, 3)
  scene.add(key)
  const fill = new THREE.PointLight(0x789bbd, 1.1, 8)
  fill.position.set(2, 1, 2)
  scene.add(fill)

  const group = new THREE.Group()
  scene.add(group)
  const pieces = []
  const makePiece = (geometry, position, radius = 0.1) => {
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
      color: material.color,
      roughness: 0.72,
      metalness: 0.02,
      map: loadTexture(material.image),
      bumpScale: 0.06,
    }))
    mesh.position.copy(position)
    mesh.geometry.computeVertexNormals()
    group.add(mesh)
    pieces.push(mesh)
    return mesh
  }
  makePiece(new THREE.BoxGeometry(3.35, 0.95, 0.38), new THREE.Vector3(0, 0.85, -0.12))
  makePiece(new THREE.BoxGeometry(3.45, 0.28, 1.05), new THREE.Vector3(0, 0.24, 0.06))
  makePiece(new THREE.BoxGeometry(0.38, 1.32, 1.08), new THREE.Vector3(-1.58, 0.55, 0))
  makePiece(new THREE.BoxGeometry(0.38, 1.32, 1.08), new THREE.Vector3(1.58, 0.55, 0))
  const legMaterial = new THREE.MeshStandardMaterial({ color: 0x2b2925, roughness: 0.55 })
  for (const x of [-1.28, 1.28]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.65, 12), legMaterial)
    leg.position.set(x, -0.2, 0)
    group.add(leg)
  }

  let rotation = -0.18
  let targetRotation = rotation
  let frame = 0
  let disposed = false
  const resize = () => {
    const rect = canvas.parentElement?.getBoundingClientRect()
    if (!rect) return
    renderer.setSize(rect.width, rect.height, false)
    camera.aspect = rect.width / rect.height
    camera.updateProjectionMatrix()
  }
  const setMaterial = (nextMaterial) => {
    material = nextMaterial
    pieces.forEach((piece) => {
      piece.material.color.set(nextMaterial.color)
      piece.material.map = loadTexture(nextMaterial.image)
      piece.material.needsUpdate = true
      piece.material.roughness = nextMaterial.id === 'leather' ? 0.45 : nextMaterial.id === 'velvet' ? 0.62 : 0.78
    })
    onStatus?.(`Three.js PBR surface: ${nextMaterial.name}`)
  }
  const animate = () => {
    if (disposed) return
    rotation += (targetRotation - rotation) * 0.08
    group.rotation.y = rotation
    group.position.y = Math.sin(performance.now() * 0.0012) * 0.025
    renderer.render(scene, camera)
    frame = requestAnimationFrame(animate)
  }
  const pointerMove = (event) => {
    if (event.buttons) targetRotation += event.movementX * 0.006
  }
  canvas.addEventListener('pointermove', pointerMove)
  window.addEventListener('resize', resize)
  resize()
  setMaterial(material)
  animate()
  return {
    setMaterial,
    resize,
    dispose() {
      disposed = true
      cancelAnimationFrame(frame)
      canvas.removeEventListener('pointermove', pointerMove)
      window.removeEventListener('resize', resize)
      renderer.dispose()
      pieces.forEach(piece => piece.geometry.dispose())
    },
  }
}

export async function loadEightWallRuntime({ scriptUrl, onReady, onError } = {}) {
  if (window.XR8) {
    configureEightWall(window.XR8, onReady)
    return window.XR8
  }
  const existingScript = document.querySelector('script[data-xr-engine]')
  const runtimeUrl = scriptUrl || existingScript?.src
  if (!runtimeUrl) {
    onError?.('8th Wall runtime is not configured; using the Three.js camera fallback.')
    return null
  }
  try {
    await new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error('8th Wall runtime timed out; using the Three.js fallback.')), 10000)
      const ready = () => {
        window.clearTimeout(timeout)
        resolve()
      }
      window.addEventListener('xrloaded', ready, { once: true })
      if (!existingScript) {
        const script = document.createElement('script')
        script.src = runtimeUrl
        script.async = true
        script.crossOrigin = 'anonymous'
        script.dataset.preloadChunks = `slam: ${import.meta.env.VITE_EIGHTH_WALL_SLAM_URL || 'https://cdn.jsdelivr.net/npm/@8thwall/engine-binary@1/dist/xr-slam.js'}`
        script.onload = () => window.XR8 && ready()
        script.onerror = () => reject(new Error('8th Wall runtime failed to load.'))
        document.head.appendChild(script)
      }
    })
    if (!window.XR8) throw new Error('8th Wall loaded without exposing XR8.')
    configureEightWall(window.XR8, onReady)
    return window.XR8
  } catch (error) {
    onError?.(error.message)
    return null
  }
}

function configureEightWall(XR8, onReady) {
  try {
    XR8.XrController?.configure?.({ disableWorldTracking: false })
    onReady?.(XR8)
  } catch (error) {
    onReady?.(XR8)
  }
}

export function startEightWallSession({ XR8, canvas, onStatus, onError } = {}) {
  if (!XR8?.run || !canvas) return false
  try {
    const modules = [
      XR8.GlTextureRenderer?.pipelineModule?.(),
      XR8.XrController?.pipelineModule?.(),
    ].filter(Boolean)
    if (modules.length) XR8.addCameraPipelineModules(modules)
    XR8.run({
      canvas,
      allowedDevices: XR8.XrConfig?.device?.().ANY,
    })
    onStatus?.('8th Wall world tracking is live. Move slowly around the furniture.')
    return true
  } catch (error) {
    onError?.(error.message || '8th Wall could not start on this device.')
    return false
  }
}
