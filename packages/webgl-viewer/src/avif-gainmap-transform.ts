import type { Box } from './avif-bmff'
import { one, Reader } from './avif-bmff'

export class UnsupportedAVIFTransform extends Error {}
const names = ['clap', 'irot', 'imir']

// MIAF order: aperture, rotation, mirror. Keep these properties in the remuxed
// image so browser decoding applies them once, without an 8-bit canvas roundtrip.
export function gainMapTransformSignature(properties: Box[]) {
  const dimensions = new Reader(one(properties, 'ispe').data)
  if (dimensions.uint(4)) {
    throw new Error('Invalid ispe')
  }
  const width = dimensions.uint(4)
  const height = dimensions.uint(4)
  const selected = properties.filter(p => names.includes(p.type))
  let previous = -1
  const signature: number[] = []
  for (const property of selected) {
    const index = names.indexOf(property.type)
    if (index <= previous) {
      throw new UnsupportedAVIFTransform('Repeated or noncanonical transform order')
    }
    previous = index
    const reader = new Reader(property.data)
    if (property.type === 'clap') {
      const fraction = () => {
        let numerator = reader.uint(4)
        if (numerator >= 0x80000000) {
          numerator -= 0x100000000
        }
        const denominator = reader.uint(4)
        if (!denominator) {
          throw new Error('Zero clean-aperture denominator')
        }
        return numerator / denominator
      }
      const cropWidth = fraction()
      const cropHeight = fraction()
      const x = (width - cropWidth) / 2 + fraction()
      const y = (height - cropHeight) / 2 + fraction()
      if (![x, y, cropWidth, cropHeight].every(Number.isInteger)) {
        throw new UnsupportedAVIFTransform('Fractional crop needs resampling')
      }
      if (x < 0 || y < 0 || cropWidth <= 0 || cropHeight <= 0 || x + cropWidth > width || y + cropHeight > height) {
        throw new Error('Clean aperture outside image')
      }
      signature.push(0, x / width, y / height, cropWidth / width, cropHeight / height)
    }
    else {
      const value = reader.uint(1)
      if (value > (property.type === 'irot' ? 3 : 1)) {
        throw new Error('Reserved transform bits')
      }
      signature.push(index, value)
    }
    if (reader.position !== reader.bytes.length) {
      throw new Error('Trailing transform bytes')
    }
  }
  return signature
}

export function validateGainMapTransforms(base: Box[], gain: Box[], tone: Box[]) {
  if (tone.some(p => names.includes(p.type))) {
    throw new UnsupportedAVIFTransform('Transforms on tmap output are not supported')
  }
  const a = gainMapTransformSignature(base)
  const b = gainMapTransformSignature(gain)
  if (a.length !== b.length || a.some((value, i) => Math.abs(value - b[i]) > 1e-9)) {
    throw new UnsupportedAVIFTransform('Base and gain-map transforms do not describe the same normalized image region')
  }
}
