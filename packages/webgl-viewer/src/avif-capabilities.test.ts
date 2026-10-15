import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { readFileSync } from 'node:fs'

import { it } from 'vitest'

import { aperture, withProperties } from '../tests/browser/container-fixture'
import { box, bytes, text } from './avif-bmff'
import { inspectAVIFGainMap } from './avif-gainmap'

const fixture = (name = 'gainmap-color-12') => new Uint8Array(readFileSync(new URL(`./fixtures/${name}.avif`, import.meta.url)))
const inspect = (value: Uint8Array) => inspectAVIFGainMap(value.slice().buffer)
const add = (base: Uint8Array[], gain = base, tone: Uint8Array[] = []) => withProperties(fixture(), new Map([[1, base], [3, gain], [2, tone]]))

it('preserves supported clean aperture, rotation and mirror properties', () => {
  for (const suffix of ['r1', 'r2', 'r3', 'm0', 'm1', 'crop', 'combo']) {
    assert.equal(inspect(fixture(`gainmap-transform-${suffix}`)).status, 'supported')
  }
})

it('rejects mismatched, fractional, output-level and noncanonical transforms', () => {
  const rotate = box('irot', bytes(1))
  const mirror = box('imir', bytes(1))
  assert.equal(inspect(add([rotate], [])).status, 'unsupported')
  assert.equal(inspect(add([mirror, rotate])).status, 'unsupported')
  assert.equal(inspect(add([rotate, rotate])).status, 'unsupported')
  assert.equal(inspect(add([], [], [rotate])).status, 'unsupported')
  assert.equal(inspect(add([aperture(32, 24, 24, 16)], [aperture(16, 12, 10, 8)])).status, 'unsupported')
  const fractional = aperture(32, 24, 24, 16)
  new DataView(fractional.buffer).setUint32(8 + 4, 7)
  assert.equal(inspect(add([fractional])).status, 'unsupported')
})

it('classifies malformed transforms as invalid', () => {
  for (const property of [box('irot', bytes(4)), box('imir', bytes(2)), box('irot', bytes(0, 0))]) {
    assert.equal(inspect(add([property])).status, 'invalid')
  }
  assert.equal(inspect(add([aperture(32, 24, 40, 24)])).status, 'invalid')
})

it('ignores unknown nonessential properties and rejects essential ones', () => {
  const extra = new Map([[1, [box('zzzz', bytes(1))]]])
  assert.equal(inspect(withProperties(fixture(), extra, false)).status, 'supported')
  assert.equal(inspect(withProperties(fixture(), extra, true)).status, 'unsupported')
})

it('accepts matrix ICC with nclx but rejects gain ICC and LUT profiles', () => {
  assert.equal(inspect(fixture('gainmap-icc')).status, 'supported')
  const icc = new Uint8Array(readFileSync(new URL('./fixtures/srgb-matrix.icc', import.meta.url)))
  assert.equal(inspect(add([], [box('colr', text('prof'), icc)])).status, 'unsupported')
  const lut = icc.slice()
  lut.set(text('A2B0'), 132)
  assert.equal(inspect(add([box('colr', text('prof'), lut)])).status, 'unsupported')
})

it('rejects grid items, auxiliary references and HDR-primary transfer', () => {
  for (const [from, to] of [['av01', 'grid'], ['dimg', 'auxl']]) {
    const input = fixture()
    input.set(text(to), Buffer.from(input).indexOf(from))
    assert.equal(inspect(input).status, 'unsupported')
  }
  const input = fixture()
  const index = Buffer.from(input).indexOf('nclx')
  input[index + 7] = 16
  assert.equal(inspect(input).status, 'unsupported')
  assert.equal(inspect(add([box('auxC', bytes(0, 0, 0, 0))])).status, 'unsupported')
})
