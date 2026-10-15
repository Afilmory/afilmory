import type { Box } from './avif-bmff'
import { box, boxes, bytes, full, join, one, Reader, text, uint } from './avif-bmff'
import { avifColorTransforms, readAVIFColor, UnsupportedAVIFColor, UnsupportedICCProfile } from './avif-gainmap-icc'
import { UnsupportedAVIFTransform, validateGainMapTransforms } from './avif-gainmap-transform'
import type { GainMapMetadata, RGB } from './jpeg-gainmap'

// ISO BMFF demux/remux only: compressed AV1 payloads are never transcoded.
// Static SDR-base tone maps; unsupported capabilities must never be guessed.
export class UnsupportedAVIFGainMap extends Error {}
const unsupported = (message: string): never => {
  throw new UnsupportedAVIFGainMap(message)
}
export const MAX_AVIF_GAIN_MAP_BYTES = 128 * 1024 * 1024
export type AVIFGainMapResult
  = | { status: 'supported', image: NonNullable<ReturnType<typeof extractAVIFGainMap>> }
    | { status: 'none' }
    | { status: 'unsupported' | 'invalid', reason: string }

export function inspectAVIFGainMap(buffer: ArrayBuffer): AVIFGainMapResult {
  try {
    const image = extractAVIFGainMap(buffer)
    return image ? { status: 'supported', image } : { status: 'none' }
  }
  catch (error) {
    return {
      status:
        error instanceof UnsupportedAVIFGainMap
        || error instanceof UnsupportedAVIFColor
        || error instanceof UnsupportedICCProfile
        || error instanceof UnsupportedAVIFTransform
          ? 'unsupported'
          : 'invalid',
      reason: String(error),
    }
  }
}
function metadata(data: Uint8Array): GainMapMetadata {
  const r = new Reader(data)
  if (r.uint(1) !== 0 || r.uint(2) !== 0) {
    unsupported('Unsupported tmap version')
  }
  const writer = r.uint(2)
  const flags = r.uint(1)
  if (flags & 63) {
    throw new Error('Reserved tmap flags')
  }
  const fraction = (signed = false) => {
    let n = r.uint(4)
    if (signed && n >= 0x80000000) {
      n -= 0x100000000
    }
    const d = r.uint(4)
    if (!d) {
      throw new Error('Zero tmap denominator')
    }
    return n / d
  }
  const capacityMin = fraction()
  const capacityMax = fraction()
  if (capacityMin !== 0 || capacityMax <= capacityMin || capacityMax > 16) {
    unsupported('Unsupported HDR-to-SDR or headroom range')
  }
  // Each channel array must have separate storage.
  // eslint-disable-next-line e18e/prefer-array-fill
  const fields: RGB[] = Array.from({ length: 5 }, () => [0, 0, 0])
  const count = flags & 128 ? 3 : 1
  for (let c = 0; c < count; c++) {
    for (let f = 0; f < 5; f++) {
      fields[f][c] = fraction(f !== 2)
    }
    if (fields[2][c] <= 0 || fields[0][c] > fields[1][c]) {
      throw new Error('Invalid gain map parameters')
    }
    if (
      fields[0][c] < -32
      || fields[1][c] > 32
      || fields[3][c] < 0
      || fields[4][c] < 0
      || fields[3][c] > 1
      || fields[4][c] > 1
      || fields[2][c] < 1e-6
      || fields[2][c] > 32
    ) {
      unsupported('Gain map parameters exceed renderer numerical range')
    }
  }
  if (count === 1) {
    for (const field of fields) {
      field.fill(field[0])
    }
  }
  if (writer === 0 && r.position !== data.length) {
    throw new Error('Trailing tmap bytes')
  }
  return {
    min: fields[0],
    max: fields[1],
    gamma: fields[2],
    offsetBase: fields[3],
    offsetAlternate: fields[4],
    capacityMin,
    capacityMax,
    useBaseColorSpace: Boolean(flags & 64),
  }
}

