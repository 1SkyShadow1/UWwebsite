// A masked, separable box filter keeps room pixels out of the lighting estimate.
// It suppresses fine source weave/print while retaining broad furniture shading.
export function buildIllumination(source, mask, radius = Math.max(2, Math.min(64, Math.round(Math.max(source.width, source.height) * .045)))) {
  const { width, height, data } = source
  const horizontal = new Float32Array(width * height)
  const weights = new Float32Array(width * height)
  const output = new Float32Array(width * height)
  const weight = p => mask ? Math.max(0, Math.min(1, mask[p])) : 1
  const luminance = p => data[p*4]*.2126 + data[p*4+1]*.7152 + data[p*4+2]*.0722
  for (let y = 0; y < height; y++) {
    let sum = 0, mass = 0
    for (let x = 0; x <= Math.min(radius, width-1); x++) { const p=y*width+x, w=weight(p); sum+=luminance(p)*w; mass+=w }
    for (let x = 0; x < width; x++) {
      const p=y*width+x; horizontal[p]=sum; weights[p]=mass
      if (x-radius>=0) { const q=y*width+x-radius, w=weight(q); sum-=luminance(q)*w; mass-=w }
      if (x+radius+1<width) { const q=y*width+x+radius+1, w=weight(q); sum+=luminance(q)*w; mass+=w }
    }
  }
  for (let x = 0; x < width; x++) {
    let sum = 0, mass = 0
    for (let y = 0; y <= Math.min(radius, height-1); y++) { const p=y*width+x; sum+=horizontal[p]; mass+=weights[p] }
    for (let y = 0; y < height; y++) {
      const p=y*width+x; output[p]=mass>.001 ? sum/mass : luminance(p)
      if (y-radius>=0) { const q=(y-radius)*width+x; sum-=horizontal[q]; mass-=weights[q] }
      if (y+radius+1<height) { const q=(y+radius+1)*width+x; sum+=horizontal[q]; mass+=weights[q] }
    }
  }
  return output
}

export function applySurface(source, texture, mask, { strength = .88, compare = 0, showMask = false, softness = .5, lighting } = {}) {
  const output = new Uint8ClampedArray(source.data)
  const width = source.width
  let total = 0, count = 0
  for (let p = 0; p < mask.length; p++) if (mask[p] > .5) {
    const i = p * 4
    total += lighting?.length === mask.length ? lighting[p] : source.data[i] * .2126 + source.data[i+1] * .7152 + source.data[i+2] * .0722
    count++
  }
  const mean = total / Math.max(1, count)
  for (let p = 0; p < mask.length; p++) {
    if (p % width < width * compare || mask[p] <= 0) continue
    const i = p * 4, alpha = Math.min(1, mask[p]) * strength
    const light = lighting?.length === mask.length ? lighting[p] : source.data[i]*.2126 + source.data[i+1]*.7152 + source.data[i+2]*.0722
    const ratio = light / Math.max(25, mean)
    const shade = Math.pow(Math.max(.22, Math.min(1.65, ratio)), 1.2 - softness * .4)
    const sheen = ratio > 1.12 ? Math.min(26, (ratio - 1.12) * 38 * (1 - softness * .45)) : 0
    for (let c = 0; c < 3; c++) {
      const value = showMask ? [245, 206, 57][c] : Math.min(255, texture.data[i+c] * shade + sheen)
      output[i+c] = source.data[i+c]*(1-alpha) + value*alpha
    }
  }
  return output
}

export function brushMask(mask, width, height, x, y, radius, erase = false) {
  for (let py = Math.max(0, Math.floor(y-radius)); py < Math.min(height, y+radius); py++) {
    for (let px = Math.max(0, Math.floor(x-radius)); px < Math.min(width, x+radius); px++) {
      const distance = Math.hypot(px-x, py-y)
      if (distance > radius) continue
      const coverage = Math.min(1, (radius-distance)/Math.max(1,radius*.15))
      const p = py*width+px
      mask[p] = erase ? Math.min(mask[p], 1-coverage) : Math.max(mask[p], coverage)
    }
  }
}
