import { gainMapColorTransforms } from './avif-gainmap-color'
import { iccGainMapTransforms, readICCMatrixProfile } from './gainmap-color'

export { UnsupportedICCProfile } from './gainmap-color'

export class UnsupportedAVIFColor extends Error {}

/** `colr` payloads, without BMFF headers; an ICC and nclx may coexist. */
export function readAVIFColor(properties: readonly Uint8Array[]) {
  let cicp: [number, number, number, number] | undefined
  let icc: Uint8Array | undefined
  const decoder = new TextDecoder()
  for (const data of properties) {
    if (data.length < 4) {
      throw new Error('Truncated AVIF colr property')
    }
    const type = decoder.decode(data.subarray(0, 4))
    if (type === 'nclx') {
      if (cicp || data.length !== 11) {
        throw new Error('Duplicate or malformed AVIF nclx property')
      }
      const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
      if (data[10] & 127) {
        throw new Error('Reserved AVIF nclx range bits')
      }
      cicp = [view.getUint16(4), view.getUint16(6), view.getUint16(8), data[10]]
    }
    else if (type === 'prof' || type === 'rICC') {
      if (icc) {
        throw new Error('Duplicate AVIF ICC property')
      }
      icc = data.subarray(4)
    }
    else {
      throw new UnsupportedAVIFColor(`Unsupported AVIF color type: ${type}`)
    }
  }
  // Never infer YUV matrix/range from an RGB ICC profile. Without nclx this
  // requires parsing the AV1 sequence header, which this demuxer does not do.
  if (!cicp) {
    throw new UnsupportedAVIFColor('AVIF gain-map extraction requires explicit nclx matrix/range')
  }
  return { cicp, icc }
}

/** ICC takes RGB precedence; nclx remains necessary for decoder YUV conversion. */
export function avifColorTransforms(color: ReturnType<typeof readAVIFColor>) {
  if (color.icc) {
    return iccGainMapTransforms(readICCMatrixProfile(color.icc))
  }
  const transforms = gainMapColorTransforms(color.cicp[0])
  if (!transforms) {
    throw new UnsupportedAVIFColor('Unsupported AVIF working primaries')
  }
  return transforms
}