export function extractAVIFGainMap(buffer: ArrayBuffer) {
  if (buffer.byteLength > MAX_AVIF_GAIN_MAP_BYTES) {
    unsupported('File exceeds gain-map extraction budget')
  }
  const input = new Uint8Array(buffer)
  const top = boxes(input)
  const ftyp = one(top, 'ftyp').data
  if (ftyp.length > 4096) {
    unsupported('Too many file brands')
  }
  if (ftyp.length < 8 || ftyp.length % 4) {
    throw new Error('Invalid ftyp')
  }
  const brands = [new TextDecoder().decode(ftyp.subarray(0, 4))]
  for (let i = 8; i < ftyp.length; i += 4) {
    brands.push(new TextDecoder().decode(ftyp.subarray(i, i + 4)))
  }
  if (!brands.includes('avif') && !brands.includes('avis')) {
    return null
  }
  const metaBox = new Reader(one(top, 'meta').data)
  if (metaBox.uint(4) !== 0) {
    unsupported('Unsupported meta version or flags')
  }
  const meta = boxes(metaBox.take(metaBox.bytes.length - metaBox.position))
  const infoReader = new Reader(one(meta, 'iinf').data)
  const infoVersion = infoReader.uint(1)
  if (infoVersion > 1) {
    unsupported('Unsupported iinf version')
  }
  infoReader.uint(3)
  const itemCount = infoReader.uint(infoVersion === 0 ? 2 : 4)
  const entries = boxes(infoReader.take(infoReader.bytes.length - infoReader.position))
  if (entries.length !== itemCount || itemCount > 256) {
    throw new Error('Invalid AVIF item count')
  }
  const types = new Map<number, string>()
  for (const entry of entries) {
    if (entry.type !== 'infe') {
      throw new Error('Unexpected AVIF item info')
    }
    const r = new Reader(entry.data)
    const version = r.uint(1)
    r.uint(3)
    if (version !== 2 && version !== 3) {
      unsupported('Unsupported infe version')
    }
    const id = r.uint(version === 2 ? 2 : 4)
    if (r.uint(2) || types.has(id)) {
      throw new Error('Protected or duplicate AVIF item')
    }
    types.set(id, r.text(4))
  }
  const toneItems = [...types].filter(([, type]) => type === 'tmap')
  if (!toneItems.length) {
    return null
  }
  if (brands.includes('avis') || top.some(b => b.type === 'moov')) {
    unsupported('AVIF sequences with gain maps are not supported')
  }
  if (toneItems.length !== 1) {
    unsupported('Multiple tone map items')
  }
  const tone = toneItems[0][0]
  const refs = one(meta, 'iref').data
  const refVersion = refs[0]
  if (refVersion > 1) {
    unsupported('Unsupported iref version')
  }
  const references = boxes(refs.subarray(4))
  if (references.some(reference => reference.type === 'auxl' || reference.type === 'prem')) {
    unsupported('Auxiliary alpha/depth planes are not supported')
  }
  const derived = references
    .filter(b => b.type === 'dimg')
    .map((b) => {
      const r = new Reader(b.data)
      const from = r.uint(refVersion ? 4 : 2)
      const count = r.uint(2)
      // The reader advances for every reference.
      // eslint-disable-next-line e18e/prefer-array-fill
      return { from, to: Array.from({ length: count }, () => r.uint(refVersion ? 4 : 2)) }
    })
    .filter(ref => ref.from === tone)
  if (derived.length !== 1 || derived[0].to.length !== 2) {
    throw new Error('Invalid tmap references')
  }
  const [baseId, gainId] = derived[0].to
  const primary = new Reader(one(meta, 'pitm').data)
  const pv = primary.uint(1)
  primary.uint(3)
  if (pv > 1 || primary.uint(pv ? 4 : 2) !== baseId) {
    unsupported('Expected SDR primary item')
  }
  if (types.get(baseId) !== 'av01' || types.get(gainId) !== 'av01') {
    unsupported('AVIF grids are not supported yet')
  }

  const locations = new Map<number, Uint8Array>()
  let allocated = 0
  const lr = new Reader(one(meta, 'iloc').data)
  const lv = lr.uint(1)
  lr.uint(3)
  if (lv > 2) {
    unsupported('Unsupported iloc version')
  }
  const sizes = lr.uint(1)
  const sizes2 = lr.uint(1)
  const offsetSize = sizes >> 4
  const lengthSize = sizes & 15
  const baseSize = sizes2 >> 4
  const indexSize = lv ? sizes2 & 15 : 0
  const count = lr.uint(lv === 2 ? 4 : 2)
  if (count > 256) {
    throw new Error('Too many AVIF extents')
  }
  const locatedIds = new Set<number>()
  for (let i = 0; i < count; i++) {
    const id = lr.uint(lv === 2 ? 4 : 2)
    if (locatedIds.has(id)) {
      throw new Error('Duplicate item location')
    }
    locatedIds.add(id)
    const method = lv ? lr.uint(2) : 0
    if (method > 1 || lr.uint(2)) {
      unsupported('External AVIF extent')
    }
    const origin = lr.uint(baseSize)
    const extentCount = lr.uint(2)
    const parts = []
    let totalLength = 0
    const source = method === 1 ? one(meta, 'idat').data : input
    if (extentCount > 256 || locations.has(id)) {
      throw new Error('Invalid AVIF extents')
    }
    for (let j = 0; j < extentCount; j++) {
      if (indexSize && lr.uint(indexSize)) {
        unsupported('Unsupported extent index')
      }
      const offset = origin + lr.uint(offsetSize)
      const length = lr.uint(lengthSize)
      if (!length || !Number.isSafeInteger(offset + length) || offset + length > source.length) {
        throw new Error('AVIF extent outside file')
      }
      totalLength += length
      if (totalLength > input.length) {
        throw new Error('AVIF item exceeds file size')
      }
      parts.push(source.subarray(offset, offset + length))
    }
    if ([baseId, gainId, tone].includes(id)) {
      allocated += totalLength
      if (allocated > input.length) {
        unsupported('Combined item payloads exceed file size')
      }
      locations.set(id, join(...parts))
    }
  }
  const iprp = boxes(one(meta, 'iprp').data)
  const properties = boxes(one(iprp, 'ipco').data)
  const associations = new Map<number, (Box & { essential: boolean })[]>()
  const ar = new Reader(one(iprp, 'ipma').data)
  const av = ar.uint(1)
  const flags = ar.uint(3)
  const ac = ar.uint(4)
  if (av > 1 || flags > 1 || ac > 256) {
    unsupported('Unsupported ipma')
  }
  for (let i = 0; i < ac; i++) {
    const id = ar.uint(av ? 4 : 2)
    const n = ar.uint(1)
    const props: (Box & { essential: boolean })[] = []
    for (let j = 0; j < n; j++) {
      const association = ar.uint(flags & 1 ? 2 : 1)
      const index = association & (flags & 1 ? 32767 : 127)
      if (index) {
        if (!properties[index - 1]) {
          throw new Error('Invalid property index')
        }
        props.push({ ...properties[index - 1], essential: Boolean(association & (flags & 1 ? 32768 : 128)) })
      }
    }
    if (associations.has(id)) {
      throw new Error('Duplicate property association')
    }
    associations.set(id, props)
  }
  const props = (id: number) => {
    const result = associations.get(id)
    if (!result) {
      throw new Error('Missing AVIF properties')
    }
    const unknown = result.find(
      p =>
        !['ispe', 'pixi', 'av1C', 'colr', 'clli', 'mdcv', 'clap', 'irot', 'imir'].includes(p.type)
        && (p.essential || ['irot', 'imir', 'clap', 'lsel', 'a1op'].includes(p.type)),
    )
    if (unknown) {
      unsupported(`Unsupported AVIF property: ${unknown.type}`)
    }
    return result
  }
  validateGainMapTransforms(props(baseId), props(gainId), props(tone))
  const color = (id: number) =>
    readAVIFColor(
      props(id)
        .filter(p => p.type === 'colr')
        .map(p => p.data),
    )
  const baseProfile = color(baseId)
  const alternateProfile = color(tone)
  const baseColor = baseProfile.cicp
  const gainProfile = color(gainId)
  const gainColor = gainProfile.cicp
  avifColorTransforms(baseProfile)
  if (gainProfile.icc) {
    unsupported('ICC gain samples are not supported')
  }
  if (!baseProfile.icc && ![1, 6, 13, 14, 15].includes(baseColor[1])) {
    unsupported('Unsupported SDR base color space or transfer function')
  }
  if (![0, 1, 5, 6, 9].includes(baseColor[2]) || ![0, 128].includes(baseColor[3])) {
    unsupported('Unsupported base matrix coefficients or range')
  }
  if (![2, 6].includes(gainColor[2]) || gainColor[3] !== 128) {
    unsupported('Only full-range BT.601 gain-map samples are supported')
  }
  const gainAV1C = one(props(gainId), 'av1C').data
  if (gainAV1C.length < 4) {
    throw new Error('Truncated gain-map AV1 configuration')
  }
  const gainBitDepth = gainAV1C[2] & 0x40 ? (gainAV1C[2] & 0x20 ? 12 : 10) : 8
  const gainMonochrome = Boolean(gainAV1C[2] & 0x10)
  if (!gainMonochrome && (gainAV1C[2] & 0x0C) === 0x0C && gainAV1C[2] & 3) {
    unsupported('Explicitly sited gain-map chroma is not supported')
  }
  const toneData = locations.get(tone)
  if (!toneData) {
    throw new Error('Missing tmap payload')
  }
  const parameters = metadata(toneData)
  const transforms = avifColorTransforms(parameters.useBaseColorSpace ? baseProfile : alternateProfile)
  function plane(id: number, isGain: boolean) {
    const payload = locations.get(id)
    if (!payload?.length) {
      throw new Error('Missing AV1 payload')
    }
    const selected = props(id)
      .filter(p => ['ispe', 'pixi', 'av1C', 'colr', 'clap', 'irot', 'imir'].includes(p.type))
      .map(p =>
        isGain && p.type === 'colr'
          ? box('colr', text('nclx'), uint(1, 2), uint(13, 2), uint(6, 2), bytes(128))
          : p.raw)
    one(props(id), 'av1C')
    const dimensions = new Reader(one(props(id), 'ispe').data)
    if (dimensions.uint(4) !== 0) {
      throw new Error('Invalid ispe version')
    }
    const width = dimensions.uint(4)
    const height = dimensions.uint(4)
    if (!width || !height || width * height > 100_000_000) {
      unsupported('Image exceeds 100 megapixel decode budget')
    }
    const ftyp = box('ftyp', text('avif'), uint(0), text('avifmif1miaf'))
    const makeMeta = (offset: number) =>
      full(
        'meta',
        0,
        one(meta, 'hdlr').raw,
        full('pitm', 0, uint(1, 2)),
        full(
          'iloc',
          0,
          bytes(0x44, 0),
          uint(1, 2),
          uint(1, 2),
          uint(0, 2),
          uint(1, 2),
          uint(offset),
          uint(payload.length),
        ),
        full('iinf', 0, uint(1, 2), full('infe', 2, uint(1, 2), uint(0, 2), text('av01'), bytes(0))),
        box(
          'iprp',
          box('ipco', ...selected),
          full('ipma', 0, uint(1), uint(1, 2), bytes(selected.length), bytes(...selected.map((_, i) => (i + 1) | 128))),
        ),
      )
    const m = makeMeta(0)
    return new Blob([join(ftyp, makeMeta(ftyp.length + m.length + 8), box('mdat', payload))], { type: 'image/avif' })
  }
  return {
    base: plane(baseId, false),
    gain: plane(gainId, true),
    gainBitDepth,
    gainMonochrome,
    metadata: parameters,
    orientation: 1,
    ...transforms,
    wideGamut: true,
  }
}
