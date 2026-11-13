import { thumbHashToRGBA } from 'thumbhash'

export interface PhotoColor {
  h: number
  s: number
  l: number
}

export const NEUTRAL_SATURATION = 0.05

export const rgbToHsl = (r: number, g: number, b: number): PhotoColor => {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const delta = max - min
  if (delta === 0) {
    return { h: 0, s: 0, l }
  }
  const s = delta / (1 - Math.abs(2 * l - 1))
  const sector = max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4
  return { h: (sector * 60 + 360) % 360, s: Math.min(1, s), l }
}

export const colorOfThumbHash = (hash: Uint8Array | null): PhotoColor | null => {
  if (!hash || hash.length < 5) {
    return null
  }
  try {
    const { rgba } = thumbHashToRGBA(hash)
    const pixels = rgba.length / 4
    let x = 0
    let y = 0
    let lightness = 0
    for (let offset = 0; offset < rgba.length; offset += 4) {
      const pixel = rgbToHsl(rgba[offset] / 255, rgba[offset + 1] / 255, rgba[offset + 2] / 255)
      const chroma = pixel.s * (1 - Math.abs(2 * pixel.l - 1))
      const angle = (pixel.h * Math.PI) / 180
      x += Math.cos(angle) * chroma
      y += Math.sin(angle) * chroma
      lightness += pixel.l
    }
    return {
      h: ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360,
      s: Math.hypot(x, y) / pixels,
      l: lightness / pixels,
    }
  }
  catch {
    return null
  }
}

export const hueDistance = (a: number, b: number) => {
  const distance = Math.abs(a - b) % 360
  return Math.min(distance, 360 - distance)
}

export const isNeutral = (color: PhotoColor | null) => !color || color.s < NEUTRAL_SATURATION

export const createColorCache = () => {
  const cache = new Map<string, PhotoColor | null>()
  return {
    colorsOf: (photos: { id: string, thumbHash: Uint8Array | null }[]) =>
      photos.map((photo) => {
        let color = cache.get(photo.id)
        if (color === undefined) {
          color = colorOfThumbHash(photo.thumbHash)
          cache.set(photo.id, color)
        }
        return color
      }),
  }
}
