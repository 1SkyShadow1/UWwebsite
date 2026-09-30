export function applySurface(source, texture, mask, { strength = .88, compare = 0, showMask = false, softness = .5 } = {}) {
  const output = new Uint8ClampedArray(source.data)
  const width = source.width
  let total = 0, count = 0
  for (let p = 0; p < mask.length; p++) if (mask[p] > .5) {
    const i = p * 4
    total += source.data[i] * .2126 + source.data[i+1] * .7152 + source.data[i+2] * .0722
    count++
  }
  const mean = total / Math.max(1, count)
  for (let p = 0; p < mask.length; p++) {
    if (p % width < width * compare || mask[p] <= 0) continue
    const i = p * 4, alpha = Math.min(1, mask[p]) * strength
    const light = source.data[i]*.2126 + source.data[i+1]*.7152 + source.data[i+2]*.0722
    const ratio = light / Math.max(25, mean)
    const shade = Math.pow(Math.max(.22, Math.min(1.65, ratio)), 1.2 - softness * .4)
    const sheen = ratio > 1.12 ? Math.min(26, (ratio - 1.12) * 38 * (1 - softness * .45)) : 0
    for (let c = 0; c < 3; c++) {
      const value = showMask ? [211, 177, 111][c] : Math.min(255, texture.data[i+c] * shade + sheen)
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
