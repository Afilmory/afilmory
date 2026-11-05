const assert = require('node:assert/strict')

module.exports = async function check(page, url) {
  await page.goto(url)
  const result = await page.evaluate(async () => {
    const { needsExplicitColorConversion, uploadColorImage } = await import('/upload.js')
    const adapter = await navigator.gpu.requestAdapter()
    const device = await adapter.requestDevice()
    const errors = []
    device.addEventListener('uncapturederror', e => errors.push(e.error.message))
    const explicit = await needsExplicitColorConversion(device)
    const cases = []
    const half = (bits) => {
      const exponent = bits >> 10 & 31
      return (bits & 32768 ? -1 : 1) * (exponent ? (1 + (bits & 1023) / 1024) * 2 ** (exponent - 15) : (bits & 1023) * 2 ** -24)
    }
    try {
      for (const [colorSpace, color, expected] of [
        ['srgb', '#704030', [105 / 255, 66 / 255, 51 / 255, 1]],
        ['display-p3', 'color(display-p3 0 1 0)', [0, 1, 0, 1]],
        ['display-p3', 'color(display-p3 0.8 0.2 0.4 / 0.5)', [0.8, 0.2, 0.4, 0.5]],
      ]) {
        const canvas = new OffscreenCanvas(3, 2)
        const ctx = canvas.getContext('2d', { colorSpace })
        ctx.fillStyle = color
        ctx.fillRect(0, 0, 3, 2)
        // Include decoded JPEGs as well as canvas bitmaps. Lossy JPEG values
        // use an independent Canvas P3 decode reference rather than source RGB.
        for (const kind of expected[3] === 1 ? ['bitmap', 'jpeg'] : ['bitmap']) {
          const bitmap = await createImageBitmap(kind === 'jpeg' ? await canvas.convertToBlob({ type: 'image/jpeg', quality: 1 }) : canvas)
          const reference = new OffscreenCanvas(3, 2).getContext('2d', { colorSpace: 'display-p3' })
          reference.drawImage(bitmap, 0, 0)
          const wanted = kind === 'jpeg'
            ? Array.from(reference.getImageData(0, 0, 1, 1, { colorSpace: 'display-p3' }).data, v => v / 255)
            : expected
          try {
            for (const format of ['rgba8unorm', 'rgba16float']) {
              for (const forceExplicit of [explicit, true]) {
                const texture = device.createTexture({ size: [3, 2], format, usage: GPUTextureUsage.COPY_SRC | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT })
                const buffer = device.createBuffer({ size: 512, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ })
                try {
                  uploadColorImage(device, texture, bitmap, forceExplicit)
                  const encoder = device.createCommandEncoder()
                  encoder.copyTextureToBuffer({ texture }, { buffer, bytesPerRow: 256 }, [3, 2])
                  device.queue.submit([encoder.finish()])
                  await buffer.mapAsync(GPUMapMode.READ)
                  const mapped = buffer.getMappedRange()
                  let maxError = 0
                  for (let y = 0; y < 2; y++) {
                    const row = format === 'rgba16float'
                      ? Array.from(new Uint16Array(mapped, y * 256, 12), half)
                      : Array.from(new Uint8Array(mapped, y * 256, 12), v => v / 255)
                    row.forEach((v, i) => {
                      maxError = Math.max(maxError, Math.abs(v - wanted[i % 4]))
                    })
                  }
                  buffer.unmap()
                  cases.push({ colorSpace, color, kind, format, forceExplicit, maxError })
                }
                finally {
                  buffer.destroy()
                  texture.destroy()
                }
              }
            }
          }
          finally { bitmap.close() }
        }
      }
      // Reject an unusable conversion path instead of silently rendering the
      // wrong colors. This also exercises cleanup after both probe attempts.
      const copy = device.queue.copyExternalImageToTexture.bind(device.queue)
      const textures = new Set()
      const buffers = new Set()
      for (const [method, resources] of [['createTexture', textures], ['createBuffer', buffers]]) {
        const create = device[method].bind(device)
        device[method] = (descriptor) => {
          const resource = create(descriptor)
          resources.add(resource)
          const destroy = resource.destroy.bind(resource)
          resource.destroy = () => {
            resources.delete(resource)
            destroy()
          }
          return resource
        }
      }
      device.queue.copyExternalImageToTexture = (_source, destination, size) => {
        copy({ source: new ImageData(new Uint8ClampedArray([0, 0, 0, 255]), 1, 1) }, destination, size)
      }
      let rejected = false
      try {
        await needsExplicitColorConversion(device)
      }
      catch (error) {
        rejected = error.message === 'WebGPU image color conversion is not reliable'
      }
      finally { device.queue.copyExternalImageToTexture = copy }
      await device.queue.onSubmittedWorkDone()
      return { userAgent: navigator.userAgent, explicit, cases, errors, rejected, probeResources: textures.size + buffers.size }
    }
    finally { device.destroy() }
  })
  assert.deepEqual(result.errors, [])
  assert.equal(result.rejected, true)
  assert.equal(result.probeResources, 0)
  for (const c of result.cases) {
    assert.ok(c.maxError <= 2 / 255, JSON.stringify(c))
  }
  return result
}
