// Diagnostic controls for the deliberately simple P3, 8x, unit-gamma corpus.
// Native library reconstruction remains the primary independent reference.
const assert = require('node:assert/strict')

const linear = v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4

function compare(a, b) {
  let maxError = 0
  let mismatchedPixels = 0
  a.forEach((p, i) => {
    const error = Math.max(...p.map((v, c) => Math.abs(v - b[i][c])))
    const peak = Math.max(0.1, ...b[i].map(Math.abs))
    maxError = Math.max(maxError, error)
    if (error > 0.005 + 0.02 * peak) {
      mismatchedPixels++
    }
  })
  return { maxError, mismatchedPixels }
}

function centerReconstruction(planes, hdr) {
  const { base, gain } = planes
  const read = (x, y, c) => gain.pixels[y * gain.width + x][c]
  return base.pixels.map((rgb, i) => {
    const sx = Math.max(0, (i % base.width + 0.5) * gain.width / base.width - 0.5)
    const sy = Math.max(0, (Math.floor(i / base.width) + 0.5) * gain.height / base.height - 0.5)
    const x0 = Math.floor(sx)
    const y0 = Math.floor(sy)
    const x1 = Math.min(gain.width - 1, x0 + 1)
    const y1 = Math.min(gain.height - 1, y0 + 1)
    const fx = sx - x0
    const fy = sy - y0
    return rgb.map((value, c) => {
      const g = (read(x0, y0, c) * (1 - fx) + read(x1, y0, c) * fx) * (1 - fy)
        + (read(x0, y1, c) * (1 - fx) + read(x1, y1, c) * fx) * fy
      return linear(value) * (hdr ? 2 ** (3 * g) : 1)
    })
  })
}

module.exports = function diagnose(actual, reference, hdr) {
  assert.deepEqual(actual.metadata, {
    min: [0, 0, 0],
    max: [3, 3, 3],
    gamma: [1, 1, 1],
    offsetBase: [0, 0, 0],
    offsetAlternate: [0, 0, 0],
    capacityMin: 0,
    capacityMax: 3,
    useBaseColorSpace: true,
  })
  const output = actual.pixels.map(p => p.slice(0, 3).map(linear))
  const independentPlanes = { base: reference.base, gain: reference.gain }
  const fromDecoded = centerReconstruction(independentPlanes, hdr)
  const planeErrors = {}
  for (const name of ['base', 'gain']) {
    const a = actual.planes[name]
    const b = independentPlanes[name]
    assert.equal(a.width, b.width)
    assert.equal(a.height, b.height)
    planeErrors[name] = Math.max(...a.pixels.flatMap((p, i) => p.map((v, c) => Math.abs(v - b.pixels[i][c]))))
  }
  return {
    planeErrors,
    // Independent libjpeg/libavif planes with explicitly matched sampling.
    pixelCenterReference: compare(output, fromDecoded),
    // Isolate shader/uniform math after browser decode/upload. Not end-to-end
    // correctness: an incorrect uploaded plane can still pass this control.
    gpuFormulaControl: compare(output, centerReconstruction(actual.planes, hdr)),
    // No GPU involved: reveals differences in the two reconstruction policies.
    nativeVsPixelCenter: compare(reference.linearP3, fromDecoded),
    ...(!hdr && reference.baseNearest ? {
      // The libultrahdr SDR output can use nearest chroma, while the browser
      // and libjpeg RGB reference use fancy upsampling. Measure, don't assume.
      nativeSDRVsNearest: compare(reference.linearP3, reference.baseNearest.pixels.map(p => p.map(linear))),
    } : {}),
  }
}
