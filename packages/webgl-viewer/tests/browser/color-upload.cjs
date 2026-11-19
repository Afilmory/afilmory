// Separate browser color-upload behavior from AVIF decoding and gain-map math.
module.exports = async function colorUpload(browser, url) {
  const page = await browser.newPage()
  await page.goto(url)
  try {
    return await page.evaluate(async () => {
      const adapter = await navigator.gpu.requestAdapter()
      const device = await adapter.requestDevice()
      const source = new OffscreenCanvas(1, 1)
      const ctx = source.getContext('2d', { colorSpace: 'srgb' })
      ctx.fillStyle = '#704030'
      ctx.fillRect(0, 0, 1, 1)
      const bitmap = await createImageBitmap(source)
      const p3 = new OffscreenCanvas(1, 1)
      p3.getContext('2d', { colorSpace: 'display-p3' }).drawImage(source, 0, 0)
      const p3Bitmap = await createImageBitmap(p3)
      const half = (b) => {
        const e = (b >> 10) & 31
        return (b & 32768 ? -1 : 1) * (e ? (1 + (b & 1023) / 1024) * 2 ** (e - 15) : (b & 1023) * 2 ** -24)
      }
      const results = []
      try {
        for (const [kind, image] of [['srgb-canvas', source], ['srgb-bitmap', bitmap], ['p3-canvas', p3], ['p3-bitmap', p3Bitmap]]) {
          for (const colorSpace of ['srgb', 'display-p3']) {
            const texture = device.createTexture({ size: [1, 1], format: 'rgba16float', usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.COPY_SRC | GPUTextureUsage.RENDER_ATTACHMENT })
            const buffer = device.createBuffer({ size: 256, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ })
            try {
              device.queue.copyExternalImageToTexture({ source: image }, { texture, colorSpace }, [1, 1])
              const encoder = device.createCommandEncoder()
              encoder.copyTextureToBuffer({ texture }, { buffer, bytesPerRow: 256 }, [1, 1])
              device.queue.submit([encoder.finish()])
              await buffer.mapAsync(GPUMapMode.READ)
              const rgb = Array.from(new Uint16Array(buffer.getMappedRange()).slice(0, 3), half)
              buffer.unmap()
              results.push({ kind, colorSpace, rgb })
            }
            finally {
              texture.destroy()
              buffer.destroy()
            }
          }
        }
      }
      finally {
        bitmap.close()
        p3Bitmap.close()
        device.destroy()
      }
      const pixels = p3.getContext('2d').getImageData(0, 0, 1, 1, { colorSpace: 'display-p3', pixelFormat: 'rgba-float16' })
      return {
        userAgent: navigator.userAgent,
        devicePixelRatio: window.devicePixelRatio,
        nativeDynamicRangeHigh: window.matchMedia('(dynamic-range: high)').matches,
        uploads: results,
        canvasP3: {
          colorSpace: pixels.colorSpace,
          pixelFormat: pixels.pixelFormat,
          bytesPerElement: pixels.data.BYTES_PER_ELEMENT,
          values: Array.from(pixels.data),
        },
      }
    })
  }
  finally { await page.close() }
}
