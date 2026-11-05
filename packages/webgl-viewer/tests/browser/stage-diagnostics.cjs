// Independent diagnostic reconstruction. Color matrices are derived from the
// chromaticities returned by libavif, not imported from the viewer's uniforms.
const assert = require('node:assert/strict')

const linear = v => Math.sign(v) * (Math.abs(v) <= 0.04045 ? Math.abs(v) / 12.92 : ((Math.abs(v) + 0.055) / 1.055) ** 2.4)
const apply = (matrix, rgb) => matrix.map(row => row.reduce((sum, v, c) => sum + v * rgb[c], 0))

function solve(matrix, rhs) {
  const rows = matrix.map((row, i) => [...row, rhs[i]])
  for (let col = 0; col < 3; col++) {
    const pivot = rows.slice(col).reduce((best, row, i) => Math.abs(row[col]) > Math.abs(rows[best][col]) ? col + i : best, col)
    ;[rows[col], rows[pivot]] = [rows[pivot], rows[col]]
    const divisor = rows[col][col]
    assert.ok(Math.abs(divisor) > 1e-12)
    rows[col] = rows[col].map(v => v / divisor)
    for (let r = 0; r < 3; r++) {
      if (r === col) {
        continue
      }
      const scale = rows[r][col]
      rows[r] = rows[r].map((v, c) => v - scale * rows[col][c])
    }
  }
  return rows.map(row => row[3])
}

function xyz(xy) {
  const columns = [0, 2, 4].map(i => [xy[i] / xy[i + 1], 1, (1 - xy[i] - xy[i + 1]) / xy[i + 1]])
  const matrix = [0, 1, 2].map(r => columns.map(column => column[r]))
  const scale = solve(matrix, [xy[6] / xy[7], 1, (1 - xy[6] - xy[7]) / xy[7]])
  return matrix.map(row => row.map((v, c) => v * scale[c]))
}

function compare(a, b) {
  let maxError = 0
  let sumSquares = 0
  let mismatchedPixels = 0
  let worstPixel = 0
  a.forEach((pixel, i) => {
    const errors = pixel.map((v, c) => Math.abs(v - b[i][c]))
    const error = Math.max(...errors)
    sumSquares += errors.reduce((sum, e) => sum + e * e, 0)
    if (error > maxError) {
      maxError = error
      worstPixel = i
    }
    if (error > 0.005 + 0.02 * Math.max(0.1, ...b[i].map(Math.abs))) {
      mismatchedPixels++
    }
  })
  return { maxError, rmsError: Math.sqrt(sumSquares / (a.length * 3)), mismatchedPixels, worstPixel }
}

function sample(plane, x, y, width, height) {
  const sx = Math.max(0, (x + 0.5) * plane.width / width - 0.5)
  const sy = Math.max(0, (y + 0.5) * plane.height / height - 0.5)
  const x0 = Math.floor(sx)
  const y0 = Math.floor(sy)
  const x1 = Math.min(plane.width - 1, x0 + 1)
  const y1 = Math.min(plane.height - 1, y0 + 1)
  const fx = sx - x0
  const fy = sy - y0
  return [0, 1, 2].map(c =>
    (plane.pixels[y0 * plane.width + x0][c] * (1 - fx) + plane.pixels[y0 * plane.width + x1][c] * fx) * (1 - fy)
    + (plane.pixels[y1 * plane.width + x0][c] * (1 - fx) + plane.pixels[y1 * plane.width + x1][c] * fx) * fy)
}

module.exports = function stages(actual, reference, hdr) {
  const baseXYZ = xyz(reference.basePrimaries)
  const workingXYZ = xyz(reference.workingPrimaries)
  const displayXYZ = xyz(reference.displayPrimaries)
  const meta = reference.metadata
  assert.equal(actual.metadata.useBaseColorSpace, meta.useBaseColorSpace)
  for (const key of ['min', 'max', 'gamma', 'offsetBase', 'offsetAlternate']) {
    actual.metadata[key].forEach((v, c) => assert.ok(Math.abs(v - meta[key][c]) < 1e-6))
  }
  const decodeBase = plane => plane.pixels.map(rgb => solve(displayXYZ, apply(baseXYZ, rgb.map(linear))))
  const uploadedBase = actual.planes.base.pixels.map(rgb => rgb.map(linear))
  const decodedBase = decodeBase(reference.base)
  const output = actual.pixels.map(pixel => pixel.slice(0, 3).map(linear))
  function reconstruct(base, gain) {
    if (!hdr) {
      return base
    }
    return base.map((pixel, i) => {
      const rgb = solve(workingXYZ, apply(displayXYZ, pixel))
      const g = sample(gain, i % reference.base.width, Math.floor(i / reference.base.width), reference.base.width, reference.base.height)
      const hdrRGB = rgb.map((v, c) => (v + meta.offsetBase[c]) * 2 ** (meta.min[c] + (meta.max[c] - meta.min[c]) * g[c] ** (1 / meta.gamma[c])) - meta.offsetAlternate[c])
      return solve(displayXYZ, apply(workingXYZ, hdrRGB))
    })
  }
  const matched = reconstruct(decodedBase, reference.gain)
  const nativeModel = reconstruct(decodeBase(reference.nativeBase), reference.nativeScaledGain)
  const nativeScalingOnly = reconstruct(decodedBase, reference.scaledGainRGB16)
  return {
    ...(actual.baseProbe ? {
      rawYUVIdentical: actual.baseProbe.rawYUVIdentical,
      bitmapVsUploaded: compare(actual.baseProbe.bitmapPixels.map(rgb => rgb.map(linear)), uploadedBase),
    } : {}),
    uploadedFormula: compare(output, reconstruct(uploadedBase, actual.planes.gain)),
    independentMatched: compare(output, matched),
    baseOnlyEffect: compare(reconstruct(uploadedBase, reference.gain), matched),
    gainOnlyEffect: compare(reconstruct(decodedBase, actual.planes.gain), matched),
    nativeScalingOnlyEffect: compare(nativeScalingOnly, matched),
    nativeIntermediateDepthEffect: compare(nativeModel, nativeScalingOnly),
    nativeModelVsLibrary: compare(nativeModel, reference.linearP3),
    baseVsIndependent: compare(uploadedBase, decodedBase),
    baseVsNearestChroma: compare(uploadedBase, decodeBase(reference.baseNearest)),
    baseVsRGB8: compare(uploadedBase, decodeBase(reference.baseRGB8)),
  }
}
