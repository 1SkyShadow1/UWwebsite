// Served as a classic worker: the WASM loader uses importScripts.
import { chooseConsistentMasks } from './selection.js'
import { furnitureAnchor } from './section-detection.js'
importScripts('/vendor/mediapipe/vision_bundle.js')
const { FilesetResolver, InteractiveSegmenter, ObjectDetector } = vision
let segmenterPromise,detectorPromise
const getDetector=()=>detectorPromise ||= (async()=>ObjectDetector.createFromOptions(await FilesetResolver.forVisionTasks('/vendor/mediapipe'),{baseOptions:{modelAssetPath:'/models/furniture-detector.tflite',delegate:'CPU'},runningMode:'IMAGE',categoryAllowlist:['chair','couch','bed'],scoreThreshold:.35,maxResults:5}))().catch(error=>{detectorPromise=null;throw error})

async function getSegmenter() {
  if (!segmenterPromise) {
    segmenterPromise = (async () => {
      const fileset = await FilesetResolver.forVisionTasks('/vendor/mediapipe')
      return InteractiveSegmenter.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: '/models/magic-touch.tflite', delegate: 'CPU' },
        outputConfidenceMasks: true,
        outputCategoryMask: false,
      })
    })().catch(err => {
      segmenterPromise = null
      throw err
    })
  }
  return segmenterPromise
}

function sampleNeighborhood(arr, width, height, nx, ny) {
  const cx = Math.min(width - 1, Math.max(0, Math.round(nx * (width - 1))))
  const cy = Math.min(height - 1, Math.max(0, Math.round(ny * (height - 1))))
  let sum = 0
  let count = 0
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const x = Math.min(width - 1, Math.max(0, cx + dx))
      const y = Math.min(height - 1, Math.max(0, cy + dy))
      sum += arr[y * width + x]
      count++
    }
  }
  return count ? sum / count : 0
}

self.onmessage = async ({ data }) => {
  const { id, bitmap, point, automatic } = data
  try {
    const segmenter = await getSegmenter()
    const anchor=automatic?furnitureAnchor((await getDetector()).detect(bitmap).detections,bitmap.width,bitmap.height):null
    if(automatic&&!anchor)throw new Error('Furniture could not be confidently identified. Tap your piece or brush the upholstery; the room has not been selected.')
    const candidates=anchor?[[.5,.4],[.5,.68],[.3,.55],[.7,.55]].map(([x,y])=>({x:anchor.left+(anchor.right-anchor.left)*x,y:anchor.top+(anchor.bottom-anchor.top)*y})):[point]
    const results=[]
    for(const candidate of candidates){
    const result = segmenter.segment(bitmap, { keypoint: candidate })
    const masks = result.confidenceMasks || []
    if (!masks.length) throw new Error('The selection model returned no mask.')
    let chosen = masks[1] || masks[0]
    let chosenArr = chosen.getAsFloat32Array()
    if (masks.length >= 2 && masks[0] && masks[1]) {
      const arr0 = masks[0].getAsFloat32Array()
      const arr1 = masks[1].getAsFloat32Array()
      const score0 = sampleNeighborhood(arr0, masks[0].width, masks[0].height, candidate.x, candidate.y)
      const score1 = sampleNeighborhood(arr1, masks[1].width, masks[1].height, candidate.x, candidate.y)
      if (score0 > score1 + 0.1) {
        chosen = masks[0]
        chosenArr = arr0
      } else {
        chosen = masks[1]
        chosenArr = arr1
      }
    }
    const values = new Float32Array(chosenArr)
    const width = chosen.width
    const height = chosen.height
    result.close()
    results.push({width,height,values,point:candidate})
    }
    const best=chooseConsistentMasks(results)
    if(anchor)for(let y=0;y<best.height;y++)for(let x=0;x<best.width;x++)if((x+.5)/best.width<anchor.left||(x+.5)/best.width>anchor.right||(y+.5)/best.height<anchor.top||(y+.5)/best.height>anchor.bottom)best.values[y*best.width+x]=0
    self.postMessage({ id,...best }, [best.values.buffer])
  } catch (error) {
    self.postMessage({ id, error: error.message || 'Selection failed' })
  } finally {
    bitmap?.close()
  }
}

