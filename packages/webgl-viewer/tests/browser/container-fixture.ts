import { box, boxes, bytes, full, join, one, Reader, uint } from '../../src/avif-bmff'

// Mutate only container metadata of our small v0 fixtures, never re-encode AV1.
export function withProperties(input: Uint8Array, additions: Map<number, Uint8Array[]>, essential = true) {
  const top = boxes(input)
  const meta = boxes(one(top, 'meta').data.subarray(4))
  const iprp = boxes(one(meta, 'iprp').data)
  const properties = boxes(one(iprp, 'ipco').data).map(p => p.raw)
  const reader = new Reader(one(iprp, 'ipma').data)
  if (reader.uint(4) !== 0) {
    throw new Error('Fixture ipma must be v0')
  }
  const count = reader.uint(4)
  const entries: Uint8Array[] = []
  for (let i = 0; i < count; i++) {
    const id = reader.uint(2)
    const n = reader.uint(1)
    const indices = Array.from(reader.take(n))
    for (const property of additions.get(id) ?? []) {
      properties.push(property)
      indices.push(properties.length | (essential ? 128 : 0))
    }
    entries.push(join(uint(id, 2), bytes(indices.length), bytes(...indices)))
  }
  const replacement = box('iprp', box('ipco', ...properties), full('ipma', 0, uint(count), ...entries))
  const delta = replacement.length - one(meta, 'iprp').raw.length
  const iloc = one(meta, 'iloc').data.slice()
  const locations = new Reader(iloc)
  if (locations.uint(4) !== 0 || locations.uint(2) !== 0x4400) {
    throw new Error('Fixture iloc must use 32-bit offsets')
  }
  const items = locations.uint(2)
  const view = new DataView(iloc.buffer)
  for (let i = 0; i < items; i++) {
    locations.uint(2)
    locations.uint(2)
    const extents = locations.uint(2)
    for (let e = 0; e < extents; e++) {
      const position = locations.position
      const offset = locations.uint(4)
      view.setUint32(position, offset + delta)
      locations.uint(4)
    }
  }
  return join(...top.map(p => p.type === 'meta' ? full('meta', 0, ...meta.map(m => m.type === 'iprp' ? replacement : m.type === 'iloc' ? box('iloc', iloc) : m.raw)) : p.raw))
}

export function aperture(width: number, height: number, cropWidth: number, cropHeight: number) {
  return box('clap', uint(cropWidth), uint(1), uint(cropHeight), uint(1), uint((cropWidth - width) >>> 0), uint(2), uint((cropHeight - height) >>> 0), uint(2))
}
