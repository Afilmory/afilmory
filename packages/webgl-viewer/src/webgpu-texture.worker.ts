/// <reference lib="webworker" />
import { extractJPEGGainMap } from './jpeg-gainmap'
import type {
  BitmapPlane,
  ImagePixels,
  Rect,
  TextureWorkerMessage,
  TextureWorkerRequest,
  TilePixels,
  TileRequest,
} from './webgpu-tiles'
import { OVERVIEW_SIZE, TILE_GUTTER } from './webgpu-tiles'

declare const self: DedicatedWorkerGlobalScope
let base: ImageBitmap | undefined
let gain: ImageBitmap | undefined

function post(message: TextureWorkerMessage, transfer: Transferable[] = []) {
  self.postMessage(message, transfer)
}

async function orientGainMap(bitmap: ImageBitmap, orientation: number) {
  if (orientation === 1) {
    return bitmap
  }
  const { width: w, height: h } = bitmap
  const swapped = orientation >= 5
  const canvas = new OffscreenCanvas(swapped ? h : w, swapped ? w : h)
  const context = canvas.getContext('2d', { colorSpace: 'srgb', alpha: false })
  if (!context) {
    throw new Error('Cannot orient gain map')
  }
  const transforms: Record<number, [number, number, number, number, number, number]> = {
    2: [-1, 0, 0, 1, w, 0],
    3: [-1, 0, 0, -1, w, h],
    4: [1, 0, 0, -1, 0, h],
    5: [0, 1, 1, 0, 0, 0],
    6: [0, 1, -1, 0, h, 0],
    7: [0, -1, -1, 0, h, w],
    8: [0, -1, 1, 0, 0, w],
  }
  context.setTransform(...transforms[orientation])
  context.drawImage(bitmap, 0, 0)
  bitmap.close()
  return canvas.transferToImageBitmap()
}

async function plane(bitmap: ImageBitmap, rect: Rect, level: number, ratioX = 1, ratioY = 1): Promise<BitmapPlane> {
  const downsample = 2 ** level
  const x = rect[0] * ratioX
  const y = rect[1] * ratioY
  const width = rect[2] * ratioX
  const height = rect[3] * ratioY
  const pad = TILE_GUTTER * downsample
  const sx = Math.max(0, Math.floor(x - pad))
  const sy = Math.max(0, Math.floor(y - pad))
  const sw = Math.min(bitmap.width, Math.ceil(x + width + pad)) - sx
  const sh = Math.min(bitmap.height, Math.ceil(y + height + pad)) - sy
  const resized = await createImageBitmap(bitmap, sx, sy, sw, sh, {
    resizeWidth: Math.max(1, Math.ceil(sw / downsample)),
    resizeHeight: Math.max(1, Math.ceil(sh / downsample)),
    resizeQuality: 'high',
  })
  return { bitmap: resized, uv: [(x - sx) / sw, (y - sy) / sh, width / sw, height / sh] }
}

async function tilePixels(tile: TileRequest): Promise<TilePixels> {
  if (!base) {
    throw new Error('Image not loaded')
  }
  const basePlane = await plane(base, tile.rect, tile.level)
  try {
    const gainPlane = gain
      ? await plane(gain, tile.rect, tile.level, gain.width / base.width, gain.height / base.height)
      : undefined
    return { ...tile, base: basePlane, gain: gainPlane }
  }
  catch (error) {
    basePlane.bitmap.close()
    throw error
  }
}

self.onmessage = async ({ data: request }: MessageEvent<TextureWorkerRequest>) => {
  try {
    if (request.type === 'tile') {
      const tile = await tilePixels(request.tile)
      post({ type: 'tile', tile }, [tile.base.bitmap, ...(tile.gain ? [tile.gain.bitmap] : [])])
      return
    }
    const response = await fetch(request.url)
    if (!response.ok) {
      throw new Error(`Image fetch failed: ${response.status}`)
    }
    const blob = await response.blob()
    const header = new Uint8Array(await blob.slice(0, 2).arrayBuffer())
    let extracted: ReturnType<typeof extractJPEGGainMap> = null
    let warning: string | undefined
    if (header[0] === 0xFF && header[1] === 0xD8) {
      try {
        extracted = extractJPEGGainMap(await blob.arrayBuffer())
      }
      catch (error) {
        warning = `HDR metadata could not be decoded: ${String(error)}`
      }
    }
    base = await createImageBitmap(extracted?.base ?? blob)
    if (extracted) {
      try {
        gain = await orientGainMap(await createImageBitmap(extracted.gain), extracted.orientation)
        if (Math.abs(gain.width / gain.height - base.width / base.height) > 0.01) {
          throw new Error('Gain map aspect ratio does not match photo')
        }
      }
      catch (error) {
        gain?.close()
        gain = undefined
        extracted = null
        warning = `HDR gain map could not be decoded: ${String(error)}`
      }
    }
    const level = Math.max(0, Math.ceil(Math.log2(Math.max(base.width, base.height) / OVERVIEW_SIZE)))
    const pixels = await tilePixels({ key: 'overview', level, rect: [0, 0, base.width, base.height] })
    const image: ImagePixels = {
      ...pixels,
      width: base.width,
      height: base.height,
      metadata: extracted?.metadata ?? null,
      toGainSpace: extracted?.toGainSpace,
      toDisplayP3: extracted?.toDisplayP3,
      wideGamut: extracted?.wideGamut ?? false,
      warning,
    }
    post({ type: 'ready', image }, [image.base.bitmap, ...(image.gain ? [image.gain.bitmap] : [])])
  }
  catch (error) {
    post({ type: 'error', key: request.type === 'tile' ? request.tile.key : undefined, message: String(error) })
  }
}
