// A deliberately narrow HEIF reader for the WebCodecs fast path. Unsupported
// constructions go through libheif; never guess at an image's colour or geometry.
interface Box {
  type: string
  start: number
  end: number
}
interface Tile {
  description: Uint8Array<ArrayBuffer>
  codec: string
  width: number
  height: number
  data: Uint8Array<ArrayBuffer>
}
export interface HeifImage {
  width: number
  height: number
  cols: number
  rotation: number
  colorSpace: PredefinedColorSpace
  tiles: Tile[]
  standalone: () => Blob
}
export interface HeifPhoto {
  base: HeifImage
  gain?: { image: HeifImage, headroom: number }
}
const text = new TextDecoder()
const encoder = new TextEncoder()
const u16 = (n: number) => new Uint8Array([n >> 8, n & 255])
const u32 = (n: number) => new Uint8Array([n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255])
function join(...parts: Uint8Array[]) {
  const result = new Uint8Array(parts.reduce((size, part) => size + part.length, 0))
  let offset = 0
  for (const part of parts) {
    result.set(part, offset)
    offset += part.length
  }
  return result
}
const box = (type: string, ...parts: Uint8Array[]) => {
  const data = join(...parts)
  return join(u32(data.length + 8), encoder.encode(type), data)
}
const full = (type: string, version: number, ...parts: Uint8Array[]) => box(type, u32(version << 24), ...parts)

