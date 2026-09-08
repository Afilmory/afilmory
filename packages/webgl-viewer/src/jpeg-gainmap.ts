import { XMLParser } from 'fast-xml-parser'

export type RGB = [number, number, number]
export type Matrix3 = [number, number, number, number, number, number, number, number, number]

export interface GainMapMetadata {
  min: RGB
  max: RGB
  gamma: RGB
  offsetBase: RGB
  offsetAlternate: RGB
  capacityMin: number
  capacityMax: number
  useBaseColorSpace: boolean
}

interface Segment {
  marker: number
  start: number
  data: number
  end: number
}
interface JPEG {
  start: number
  end: number
  segments: Segment[]
}

const decoder = new TextDecoder()
const adobeNamespace = 'http://ns.adobe.com/hdr-gain-map/1.0/'
const isoNamespace = 'urn:iso:std:iso:ts:21496:-1\0'
const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  removeNSPrefix: true,
  parseTagValue: false,
  parseAttributeValue: false,
  processEntities: false,
})

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

function parseJPEG(bytes: Uint8Array, start: number): JPEG {
  if (bytes[start] !== 0xFF || bytes[start + 1] !== 0xD8) {
    throw new Error('Invalid JPEG image offset')
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const segments: Segment[] = []
  let cursor = start + 2
  while (cursor < bytes.length) {
    const markerStart = bytes.indexOf(0xFF, cursor)
    if (markerStart < 0) {
      break
    }
    cursor = markerStart + 1
    while (bytes[cursor] === 0xFF) {
      cursor++
    }
    const marker = bytes[cursor++]
    if (marker === 0x00 || (marker >= 0xD0 && marker <= 0xD7)) {
      continue
    }
    if (marker === 0xD9) {
      return { start, end: cursor, segments }
    }
    if (marker === 0xD8 || cursor + 2 > bytes.length) {
      throw new Error('Invalid JPEG marker')
    }
    const length = view.getUint16(cursor)
    const end = cursor + length
    if (length < 2 || end > bytes.length) {
      throw new Error('Truncated JPEG segment')
    }
    if (segments.length >= 4096) {
      throw new Error('Too many JPEG segments')
    }
    segments.push({ marker, start: markerStart, data: cursor + 2, end })
    cursor = end
  }
  throw new Error('Truncated JPEG image')
}

function startsWith(bytes: Uint8Array, segment: Segment, value: string) {
  return decoder.decode(bytes.subarray(segment.data, Math.min(segment.end, segment.data + value.length))) === value
}

function imageOffsets(bytes: Uint8Array, jpeg: JPEG): number[] {
  const mpf = jpeg.segments.find(s => s.marker === 0xE2 && startsWith(bytes, s, 'MPF\0'))
  if (!mpf) {
    return jpeg.end + 2 <= bytes.length && bytes[jpeg.end] === 0xFF && bytes[jpeg.end + 1] === 0xD8 ? [jpeg.end] : []
  }
  const tiff = mpf.data + 4
  const view = new DataView(bytes.buffer, bytes.byteOffset + tiff, mpf.end - tiff)
  const order = view.getUint16(0)
  if (order !== 0x4949 && order !== 0x4D4D) {
    throw new Error('Invalid MPF byte order')
  }
  const little = order === 0x4949
  if (view.getUint16(2, little) !== 42) {
    throw new Error('Invalid MPF TIFF header')
  }
  const ifd = view.getUint32(4, little)
  const count = view.getUint16(ifd, little)
  if (count > 64 || ifd + 2 + count * 12 > view.byteLength) {
    throw new Error('Invalid MPF directory')
  }
  for (let i = 0; i < count; i++) {
    const pos = ifd + 2 + i * 12
    if (view.getUint16(pos, little) !== 0xB002) {
      continue
    }
    const size = view.getUint32(pos + 4, little)
    const offset = view.getUint32(pos + 8, little)
    if (size % 16 || size > 16 * 64 || offset + size > view.byteLength) {
      throw new Error('Invalid MPF image entries')
    }
    const offsets: number[] = []
    for (let entry = 16; entry < size; entry += 16) {
      const length = view.getUint32(offset + entry + 4, little)
      const absolute = tiff + view.getUint32(offset + entry + 8, little)
      if (absolute < jpeg.end || length < 4 || absolute + length > bytes.length) {
        throw new Error('Invalid MPF auxiliary image bounds')
      }
      offsets.push(absolute)
    }
    return offsets
  }
  return []
}

function rgb(value: unknown, fallback: number): RGB {
  if (value === undefined) {
    return [fallback, fallback, fallback]
  }
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const record = value as Record<string, unknown>
    return rgb(record.Seq ?? record.li ?? record['#text'], fallback)
  }
  const values = (Array.isArray(value) ? value : [value]).map(Number)
  if (values.length !== 1 && values.length !== 3) {
    throw new Error('Gain map needs one or three channels')
  }
  return (values.length === 1 ? [values[0], values[0], values[0]] : values) as RGB
}

