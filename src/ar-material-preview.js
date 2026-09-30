import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { buildTintedPatternCanvas } from './studio/controller.js'

const textureCache = new Map()

function loadTexture(url, isColor = false) {
  if (!url) return null
  const key = `${url}:${isColor ? 'srgb' : 'linear'}`
  if (!textureCache.has(key)) {
    const loader = new THREE.TextureLoader()
    const tex = loader.load(url)
    if (isColor) tex.colorSpace = THREE.SRGBColorSpace
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    tex.repeat.set(3, 3)
    textureCache.set(key, tex)
  }
  return textureCache.get(key)
}

export function createMaterialPreview({ canvas, material, onStatus }) {
  if (!canvas) return { setMaterial() {}, resize() {}, dispose() {} }
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.2

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100)
  camera.position.set(0, 0.45, 5.1)
  camera.lookAt(0, 0.25, 0)
  scene.add(new THREE.HemisphereLight(0xfff0d9, 0x15181a, 2.3))
  const key = new THREE.DirectionalLight(0xffefdb, 3.6)
  key.position.set(-2.5, 4, 3)
  scene.add(key)
  const fill = new THREE.PointLight(0x9bc0d9, 1.4, 9)
  fill.position.set(2.5, 1.5, 2)
  scene.add(fill)

  const clothMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.78,
    metalness: 0.0,
    sheen: 0.35,
    sheenColor: 0xffffff,
    sheenRoughness: 0.68,
  })

  const group = new THREE.Group()
  scene.add(group)
  const pieces = []
  const makePiece = (w, h, d, x, y, z, r = 0.12) => {
    const mesh = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, r), clothMaterial)
    mesh.position.set(x, y, z)
    group.add(mesh)
    pieces.push(mesh)
    return mesh
  }
  makePiece(3.1, 0.38, 1.12, 0, 0.12, 0, 0.12)
  makePiece(2.96, 0.86, 0.32, 0, 0.72, -0.4, 0.12)
  makePiece(0.34, 0.78, 1.14, -1.42, 0.42, 0, 0.12)
  makePiece(0.34, 0.78, 1.14, 1.42, 0.42, 0, 0.12)
  for (const x of [-0.62, 0.62]) {
    makePiece(1.2, 0.24, 0.9, x, 0.42, 0.06, 0.09)
    makePiece(1.2, 0.56, 0.24, x, 0.8, -0.22, 0.1)
  }
  const legMaterial = new THREE.MeshStandardMaterial({ color: 0x3b3127, roughness: 0.5 })
  for (const x of [-1.22, 1.22]) {
    for (const z of [-0.36, 0.36]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.045, 0.34, 12), legMaterial)
      leg.position.set(x, -0.22, z)
      group.add(leg)
      pieces.push(leg)
    }
  }

  let rotation = -0.18
  let targetRotation = rotation
  let frame = 0
  let disposed = false
  let activeTintedTex = null
  let matVersion = 0
  const resize = () => {
    const rect = canvas.parentElement?.getBoundingClientRect()
    if (!rect || !rect.width || !rect.height) return
    renderer.setSize(rect.width, rect.height, false)
    camera.aspect = rect.width / rect.height
    camera.updateProjectionMatrix()
  }
  const setMaterial = async (nextMaterial) => {
    if (!nextMaterial) return
    material = nextMaterial
    const token = ++matVersion
    const isVelvet = /velvet|velour|mohair|chenille|corduroy/i.test(`${nextMaterial.texture || ''} ${nextMaterial.name || ''}`)
    const isLeather = /leather|vinyl/i.test(`${nextMaterial.texture || ''} ${nextMaterial.name || ''}`)
    const isBoucle = /boucle|fleece|shearling|tweed/i.test(`${nextMaterial.texture || ''} ${nextMaterial.name || ''}`)

    clothMaterial.normalMap = loadTexture(nextMaterial.pbr?.normal, false)
    clothMaterial.roughnessMap = loadTexture(nextMaterial.pbr?.roughness, false)
    clothMaterial.normalScale.set(isBoucle ? 0.65 : 0.45, isBoucle ? 0.65 : 0.45)
    clothMaterial.roughness = clothMaterial.roughnessMap ? 1 : isLeather ? 0.48 : isVelvet ? 0.66 : 0.82
    clothMaterial.clearcoat = isLeather ? 0.14 : 0
    clothMaterial.sheen = isVelvet ? 0.62 : isBoucle ? 0.32 : 0.14
    clothMaterial.sheenColor.set(nextMaterial.preserveTextureColor ? 0xffffff : nextMaterial.color)

    const imgUrl = nextMaterial.textureImage || nextMaterial.image
    if (imgUrl && !nextMaterial.preserveTextureColor) {
      try {
        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.src = imgUrl
        await img.decode()
        if (disposed || token !== matVersion) return
        const c = buildTintedPatternCanvas(img, 256, nextMaterial)
        const tinted = new THREE.CanvasTexture(c)
        tinted.colorSpace = THREE.SRGBColorSpace
        tinted.wrapS = tinted.wrapT = THREE.RepeatWrapping
        tinted.repeat.set(3, 3)
        activeTintedTex?.dispose()
        activeTintedTex = tinted
        clothMaterial.map = tinted
        clothMaterial.color.set(0xffffff)
      } catch {
        clothMaterial.map = loadTexture(imgUrl, true)
        clothMaterial.color.set(nextMaterial.color)
      }
    } else {
      clothMaterial.map = loadTexture(imgUrl, true)
      clothMaterial.color.set(0xffffff)
    }
    clothMaterial.needsUpdate = true
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
      activeTintedTex?.dispose()
      clothMaterial.dispose()
      legMaterial.dispose()
      renderer.dispose()
      pieces.forEach(piece => piece.geometry.dispose())
    },
  }
}

