import { heicTo } from 'heic-to'

import type { HeifImage } from './heif'
import { parseHeif } from './heif'

async function decodeBase(image: HeifImage) {
  const first = image.tiles[0]
  const config: VideoDecoderConfig = {
    codec: first.codec,
    description: first.description,
    codedWidth: first.width,
    codedHeight: first.height,
    hardwareAcceleration: 'prefer-hardware',
  }
  if (!(await VideoDecoder.isConfigSupported(config)).supported) {
    throw new Error('HEVC decoder unavailable')
  }
  const canvas = new OffscreenCanvas(image.width, image.height)
  const context = canvas.getContext('2d', { colorSpace: image.colorSpace, alpha: false })
  if (!context || context.getImageData(0, 0, 1, 1, { colorSpace: image.colorSpace }).colorSpace !== image.colorSpace) {
    throw new Error('Unsupported canvas colour space')
  }
  let error: Error | undefined
  let outputs = 0
  const seen = new Set<number>()
  const decoder = new VideoDecoder({
    output(frame) {
      try {
        const i = frame.timestamp
        if (!Number.isInteger(i) || i < 0 || i >= image.tiles.length || seen.has(i)) {
          throw new Error('Invalid HEVC tile')
        }
        seen.add(i)
        context.drawImage(frame, (i % image.cols) * first.width, Math.floor(i / image.cols) * first.height)
        outputs++
      }
      catch (cause) {
        error = cause instanceof Error ? cause : new Error(String(cause))
      }
      finally {
        frame.close()
      }
    },
    error(cause) {
      error = cause
    },
  })
  try {
    decoder.configure(config)
    for (const [i, tile] of image.tiles.entries()) {
      decoder.decode(new EncodedVideoChunk({ type: 'key', timestamp: i, data: tile.data }))
      if (i % 8 === 7) {
        await decoder.flush()
        if (error) {
          throw error
        }
      }
    }
    await decoder.flush()
    if (error) {
      throw error
    }
    if (outputs !== image.tiles.length) {
      throw new Error('Incomplete HEVC grid')
    }
    if (!image.rotation) {
      return canvas
    }
    const rotated = new OffscreenCanvas(
      image.rotation % 2 ? image.height : image.width,
      image.rotation % 2 ? image.width : image.height,
    )
    const ctx = rotated.getContext('2d', { colorSpace: image.colorSpace, alpha: false })
    if (!ctx) {
      throw new Error('Cannot rotate HEIC')
    }
    ctx.translate(rotated.width / 2, rotated.height / 2)
    ctx.rotate((-image.rotation * Math.PI) / 2)
    ctx.drawImage(canvas, -image.width / 2, -image.height / 2)
    canvas.width = canvas.height = 1
    return rotated
  }
  catch (cause) {
    canvas.width = canvas.height = 1
    throw cause
  }
  finally {
    if (decoder.state !== 'closed') {
      decoder.close()
    }
  }
}

export async function convertHeicWithWebCodecs(file: Blob, type: string, quality: number) {
  if (typeof VideoDecoder === 'undefined' || typeof OffscreenCanvas === 'undefined') {
    throw new TypeError('WebCodecs unavailable')
  }
  const photo = parseHeif(await file.arrayBuffer())
  const canvas = await decodeBase(photo.base)
  try {
    const blob = await canvas.convertToBlob({ type, quality })
    let gainMap: { blob: Blob, headroom: number } | undefined
    if (photo.gain) {
      // WebCodecs clips monochrome HEVC on some platforms. Decode only the
      // small auxiliary with libheif, preserving all gain values.
      try {
        const bitmap = await heicTo({ blob: photo.gain.image.standalone(), type: 'bitmap' })
        try {
          if (Math.abs(bitmap.width / bitmap.height - canvas.width / canvas.height) > 0.01) {
            throw new Error('Mismatched HEIC gain map')
          }
          const gainCanvas = new OffscreenCanvas(bitmap.width, bitmap.height)
          try {
            const ctx = gainCanvas.getContext('2d', { alpha: false })
            if (!ctx) {
              throw new Error('Cannot encode gain map')
            }
            ctx.drawImage(bitmap, 0, 0)
            gainMap = { blob: await gainCanvas.convertToBlob({ type: 'image/png' }), headroom: photo.gain.headroom }
          }
          finally {
            gainCanvas.width = gainCanvas.height = 1
          }
        }
        finally {
          bitmap.close()
        }
      }
      catch (error) {
        console.warn('HEIC gain map unavailable; using SDR', error)
      }
    }
    return { blob, gainMap }
  }
  finally {
    canvas.width = canvas.height = 1
  }
}
