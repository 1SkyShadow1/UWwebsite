// Served as a classic worker: the WASM loader uses importScripts.
importScripts('/vendor/mediapipe/vision_bundle.js')
const { FilesetResolver, InteractiveSegmenter } = vision
let segmenter
self.onmessage = async ({ data }) => {
  const { id, bitmap, point } = data
  try {
    if (!segmenter) {
      const fileset = await FilesetResolver.forVisionTasks('/vendor/mediapipe')
      segmenter = await InteractiveSegmenter.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: '/models/magic-touch.tflite', delegate: 'CPU' },
        outputConfidenceMasks: true, outputCategoryMask: false,
      })
    }
    const result = segmenter.segment(bitmap, { keypoint: point })
    // Support both a foreground-only task result and a two-channel result.
    const mask = result.confidenceMasks?.[1] || result.confidenceMasks?.[0]
    if (!mask) throw new Error('The selection model returned no mask.')
    const values = new Float32Array(mask.getAsFloat32Array())
    self.postMessage({ id, width:mask.width, height:mask.height, values }, [values.buffer])
    result.close()
  } catch (error) { self.postMessage({ id, error: error.message || 'Selection failed' }) }
  finally { bitmap?.close() }
}