export async function loadEightWallRuntime({ scriptUrl, onReady, onError } = {}) {
  if (window.XR8) {
    if (!window.XR8.XrController && window.XR8.loadChunk) {
      await window.XR8.loadChunk('slam').catch(() => {})
    }
    configureEightWall(window.XR8, onReady)
    return window.XR8
  }
  const existingScript = document.querySelector('script[data-xr-engine]')
  const sanitizedScriptUrl = scriptUrl && !/ngrok|58000/i.test(scriptUrl) ? scriptUrl.trim() : ''
  const runtimeUrl = sanitizedScriptUrl || existingScript?.getAttribute('src') || '/vendor/8thwall/xr.js'
  const rawSlamUrl = (import.meta.env?.VITE_EIGHTH_WALL_SLAM_URL || '').trim()
  const slamSpec = rawSlamUrl && !/ngrok|58000/i.test(rawSlamUrl) ? `slam: ${rawSlamUrl}` : 'slam'
  try {
    await new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error('8th Wall runtime timed out; using the Three.js fallback.')), 12000)
      const ready = () => {
        window.clearTimeout(timeout)
        window.removeEventListener('xrloaded', ready)
        window.removeEventListener('XRloaded', ready)
        resolve()
      }
      window.addEventListener('xrloaded', ready, { once: true })
      window.addEventListener('XRloaded', ready, { once: true })
      if (!existingScript) {
        const script = document.createElement('script')
        script.src = runtimeUrl
        script.async = true
        script.crossOrigin = 'anonymous'
        script.dataset.xrEngine = 'true'
        script.dataset.preloadChunks = slamSpec
        script.onload = () => window.XR8 && ready()
        script.onerror = () => {
          window.clearTimeout(timeout)
          reject(new Error('8th Wall runtime failed to load.'))
        }
        document.head.appendChild(script)
      } else if (window.XR8) {
        ready()
      }
    })
    if (!window.XR8) throw new Error('8th Wall loaded without exposing XR8.')
    if (!window.XR8.XrController && window.XR8.loadChunk) {
      await window.XR8.loadChunk('slam').catch(() => {})
    }
    configureEightWall(window.XR8, onReady)
    return window.XR8
  } catch (error) {
    onError?.(error.message)
    return null
  }
}

