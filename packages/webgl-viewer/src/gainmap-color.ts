export type RGB = [number, number, number]
export type Matrix3 = [number, number, number, number, number, number, number, number, number]

// ICC RGB colorants are PCS D50, stored column-major like WGSL matrices.
export const SRGB_TO_XYZ: Matrix3 = [
  0.4360747,
  0.2225045,
  0.0139322,
  0.3850649,
  0.7168786,
  0.0971045,
  0.1430804,
  0.0606169,
  0.7141733,
]
export const P3_TO_XYZ: Matrix3 = [
  0.515102,
  0.241182,
  -0.001049,
  0.291965,
  0.692236,
  0.041882,
  0.157153,
  0.0665819,
  0.784378,
]

export function multiplyMatrices(a: Matrix3, b: Matrix3): Matrix3 {
  return Array.from({ length: 9 }, (_, index) => {
    const row = index % 3
    const col = Math.floor(index / 3)
    return a[row] * b[col * 3] + a[row + 3] * b[col * 3 + 1] + a[row + 6] * b[col * 3 + 2]
  }) as Matrix3
}

export function inverseMatrix(m: Matrix3): Matrix3 {
  const [a, d, g, b, e, h, c, f, i] = m
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g)
  if (!Number.isFinite(det) || Math.abs(det) < 1e-8) {
    throw new Error('Invalid ICC colorants')
  }
  return [
    e * i - f * h,
    f * g - d * i,
    d * h - e * g,
    c * h - b * i,
    a * i - c * g,
    b * g - a * h,
    b * f - c * e,
    c * d - a * f,
    a * e - b * d,
  ].map(v => v / det) as Matrix3
}

export class UnsupportedICCProfile extends Error {}

const decoder = new TextDecoder()
const signature = (data: Uint8Array, offset = 0) => decoder.decode(data.subarray(offset, offset + 4))

function iccTags(icc: Uint8Array) {
  if (icc.length < 132 || icc.length > 4 * 1024 * 1024) {
    throw new Error('ICC profile outside size bounds')
  }
  const view = new DataView(icc.buffer, icc.byteOffset, icc.byteLength)
  const count = view.getUint32(128)
  if (count > 1024 || 132 + count * 12 > icc.length) {
    throw new Error('Invalid ICC tag table')
  }
  const tags = new Map<string, Uint8Array>()
  const ranges: [number, number][] = []
  for (let i = 0; i < count; i++) {
    const pos = 132 + i * 12
    const name = signature(icc, pos)
    const offset = view.getUint32(pos + 4)
    const size = view.getUint32(pos + 8)
    if (offset < 132 + count * 12 || offset % 4 || size < 8 || offset + size > icc.length || tags.has(name)) {
      throw new Error('Invalid ICC tag bounds or duplicate tag')
    }
    if (ranges.some(([start, end]) => offset < end && offset + size > start && (start !== offset || end !== offset + size))) {
      throw new Error('Partially overlapping ICC tags')
    }
    ranges.push([offset, offset + size])
    tags.set(name, icc.subarray(offset, offset + size))
  }
  return tags
}

function matrixFromTags(tags: Map<string, Uint8Array>): Matrix3 {
  const result: number[] = []
  for (const name of ['rXYZ', 'gXYZ', 'bXYZ']) {
    const tag = tags.get(name)
    if (!tag) {
      throw new UnsupportedICCProfile('ICC profile has no RGB matrix')
    }
    if (tag.length !== 20 || signature(tag) !== 'XYZ ') {
      throw new Error('Invalid ICC colorant')
    }
    const view = new DataView(tag.buffer, tag.byteOffset, tag.byteLength)
    for (let c = 0; c < 3; c++) {
      result.push(view.getInt32(8 + c * 4) / 65536)
    }
  }
  inverseMatrix(result as Matrix3)
  return result as Matrix3
}

/** Legacy JPEG extraction only needs colorants; preserve its existing profile policy. */
export function readICCColorants(icc: Uint8Array): Matrix3 {
  if (signature(icc, 16) !== 'RGB ') {
    throw new UnsupportedICCProfile('Unsupported HDR ICC color space')
  }
  return matrixFromTags(iccTags(icc))
}

