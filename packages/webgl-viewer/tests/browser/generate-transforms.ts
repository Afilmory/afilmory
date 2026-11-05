import { readFileSync, writeFileSync } from 'node:fs'

import { box, boxes, bytes, one, Reader, text } from '../../src/avif-bmff'
import { aperture, withProperties } from './container-fixture'

const fixture = new URL('../../src/fixtures/gainmap-color-12.avif', import.meta.url)
const input = new Uint8Array(readFileSync(fixture))
const unsupported = input.slice()
const locations = new Reader(one(boxes(one(boxes(unsupported), 'meta').data.subarray(4)), 'iloc').data)
locations.take(6)
const count = locations.uint(2)
for (let i = 0; i < count; i++) {
  const id = locations.uint(2)
  locations.take(4)
  const offset = locations.uint(4)
  locations.uint(4)
  if (id === 2) {
    unsupported[offset] = 1
  }
}
writeFileSync(new URL('../../src/fixtures/gainmap-unsupported.avif', import.meta.url), unsupported)
const icc = new Uint8Array(readFileSync(new URL('../../src/fixtures/srgb-matrix.icc', import.meta.url)))
writeFileSync(new URL('../../src/fixtures/gainmap-icc.avif', import.meta.url), withProperties(new Uint8Array(readFileSync(new URL('../../src/fixtures/gainmap-color-1.avif', import.meta.url))), new Map([[1, [box('colr', text('prof'), icc)]]])))
const baseWorking = new Uint8Array(readFileSync(new URL('../../src/fixtures/gainmap-color-1.avif', import.meta.url)))
const baseLocations = new Reader(one(boxes(one(boxes(baseWorking), 'meta').data.subarray(4)), 'iloc').data)
baseLocations.take(6)
const baseCount = baseLocations.uint(2)
for (let i = 0; i < baseCount; i++) {
  const id = baseLocations.uint(2)
  baseLocations.take(4)
  const offset = baseLocations.uint(4)
  baseLocations.uint(4)
  if (id === 2) {
    baseWorking[offset + 5] |= 64
  }
}
writeFileSync(new URL('../../src/fixtures/gainmap-color-base.avif', import.meta.url), baseWorking)
writeFileSync(new URL('../../src/fixtures/gainmap-icc-base.avif', import.meta.url), withProperties(baseWorking, new Map([[1, [box('colr', text('prof'), icc)]]])))
for (const [name, operations] of Object.entries({ r1: [1], r2: [2], r3: [3], m0: [0], m1: [1], crop: [], combo: [1, 1] })) {
  const props = (gain: boolean) => {
    const list: Uint8Array[] = []
    if (['crop', 'combo'].includes(name)) {
      list.push(aperture(gain ? 16 : 32, gain ? 12 : 24, gain ? 12 : 24, gain ? 8 : 16))
    }
    if (name.startsWith('r') || name === 'combo') {
      list.push(box('irot', bytes(operations[0])))
    }
    if (name.startsWith('m') || name === 'combo') {
      list.push(box('imir', bytes(operations.at(-1)!)))
    }
    return list
  }
  const source = ['m0', 'crop'].includes(name) ? new Uint8Array(readFileSync(new URL('../../src/fixtures/gainmap-12.avif', import.meta.url))) : input
  writeFileSync(new URL(`../../src/fixtures/gainmap-transform-${name}.avif`, import.meta.url), withProperties(source, new Map([[1, props(false)], [3, props(true)]])))
}