function configureEightWall(XR8, onReady) {
  try {
    const isMobile = Boolean(XR8.XrDevice?.isDeviceBrowserCompatible?.({ allowedDevices: XR8.XrConfig?.device?.().MOBILE }))
    const hasCustomSlam = Boolean((import.meta.env?.VITE_EIGHTH_WALL_SLAM_URL || '').trim() && !/ngrok|58000/i.test(import.meta.env.VITE_EIGHTH_WALL_SLAM_URL))
    XR8.XrController?.configure?.({ disableWorldTracking: !isMobile || !hasCustomSlam, enableLighting: true })
    onReady?.(XR8)
  } catch (error) {
    onReady?.(XR8)
  }
}

export async function startEightWallSession({ XR8, canvas, onStatus, onError } = {}) {
  if (!XR8?.run || !canvas) return false
  const moduleName = 'uw-ar-session'
  const cleanup = () => {
    for (const mod of [moduleName, 'gltexturerenderer', 'reality']) {
      try { XR8.removeCameraPipelineModule?.(mod) } catch {}
    }
  }
  const ensureVideoPlaying = () => {
    queueMicrotask(() => {
      const video = canvas.parentElement?.querySelector('video:not(#camera-video)')
      if (!video) return
      video.muted = true
      video.playsInline = true
      video.setAttribute('playsinline', 'true')
      video.style.cssText = 'position:fixed;left:-10000px;top:0;width:2px;height:2px;opacity:0.01;pointer-events:none;display:block'
      video.play?.().catch(() => {})
    })
  }
  try {
    try { XR8.stop?.() } catch {}
    cleanup()
    const rect = canvas.parentElement?.getBoundingClientRect()
    canvas.width = Math.max(320, Math.round(rect?.width || 640))
    canvas.height = Math.max(240, Math.round(rect?.height || 480))
    const isMobile = Boolean(XR8.XrDevice?.isDeviceBrowserCompatible?.({ allowedDevices: XR8.XrConfig?.device?.().MOBILE }))
    configureEightWall(XR8)

    const started = await new Promise((resolve) => {
      let settled = false
      const timer = window.setTimeout(() => {
        if (settled) return
        settled = true
        onError?.('8th Wall camera timed out.')
        resolve(false)
      }, 12000)

      const finish = (ok, errMessage) => {
        if (settled) return
        settled = true
        window.clearTimeout(timer)
        if (!ok) {
          try { XR8.stop?.() } catch {}
          cleanup()
          if (errMessage) onError?.(errMessage)
        }
        resolve(ok)
      }

      const modules = [
        XR8.GlTextureRenderer?.pipelineModule?.(),
        XR8.XrController?.pipelineModule?.(),
        {
          name: moduleName,
          onStart: () => {
            ensureVideoPlaying()
            onStatus?.('8th Wall camera tracking is live. Move slowly around the furniture.')
            finish(true)
          },
          onCameraStatusChange: ({ status, reason }) => {
            if (status === 'requesting') {
              onStatus?.('8th Wall: requesting camera permission…')
            } else if (status === 'hasStream') {
              ensureVideoPlaying()
              onStatus?.('8th Wall: connecting live video stream…')
            } else if (status === 'hasVideo') {
              ensureVideoPlaying()
              onStatus?.('8th Wall camera tracking is live. Move slowly around the furniture.')
              finish(true)
            } else if (status === 'hasDesktop3D') {
              finish(false, '8th Wall desktop 3D fallback has no camera feed.')
            } else if (status === 'failed') {
              const msg = reason === 'DENY_CAMERA'
                ? 'Camera permission was denied.'
                : reason === 'NO_CAMERA'
                ? 'No camera device was detected.'
                : '8th Wall camera could not start.'
              finish(false, msg)
            }
          },
          onException: (error) => {
            finish(false, error?.message || '8th Wall could not start on this device.')
          },
        },
      ].filter(Boolean)

      XR8.addCameraPipelineModules(modules)
      const cameraDirection = isMobile
        ? (XR8.XrConfig?.camera?.().BACK || 'back')
        : (XR8.XrConfig?.camera?.().ANY || 'any')
      XR8.run({
        canvas,
        allowedDevices: XR8.XrConfig?.device?.().ANY || 'any',
        cameraConfig: { direction: cameraDirection },
      })
    })
    return started
  } catch (error) {
    onError?.(error.message || '8th Wall could not start on this device.')
    return false
  }
}