function validateTRC(tag: Uint8Array) {
  const view = new DataView(tag.buffer, tag.byteOffset, tag.byteLength)
  if (tag.length < 12) {
    throw new Error('Truncated ICC tone curve')
  }
  const type = signature(tag)
  if (view.getUint32(4)) {
    throw new Error('Invalid ICC curve reserved field')
  }
  if (type === 'curv') {
    const count = view.getUint32(8)
    if (count > 65536 || tag.length !== 12 + count * 2) {
      throw new Error('Invalid ICC tone curve length')
    }
    let previous = 0
    for (let i = 0; i < count; i++) {
      const value = view.getUint16(12 + i * 2)
      if ((count === 1 && !value) || (count > 1 && value < previous)) {
        throw new UnsupportedICCProfile('Nonmonotonic ICC tone curve')
      }
      previous = value
    }
    return
  }
  if (type !== 'para') {
    throw new UnsupportedICCProfile(`Unsupported ICC tone curve: ${type}`)
  }
  const kind = view.getUint16(8)
  const counts = [1, 3, 4, 5, 7]
  if (kind > 4) {
    throw new UnsupportedICCProfile('Unknown ICC parametric curve')
  }
  if (tag.length !== 12 + counts[kind] * 4 || view.getUint16(10)) {
    throw new Error('Invalid ICC parametric curve length or reserved field')
  }
  const p = Array.from({ length: counts[kind] }, (_, i) => view.getInt32(12 + i * 4) / 65536)
  const [g, a, b, c, d, e, f] = p
  if (g <= 0 || g > 128 || (kind > 0 && a <= 0)
    || (kind >= 3 && (c < 0 || d < 0 || d > 1 || a * d + b < -1e-5))) {
    throw new UnsupportedICCProfile('Unsupported ICC parametric curve domain')
  }
  // Reject discontinuous/nonmonotonic curves. The browser performs the actual TRC decoding.
  if (kind >= 3 && Math.abs((a * d + b) ** g + (e ?? 0) - (c * d + (f ?? 0))) > 0.002) {
    throw new UnsupportedICCProfile('Discontinuous ICC tone curve')
  }
}

/** RGB matrix/TRC ICC v2/v4 only. Colorants already include adaptation to PCS D50. */
export function readICCMatrixProfile(icc: Uint8Array): Matrix3 {
  const tags = iccTags(icc)
  const view = new DataView(icc.buffer, icc.byteOffset, icc.byteLength)
  if (view.getUint32(0) !== icc.length || signature(icc, 36) !== 'acsp') {
    throw new Error('Invalid ICC profile header')
  }
  if (![2, 4].includes(icc[8]) || signature(icc, 16) !== 'RGB ' || signature(icc, 20) !== 'XYZ '
    || !['mntr', 'scnr'].includes(signature(icc, 12))) {
    throw new UnsupportedICCProfile('Only RGB XYZ matrix input/display ICC v2/v4 profiles are supported')
  }
  if ([0.9642, 1, 0.8249].some((value, i) => Math.abs(view.getInt32(68 + i * 4) / 65536 - value) > 0.001)) {
    throw new UnsupportedICCProfile('ICC PCS illuminant must be D50')
  }
  if ([...tags.keys()].some(name => /^(?:A2B|B2A|D2B|B2D)[0-3]$/.test(name))) {
    throw new UnsupportedICCProfile('ICC LUT profiles cannot use the matrix gain-map path')
  }
  for (const name of ['rTRC', 'gTRC', 'bTRC']) {
    const tag = tags.get(name)
    if (!tag) {
      throw new UnsupportedICCProfile('ICC profile has no RGB tone curves')
    }
    validateTRC(tag)
  }
  return matrixFromTags(tags)
}

export function iccGainMapTransforms(space: Matrix3) {
  const toDisplayP3 = multiplyMatrices(inverseMatrix(P3_TO_XYZ), space)
  return { toDisplayP3, toGainSpace: inverseMatrix(toDisplayP3) }
}