function validate(metadata: GainMapMetadata): GainMapMetadata {
  const { min, max, gamma, offsetBase, offsetAlternate, capacityMin, capacityMax } = metadata
  if (
    ![...min, ...max, ...gamma, ...offsetBase, ...offsetAlternate, capacityMin, capacityMax].every(Number.isFinite)
    || min.some((v, i) => v < -32 || max[i] < v || max[i] > 32)
    || gamma.some(v => v <= 0 || v > 128)
    || [...offsetBase, ...offsetAlternate].some(v => Math.abs(v) > 65504)
    || capacityMin < 0
    || capacityMax <= capacityMin
    || capacityMax > 32
  ) {
    throw new Error('Invalid gain map metadata')
  }
  return metadata
}

export function parseXMPGainMap(xmp: string): GainMapMetadata | null {
  if (!xmp.includes(adobeNamespace)) {
    return null
  }
  const root: unknown = xmlParser.parse(xmp)
  function find(node: unknown): Record<string, unknown> | undefined {
    if (!node || typeof node !== 'object') {
      return
    }
    const record = node as Record<string, unknown>
    if ('GainMapMax' in record) {
      return record
    }
    for (const child of Object.values(record)) {
      const match = find(child)
      if (match) {
        return match
      }
    }
  }
  const value = find(root)
  if (!value) {
    return null
  }
  if (String(value.BaseRenditionIsHDR).toLowerCase() === 'true') {
    throw new Error('HDR base rendition is not supported')
  }
  return validate({
    min: rgb(value.GainMapMin, 0),
    max: rgb(value.GainMapMax, 1),
    gamma: rgb(value.Gamma, 1),
    offsetBase: rgb(value.OffsetSDR, 1 / 64),
    offsetAlternate: rgb(value.OffsetHDR, 1 / 64),
    capacityMin: Number(value.HDRCapacityMin ?? 0),
    capacityMax: Number(value.HDRCapacityMax ?? 1),
    useBaseColorSpace: true,
  })
}

export function parseISOGainMap(bytes: Uint8Array): GainMapMetadata {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.getUint16(0) !== 0) {
    throw new Error('Unsupported ISO gain map version')
  }
  const flags = view.getUint8(4)
  if (flags & 4) {
    throw new Error('HDR base rendition is not supported')
  }
  const channels = flags & 128 ? 3 : 1
  let pos = 5
  function uint() {
    const v = view.getUint32(pos)
    pos += 4
    return v
  }
  function int() {
    const v = view.getInt32(pos)
    pos += 4
    return v
  }
  const common = flags & 8 ? uint() : null
  function fraction(signed = false) {
    const numerator = signed ? int() : uint()
    const denominator = common ?? uint()
    if (!denominator) {
      throw new Error('Zero gain map denominator')
    }
    return numerator / denominator
  }
  const capacityMin = fraction()
  const capacityMax = fraction()
  const min: RGB = [0, 0, 0]
  const max: RGB = [0, 0, 0]
  const gamma: RGB = [0, 0, 0]
  const offsetBase: RGB = [0, 0, 0]
  const offsetAlternate: RGB = [0, 0, 0]
  for (let c = 0; c < channels; c++) {
    min[c] = fraction(true)
    max[c] = fraction(true)
    gamma[c] = fraction()
    offsetBase[c] = fraction(true)
    offsetAlternate[c] = fraction(true)
  }
  if (channels === 1) {
    for (const values of [min, max, gamma, offsetBase, offsetAlternate]) {
      values.fill(values[0])
    }
  }
  return validate({
    min,
    max,
    gamma,
    offsetBase,
    offsetAlternate,
    capacityMin,
    capacityMax,
    useBaseColorSpace: Boolean(flags & 64),
  })
}

function metadataFor(bytes: Uint8Array, jpeg: JPEG): GainMapMetadata | null {
  const iso = jpeg.segments.find(
    s => s.marker === 0xE2 && startsWith(bytes, s, isoNamespace) && s.end - s.data > isoNamespace.length + 4,
  )
  if (iso) {
    return parseISOGainMap(bytes.subarray(iso.data + isoNamespace.length, iso.end))
  }
  for (const s of jpeg.segments) {
    if (s.marker !== 0xE1 || !startsWith(bytes, s, 'http://ns.adobe.com/xap/1.0/\0')) {
      continue
    }
    const metadata = parseXMPGainMap(decoder.decode(bytes.subarray(s.data + 29, s.end)))
    if (metadata) {
      return metadata
    }
  }
  return null
}

