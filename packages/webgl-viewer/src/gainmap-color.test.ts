import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { it } from 'vitest'

import { gainMapColorTransforms } from './avif-gainmap-color'
import { avifColorTransforms, readAVIFColor, UnsupportedAVIFColor } from './avif-gainmap-icc'
import { iccGainMapTransforms, P3_TO_XYZ, readICCMatrixProfile, SRGB_TO_XYZ, UnsupportedICCProfile } from './gainmap-color'

const encoder = new TextEncoder()

// Small public synthetic matrix profile: D50 colorants + gamma curves.
export function syntheticICC(space = SRGB_TO_XYZ, extraTags: [string, Uint8Array][] = []) {
  const tags: [string, Uint8Array][] = []
  for (let c = 0; c < 3; c++) {
    const xyz = new Uint8Array(20)
    xyz.set(encoder.encode('XYZ '))
    const view = new DataView(xyz.buffer)
    for (let i = 0; i < 3; i++) {
      view.setInt32(8 + i * 4, Math.round(space[c * 3 + i] * 65536))
    }
    tags.push([['rXYZ', 'gXYZ', 'bXYZ'][c], xyz])
    const curve = new Uint8Array(14)
    curve.set(encoder.encode('curv'))
    new DataView(curve.buffer).setUint32(8, 1)
    new DataView(curve.buffer).setUint16(12, 563)
    tags.push([['rTRC', 'gTRC', 'bTRC'][c], curve])
  }
  tags.push(...extraTags)
  const size = 132 + 12 * tags.length + tags.reduce((sum, [, tag]) => sum + Math.ceil(tag.length / 4) * 4, 0)
  const profile = new Uint8Array(size)
  const view = new DataView(profile.buffer)
  view.setUint32(0, size)
  profile[8] = 4
  for (const [offset, value] of [[12, 'mntr'], [16, 'RGB '], [20, 'XYZ '], [36, 'acsp']] as const) {
    profile.set(encoder.encode(value), offset)
  }
  for (const [i, value] of [0.9642, 1, 0.8249].entries()) {
    view.setInt32(68 + i * 4, Math.round(value * 65536))
  }
  view.setUint32(128, tags.length)
  let offset = 132 + 12 * tags.length
  for (const [i, [name, tag]] of tags.entries()) {
    profile.set(encoder.encode(name), 132 + i * 12)
    view.setUint32(136 + i * 12, offset)
    view.setUint32(140 + i * 12, tag.length)
    profile.set(tag, offset)
    offset += Math.ceil(tag.length / 4) * 4
  }
  return profile
}

function colr(type: string, data: Uint8Array) {
  const result = new Uint8Array(4 + data.length)
  result.set(encoder.encode(type))
  result.set(data, 4)
  return result
}

const nclx = colr('nclx', new Uint8Array([0, 12, 0, 13, 0, 6, 128]))

it('reads a real LittleCMS sRGB matrix/TRC profile with D50-adapted primaries', () => {
  const profile = readFileSync(new URL('./fixtures/srgb-matrix.icc', import.meta.url))
  const matrix = readICCMatrixProfile(profile)
  // LittleCMS uses ICC's rounded D50 (Z=0.8249); published sRGB matrices
  // often use chromaticity-derived D50 (Z≈0.8252). This is not D65 data.
  for (let i = 0; i < 9; i++) {
    assert.ok(Math.abs(matrix[i] - SRGB_TO_XYZ[i]) < 0.0004)
  }
})

it('keeps D50 ICC and D65 CICP conversion equivalent for the same RGB primaries', () => {
  for (const [space, primary] of [[SRGB_TO_XYZ, 1], [P3_TO_XYZ, 12]] as const) {
    const icc = iccGainMapTransforms(readICCMatrixProfile(syntheticICC(space)))
    const cicp = gainMapColorTransforms(primary)!
    for (let i = 0; i < 9; i++) {
      assert.ok(Math.abs(icc.toDisplayP3[i] - cicp.toDisplayP3[i]) < 0.0003)
    }
  }
})

it('accepts v2 profiles and ICC slices with nonzero byte offsets', () => {
  const original = syntheticICC()
  original[8] = 2
  const padded = new Uint8Array(original.length + 17)
  padded.set(original, 17)
  assert.deepEqual(readICCMatrixProfile(padded.subarray(17)), readICCMatrixProfile(original))
})

