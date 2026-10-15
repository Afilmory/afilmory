// Decode the same file from bytes supplied by the harness, without a second
// image request. Do not route this diagnostic through the production shader.
module.exports = async function baseDecodeProbe(page, bytes) {
  return page.evaluate(async (bytes) => {
    const { extractAVIFGainMap } = await import('/engine.js')
    const { base } = extractAVIFGainMap(new Uint8Array(bytes).buffer)
    const decoder = new ImageDecoder({ data: await base.arrayBuffer(), type: 'image/avif', colorSpaceConversion: 'none' })
    let frame
    let bitmap
    try {
      frame = (await decoder.decode()).image
      const match = /^(I420|I444)(?:P(10|12))?$/.exec(frame.format)
      if (!match) {
        throw new Error(`Unsupported probe format: ${frame.format}`)
      }
      const depth = Number(match[2] || 8)
      const rect = frame.visibleRect
      const buffer = new Uint8Array(frame.allocationSize({ rect }))
      const layouts = await frame.copyTo(buffer, { rect })
      const view = new DataView(buffer.buffer)
      const planes = layouts.map(({ offset, stride }, channel) => {
        const subsampled = match[1] === 'I420' && channel > 0
        const width = subsampled ? Math.ceil(rect.width / 2) : rect.width
        const height = subsampled ? Math.ceil(rect.height / 2) : rect.height
        const values = []
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            values.push(depth > 8 ? view.getUint16(offset + y * stride + x * 2, true) : view.getUint8(offset + y * stride + x))
          }
        }
        return { width, height, values }
      })
      bitmap = await createImageBitmap(base)
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
      const ctx = canvas.getContext('2d', { colorSpace: 'display-p3', colorType: 'float16' })
      if (ctx.getContextAttributes().colorType !== 'float16') {
        throw new Error('Probe requires float16 canvas')
      }
      ctx.drawImage(bitmap, 0, 0)
      const data = ctx.getImageData(0, 0, bitmap.width, bitmap.height, { colorSpace: 'display-p3', pixelFormat: 'rgba-float16' }).data
      if (data.BYTES_PER_ELEMENT !== 2) {
        throw new Error('Probe requires float16 readback')
      }
      return {
        yuv: { depth, planes },
        bitmapPixels: Array.from({ length: bitmap.width * bitmap.height }, (_, i) => Array.from(data.slice(i * 4, i * 4 + 3))),
      }
    }
    finally {
      frame?.close()
      bitmap?.close()
      decoder.close()
    }
  }, bytes)
}