function colorants(bytes: Uint8Array, jpeg: JPEG): Matrix3 {
  const segments = jpeg.segments.filter(s => s.marker === 0xE2 && startsWith(bytes, s, 'ICC_PROFILE\0'))
  if (!segments.length) {
    return SRGB_TO_XYZ
  }
  segments.sort((a, b) => bytes[a.data + 12] - bytes[b.data + 12])
  if (segments.some((s, i) => bytes[s.data + 12] !== i + 1 || bytes[s.data + 13] !== segments.length)) {
    throw new Error('Incomplete ICC profile')
  }
  const icc = new Uint8Array(segments.reduce((sum, s) => sum + s.end - s.data - 14, 0))
  let cursor = 0
  for (const s of segments) {
    const part = bytes.subarray(s.data + 14, s.end)
    icc.set(part, cursor)
    cursor += part.length
  }
  const view = new DataView(icc.buffer)
  if (decoder.decode(icc.subarray(16, 20)) !== 'RGB ') {
    throw new Error('Unsupported HDR ICC color space')
  }
  const count = view.getUint32(128)
  if (count > 1024 || 132 + count * 12 > icc.length) {
    throw new Error('Invalid ICC tags')
  }
  const result = Array.from({ length: 9 })
  for (let i = 0; i < count; i++) {
    const pos = 132 + i * 12
    const tag = decoder.decode(icc.subarray(pos, pos + 4))
    const channel = ['rXYZ', 'gXYZ', 'bXYZ'].indexOf(tag)
    if (channel < 0) {
      continue
    }
    const offset = view.getUint32(pos + 4)
    const size = view.getUint32(pos + 8)
    if (size < 20 || offset + size > icc.length || decoder.decode(icc.subarray(offset, offset + 4)) !== 'XYZ ') {
      throw new Error('Invalid ICC colorant')
    }
    for (let c = 0; c < 3; c++) {
      result[channel * 3 + c] = view.getInt32(offset + 8 + c * 4) / 65536
    }
  }
  if (result.filter(Number.isFinite).length !== 9) {
    throw new Error('HDR ICC profile has no RGB matrix')
  }
  inverseMatrix(result as Matrix3)
  return result as Matrix3
}

function orientation(bytes: Uint8Array, jpeg: JPEG): number {
  const segment = jpeg.segments.find(s => s.marker === 0xE1 && startsWith(bytes, s, 'Exif\0\0'))
  if (!segment) {
    return 1
  }
  try {
    const view = new DataView(bytes.buffer, bytes.byteOffset + segment.data + 6, segment.end - segment.data - 6)
    const little = view.getUint16(0) === 0x4949
    const ifd = view.getUint32(4, little)
    const count = view.getUint16(ifd, little)
    if (count > 512) {
      return 1
    }
    for (let i = 0; i < count; i++) {
      const pos = ifd + 2 + i * 12
      if (view.getUint16(pos, little) === 0x112) {
        const value = view.getUint16(pos + 8, little)
        return value >= 1 && value <= 8 ? value : 1
      }
    }
  }
  catch {
    return 1
  }
  return 1
}

function imageBlob(bytes: Uint8Array<ArrayBuffer>, jpeg: JPEG, gain: boolean): Blob {
  const parts: Uint8Array<ArrayBuffer>[] = []
  let cursor = jpeg.start
  for (const s of jpeg.segments) {
    const remove = gain
      ? s.marker === 0xE1 || s.marker === 0xE2
      : (s.marker === 0xE2 && (startsWith(bytes, s, 'MPF\0') || startsWith(bytes, s, isoNamespace)))
        || (s.marker === 0xE1 && decoder.decode(bytes.subarray(s.data, s.end)).includes(adobeNamespace))
    if (!remove) {
      continue
    }
    parts.push(bytes.subarray(cursor, s.start))
    cursor = s.end
  }
  parts.push(bytes.subarray(cursor, jpeg.end))
  return new Blob(parts, { type: 'image/jpeg' })
}

export function extractJPEGGainMap(buffer: ArrayBuffer): {
  base: Blob
  gain: Blob
  metadata: GainMapMetadata
  orientation: number
  toGainSpace: Matrix3
  toDisplayP3: Matrix3
  wideGamut: boolean
} | null {
  const bytes = new Uint8Array(buffer)
  if (bytes[0] !== 0xFF || bytes[1] !== 0xD8) {
    return null
  }
  const primary = parseJPEG(bytes, 0)
  for (const offset of imageOffsets(bytes, primary)) {
    const auxiliary = parseJPEG(bytes, offset)
    const metadata = metadataFor(bytes, auxiliary)
    if (!metadata) {
      continue
    }
    const baseSpace = colorants(bytes, primary)
    const gainSpace = metadata.useBaseColorSpace ? baseSpace : colorants(bytes, auxiliary)
    const toDisplayP3 = multiplyMatrices(inverseMatrix(P3_TO_XYZ), gainSpace)
    const toGainSpace = inverseMatrix(toDisplayP3)
    const baseToP3 = multiplyMatrices(inverseMatrix(P3_TO_XYZ), baseSpace)
    return {
      base: imageBlob(bytes, primary, false),
      gain: imageBlob(bytes, auxiliary, true),
      metadata,
      orientation: orientation(bytes, primary),
      toGainSpace,
      toDisplayP3,
      wideGamut: baseToP3.some(v => v < -0.001 || v > 1.001),
    }
  }
  return null
}
