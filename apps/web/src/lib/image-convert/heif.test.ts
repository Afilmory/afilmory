import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'

import { it } from 'vitest'

import { parseHeif } from './heif'

const u16 = (n: number) => Buffer.from([n >> 8, n & 255])
const u32 = (n: number) => {
  const b = Buffer.alloc(4)
  b.writeUInt32BE(n)
  return b
}
const box = (type: string, ...parts: Uint8Array[]) => {
  const body = Buffer.concat(parts)
  return Buffer.concat([u32(body.length + 8), Buffer.from(type), body])
}
const full = (type: string, version: number, ...parts: Uint8Array[]) => box(type, u32(version << 24), ...parts)
function fixture({ rotation = 3, crop = false, columns = 2, offset = 0, bitDepth = 0 } = {}) {
  const hvcc = Buffer.alloc(23)
  hvcc[0] = 1
  hvcc[1] = 1
  hvcc[16] = 1
  hvcc[17] = bitDepth
  const payloads = [Buffer.from([0, 0, 0, columns - 1, 0, 6, 0, 3]), Buffer.from([1, 2]), Buffer.from([3, 4])]
  const meta = (start: number) =>
    full(
      'meta',
      0,
      full('pitm', 0, u16(1)),
      full(
        'iinf',
        0,
        u16(3),
        ...['grid', 'hvc1', 'hvc1'].map((type, i) =>
          full('infe', 2, u16(i + 1), u16(0), Buffer.from(type), Buffer.from([0]))),
      ),
      full(
        'iloc',
        0,
        Buffer.from([0x44, 0]),
        u16(3),
        ...payloads.map((data, i) => {
          const pos = start
          start += data.length
          return Buffer.concat([u16(i + 1), u16(0), u16(1), u32(pos + offset), u32(data.length)])
        }),
      ),
      full('iref', 0, box('dimg', u16(1), u16(2), u16(2), u16(3))),
      box(
        'iprp',
        box(
          'ipco',
          full('ispe', 0, u32(6), u32(3)),
          full('ispe', 0, u32(4), u32(3)),
          box('hvcC', hvcc),
          box('colr', Buffer.from('nclx'), u16(1), u16(13), u16(1), Buffer.from([128])),
          box(crop ? 'clap' : 'irot', Buffer.from([rotation])),
        ),
        full('ipma', 0, u32(3), Buffer.from([0, 1, 3, 1, 4, 5, 0, 2, 2, 2, 3, 0, 3, 2, 2, 3])),
      ),
    )
  const result = Buffer.concat([meta(meta(0).length + 8), box('mdat', ...payloads)])
  return Uint8Array.from(result).buffer
}

it('hEIF grid preserves tile order, edge crop and rotation; rejects unsafe fast paths', () => {
  const { base, gain } = parseHeif(fixture())
  assert.deepEqual([base.width, base.height, base.cols, base.rotation], [6, 3, 2, 3])
  assert.deepEqual(
    base.tiles.map(t => [...t.data]),
    [
      [1, 2],
      [3, 4],
    ],
  )
  assert.equal(gain, undefined)
  for (const data of [
    fixture({ crop: true }),
    fixture({ columns: 3 }),
    fixture({ offset: 9999 }),
    fixture({ bitDepth: 2 }),
    fixture().slice(0, -1),
    new ArrayBuffer(4),
  ]) {
    assert.throws(() => parseHeif(data), /Unsupported|malformed/)
  }
})