export function parseHeif(buffer: ArrayBuffer): HeifPhoto {
  const bytes = new Uint8Array(buffer)
  const fail = (): never => {
    throw new Error('Unsupported or malformed HEIF')
  }
  const num = (offset: number, length: number, end = bytes.length): number => {
    if (length < 0 || length > 8 || offset < 0 || offset + length > end) {
      return fail()
    }
    let value = 0
    for (let i = 0; i < length; i++) {
      value = value * 256 + bytes[offset + i]
    }
    return Number.isSafeInteger(value) ? value : fail()
  }
  const boxes = (start: number, end: number): Box[] => {
    const result: Box[] = []
    for (let p = start; p < end;) {
      let size = num(p, 4, end)
      const header = size === 1 ? 16 : 8
      if (size === 1) {
        size = num(p + 8, 8, end)
      }
      if (size === 0) {
        size = end - p
      }
      if (size < header || p + size > end || result.length > 4096) {
        return fail()
      }
      result.push({ type: text.decode(bytes.subarray(p + 4, p + 8)), start: p + header, end: p + size })
      p += size
    }
    return result
  }
  const find = (list: Box[], type: string) => list.find(b => b.type === type) ?? fail()
  const meta = find(boxes(0, bytes.length), 'meta')
  if (num(meta.start, 4, meta.end) !== 0) {
    return fail()
  }
  const children = boxes(meta.start + 4, meta.end)
  const pitm = find(children, 'pitm')
  const pv = num(pitm.start, 1, pitm.end)
  if (pv > 1) {
    return fail()
  }
  const primary = num(pitm.start + 4, pv ? 4 : 2, pitm.end)
  const types = new Map<number, string>()
  const iinf = find(children, 'iinf')
  const iv = num(iinf.start, 1, iinf.end)
  if (iv > 1) {
    return fail()
  }
  for (const b of boxes(iinf.start + 4 + (iv ? 4 : 2), iinf.end)) {
    const v = num(b.start, 1, b.end)
    if (b.type !== 'infe' || (v !== 2 && v !== 3)) {
      return fail()
    }
    const n = v === 3 ? 4 : 2
    const id = num(b.start + 4, n, b.end)
    if (types.has(id) || num(b.start + 4 + n, 2, b.end)) {
      return fail()
    }
    num(b.start + 6 + n, 4, b.end)
    types.set(id, text.decode(bytes.subarray(b.start + 6 + n, b.start + 10 + n)))
  }
  const iprp = find(children, 'iprp')
  const properties = boxes(iprp.start, iprp.end)
  const ipco = find(properties, 'ipco')
  const props = boxes(ipco.start, ipco.end)
  const associations = new Map<number, Box[]>()
  for (const b of properties.filter(b => b.type === 'ipma')) {
    let p = b.start
    const v = num(p, 1, b.end)
    const flags = num(p + 1, 3, b.end)
    const count = num(p + 4, 4, b.end)
    if (v > 1 || flags > 1 || count > 4096) {
      return fail()
    }
    p += 8
    for (let i = 0; i < count; i++) {
      const id = num(p, v ? 4 : 2, b.end)
      p += v ? 4 : 2
      const n = num(p++, 1, b.end)
      const list: Box[] = []
      for (let j = 0; j < n; j++) {
        const width = flags & 1 ? 2 : 1
        const value = num(p, width, b.end)
        p += width
        const index = value & (width === 2 ? 32767 : 127)
        if (index) {
          list.push(props[index - 1] ?? fail())
        }
      }
      if (associations.has(id)) {
        return fail()
      }
      associations.set(id, list)
    }
  }
  const locations = new Map<number, Uint8Array<ArrayBuffer>>()
  const iloc = find(children, 'iloc')
  let p = iloc.start
  const lv = num(p, 1, iloc.end)
  p += 4
  if (lv > 2) {
    return fail()
  }
  const a = num(p++, 1, iloc.end)
  const b = num(p++, 1, iloc.end)
  const offSize = a >> 4
  const lenSize = a & 15
  const baseSize = b >> 4
  const indexSize = lv ? b & 15 : 0
  const count = num(p, lv < 2 ? 2 : 4, iloc.end)
  p += lv < 2 ? 2 : 4
  if (count > 4096 || [offSize, lenSize, baseSize, indexSize].some(n => n > 8)) {
    return fail()
  }
  let allocated = 0
  for (let i = 0; i < count; i++) {
    const id = num(p, lv < 2 ? 2 : 4, iloc.end)
    p += lv < 2 ? 2 : 4
    const method = lv ? num(p, 2, iloc.end) : 0
    if (lv) {
      p += 2
    }
    const ref = num(p, 2, iloc.end)
    p += 2
    const base = num(p, baseSize, iloc.end)
    p += baseSize
    const n = num(p, 2, iloc.end)
    p += 2
    if (ref || method > 1 || n > 4096 || locations.has(id)) {
      return fail()
    }
    const idat = method === 1 ? find(children, 'idat') : undefined
    const parts: Uint8Array[] = []
    for (let j = 0; j < n; j++) {
      num(p, indexSize, iloc.end)
      p += indexSize
      const offset = num(p, offSize, iloc.end)
      p += offSize
      const length = num(p, lenSize, iloc.end)
      p += lenSize
      const start = (idat?.start ?? 0) + base + offset
      if (!Number.isSafeInteger(start) || start + length > (idat?.end ?? bytes.length)) {
        return fail()
      }
      allocated += length
      if (allocated > bytes.length) {
        return fail()
      }
      parts.push(bytes.subarray(start, start + length))
    }
    locations.set(id, join(...parts))
  }
  const refs = new Map<string, number[]>()
  const iref = children.find(b => b.type === 'iref')
  if (iref) {
    const v = num(iref.start, 1, iref.end)
    if (v > 1) {
      return fail()
    }
    const n = v ? 4 : 2
    for (const b of boxes(iref.start + 4, iref.end)) {
      let p = b.start
      const id = num(p, n, b.end)
      p += n
      const count = num(p, 2, b.end)
      p += 2
      if (count > 4096) {
        return fail()
      }
      const ids: number[] = []
      for (let i = 0; i < count; i++) {
        ids.push(num(p, n, b.end))
        p += n
      }
      refs.set(`${b.type}:${id}`, ids)
    }
  }
  const prop = (id: number, type: string) => associations.get(id)?.find(b => b.type === type)
  const data = (id: number) => locations.get(id) ?? fail()
  const dimensions = (id: number) => {
    const s = prop(id, 'ispe') ?? fail()
    const width = num(s.start + 4, 4, s.end)
    const height = num(s.start + 8, 4, s.end)
    if (!width || !height || width > 16384 || height > 16384 || width * height > 64_000_000) {
      return fail()
    }
    return { width, height }
  }
  const image = (id: number, auxiliary = false): HeifImage => {
    const { width, height } = dimensions(id)
    const rootProps = associations.get(id) ?? []
    const allowed = ['ispe', 'hvcC', 'pixi', 'colr', 'irot', 'auxC']
    if (rootProps.some(b => !allowed.includes(b.type))) {
      return fail()
    }
    let ids = [id]
    let cols = 1
    let rows = 1
    if (types.get(id) === 'grid') {
      const grid = data(id)
      if (grid.length < 8 || grid[0] !== 0 || grid[1] > 1) {
        return fail()
      }
      const dv = new DataView(grid.buffer)
      rows = grid[2] + 1
      cols = grid[3] + 1
      const wide = grid[1] === 1
      if (wide && grid.length < 12) {
        return fail()
      }
      if (
        (wide ? dv.getUint32(4) : dv.getUint16(4)) !== width
        || (wide ? dv.getUint32(8) : dv.getUint16(6)) !== height
      ) {
        return fail()
      }
      ids = refs.get(`dimg:${id}`) ?? fail()
      if (ids.length !== rows * cols || ids.length > 256) {
        return fail()
      }
    }
    const tiles = ids.map((tileId) => {
      if (types.get(tileId) !== 'hvc1') {
        return fail()
      }
      if (tileId !== id && associations.get(tileId)?.some(b => !['ispe', 'hvcC', 'pixi', 'colr'].includes(b.type))) {
        return fail()
      }
      const h = prop(tileId, 'hvcC') ?? fail()
      const description = bytes.slice(h.start, h.end)
      if (description.length < 23 || description[0] !== 1 || description[17] & 7 || description[18] & 7) {
        return fail()
      }
      if ((description[16] & 3) !== (auxiliary ? 0 : 1)) {
        return fail()
      }
      let compatibility = num(h.start + 2, 4, h.end)
      let reversed = 0
      for (let i = 0; i < 32; i++) {
        reversed = reversed * 2 + (compatibility & 1)
        compatibility >>>= 1
      }
      const constraints = Array.from(description.slice(6, 12))
      while (constraints.at(-1) === 0) {
        constraints.pop()
      }
      const codec = `hvc1.${['', 'A', 'B', 'C'][description[1] >> 6]}${description[1] & 31}.${reversed.toString(16)}.${description[1] & 32 ? 'H' : 'L'}${description[12]}${constraints.length ? `.${constraints.map(v => v.toString(16)).join('.')}` : ''}`
      return { ...dimensions(tileId), codec, description, data: data(tileId) }
    })
    const first = tiles[0]
    if (
      tiles.some(
        t =>
          t.width !== first.width
          || t.height !== first.height
          || t.description.toString() !== first.description.toString(),
      )
    ) {
      return fail()
    }
    if (
      width > cols * first.width
      || height > rows * first.height
      || width <= (cols - 1) * first.width
      || height <= (rows - 1) * first.height
    ) {
      return fail()
    }
    const rot = prop(id, 'irot')
    const rotation = rot ? num(rot.start, 1, rot.end) : 0
    if (rotation > 3) {
      return fail()
    }
    let colorSpace: PredefinedColorSpace = 'srgb'
    if (!auxiliary) {
      const color = prop(id, 'colr') ?? fail()
      const kind = text.decode(bytes.subarray(color.start, color.start + 4))
      // ponytail: recognise Apple's standard Display P3 profile only; arbitrary
      // ICC transforms stay with libheif until there is a colour-managed decoder.
      const profile = bytes.subarray(color.start + 4, color.end)
      const profileId = Array.from(profile.subarray(84, 100), v => v.toString(16).padStart(2, '0')).join('')
      if (
        (kind === 'prof' || kind === 'rICC')
        && profile.length === 536
        && text.decode(profile.subarray(16, 20)) === 'RGB '
        && profileId === 'ecfda38e388547c36db4bd4f7ada182f'
      ) {
        colorSpace = 'display-p3'
      }
      else if (
        !(kind === 'nclx' && num(color.start + 4, 2, color.end) === 1 && num(color.start + 6, 2, color.end) === 13)
      ) {
        return fail()
      }
    }
    const standalone = () => {
      const itemIds = types.get(id) === 'grid' ? [id, ...ids] : [id]
      const itemProps = itemIds.map(itemId =>
        (associations.get(itemId) ?? []).filter(b => ['ispe', 'hvcC', 'pixi', 'irot'].includes(b.type)))
      const ftyp = box('ftyp', encoder.encode('heic'), u32(0), encoder.encode('mif1heic'))
      const makeMeta = (offset: number) => {
        let cursor = offset
        let propertyIndex = 0
        return full(
          'meta',
          0,
          full('hdlr', 0, u32(0), encoder.encode('pict'), new Uint8Array(13)),
          full('pitm', 0, u16(1)),
          full(
            'iloc',
            0,
            new Uint8Array([0x44, 0]),
            u16(itemIds.length),
            ...itemIds.map((itemId, i) => {
              const start = cursor
              cursor += data(itemId).length
              return join(u16(i + 1), u16(0), u16(1), u32(start), u32(data(itemId).length))
            }),
          ),
          full(
            'iinf',
            0,
            u16(itemIds.length),
            ...itemIds.map((itemId, i) =>
              box(
                'infe',
                u32((2 << 24) | (i ? 1 : 0)),
                u16(i + 1),
                u16(0),
                encoder.encode(types.get(itemId)!),
                new Uint8Array(1),
              )),
          ),
          ...(itemIds.length > 1
            ? [full('iref', 0, box('dimg', u16(1), u16(ids.length), ...ids.map((_, i) => u16(i + 2))))]
            : []),
          box(
            'iprp',
            box('ipco', ...itemProps.flat().map(b => box(b.type, bytes.subarray(b.start, b.end)))),
            box(
              'ipma',
              u32(1),
              u32(itemIds.length),
              ...itemProps.map((list, i) =>
                join(u16(i + 1), new Uint8Array([list.length]), ...list.map(() => u16(0x8000 | ++propertyIndex)))),
            ),
          ),
        )
      }
      const metadata = makeMeta(ftyp.length + makeMeta(0).length + 8)
      return new Blob([ftyp, metadata, box('mdat', ...itemIds.map(data))], { type: 'image/heic' })
    }
    return { width, height, cols, rotation, colorSpace, tiles, standalone }
  }
  const base = image(primary)
  // An unsupported auxiliary must not prevent the SDR hardware fast path.
  let gain: HeifPhoto['gain']
  try {
    for (const id of types.keys()) {
      const aux = prop(id, 'auxC')
      if (!aux || !refs.get(`auxl:${id}`)?.includes(primary)) {
        continue
      }
      if (
        text.decode(bytes.subarray(aux.start + 4, aux.end)).split('\0')[0] !== 'urn:com:apple:photo:2020:aux:hdrgainmap'
      ) {
        continue
      }
      for (const [metadataId, type] of types) {
        if (type !== 'mime' || !refs.get(`cdsc:${metadataId}`)?.includes(id)) {
          continue
        }
        const xmp = text.decode(data(metadataId))
        const headroom = Number(xmp.match(/<HDRGainMap:HDRGainMapHeadroom>([^<]+)</)?.[1])
        const version = Number(xmp.match(/<HDRGainMap:HDRGainMapVersion>([^<]+)</)?.[1])
        if (version === 131072 && Number.isFinite(headroom) && headroom > 1 && headroom <= 64) {
          gain = { image: image(id, true), headroom }
        }
      }
    }
  }
  catch {
    /* Optional HDR; keep the decoded SDR photo available. */
  }
  return { base, gain }
}