it('uses ICC RGB matrix over coexisting nclx primaries, preserving nclx YUV parameters', () => {
  const color = readAVIFColor([nclx, colr('prof', syntheticICC())])
  assert.deepEqual(color.cicp, [12, 13, 6, 128])
  assert.deepEqual(avifColorTransforms(color), iccGainMapTransforms(readICCMatrixProfile(syntheticICC())))
  assert.deepEqual(avifColorTransforms(readAVIFColor([nclx])), gainMapColorTransforms(12))
})

it('rejects LUT profiles even if matrix tags are present', () => {
  assert.throws(() => readICCMatrixProfile(syntheticICC(SRGB_TO_XYZ, [['A2B0', new Uint8Array(8)]])), UnsupportedICCProfile)
})

it('rejects truncated headers, table bounds, duplicate tags and singular matrices', () => {
  for (const length of [0, 100, 131, 200]) {
    assert.throws(() => readICCMatrixProfile(syntheticICC().subarray(0, length)))
  }
  const profile = syntheticICC()
  new DataView(profile.buffer).setUint32(136, 0xFFFFFFFC)
  assert.throws(() => readICCMatrixProfile(profile), /bounds/)
  assert.throws(() => readICCMatrixProfile(syntheticICC(SRGB_TO_XYZ, [['rTRC', new Uint8Array(8)]])), /duplicate/)
  assert.throws(() => readICCMatrixProfile(syntheticICC([0, 0, 0, 0, 0, 0, 0, 0, 0])), /colorants/)
})

it('rejects malformed or ambiguous color properties and ICC without YUV information', () => {
  assert.throws(() => readAVIFColor([nclx, nclx]), /Duplicate/)
  assert.throws(() => readAVIFColor([colr('prof', syntheticICC())]), UnsupportedAVIFColor)
  assert.throws(() => readAVIFColor([nclx, colr('prof', syntheticICC()), colr('rICC', syntheticICC())]), /Duplicate/)
})

it('rejects partial tag overlap and nonmonotonic sampled curves', () => {
  const overlap = syntheticICC()
  const view = new DataView(overlap.buffer)
  view.setUint32(136 + 12, view.getUint32(136) + 4)
  assert.throws(() => readICCMatrixProfile(overlap), /overlapping/)

  const original = syntheticICC()
  const profile = new Uint8Array(original.length + 16)
  profile.set(original)
  profile.set(encoder.encode('curv'), original.length)
  const header = new DataView(profile.buffer)
  header.setUint32(0, profile.length)
  header.setUint32(136 + 12, original.length)
  header.setUint32(140 + 12, 16)
  header.setUint32(original.length + 8, 2)
  header.setUint16(original.length + 12, 65535)
  header.setUint16(original.length + 14, 0)
  assert.throws(() => readICCMatrixProfile(profile), /Nonmonotonic/)
})

it('accepts sRGB parametric curves and rejects unknown or discontinuous functions', () => {
  const profile = syntheticICC()
  // Replace the three fixed gamma tags using their directory entries.
  function para(kind: number, discontinuous = false) {
    const tag = new Uint8Array(32)
    tag.set(encoder.encode('para'))
    const view = new DataView(tag.buffer)
    view.setUint16(8, kind)
    for (const [i, value] of [2.4, 1 / 1.055, 0.055 / 1.055, discontinuous ? 1 : 1 / 12.92, 0.04045].entries()) {
      view.setInt32(12 + 4 * i, Math.round(value * 65536))
    }
    const result = new Uint8Array(profile.length + 32)
    result.set(profile)
    result.set(tag, profile.length)
    const header = new DataView(result.buffer)
    header.setUint32(0, result.length)
    for (const index of [1, 3, 5]) {
      header.setUint32(136 + 12 * index, profile.length)
      header.setUint32(140 + 12 * index, 32)
    }
    return result
  }
  assert.ok(readICCMatrixProfile(para(3)))
  assert.throws(() => readICCMatrixProfile(para(9)), UnsupportedICCProfile)
  assert.throws(() => readICCMatrixProfile(para(3, true)), /Discontinuous/)
})
