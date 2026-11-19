/// <reference types="@webgpu/types" />

function readDisplayP3(source: ImageBitmap | OffscreenCanvas) {
  const canvas = new OffscreenCanvas(source.width, source.height)
  try {
    const context = canvas.getContext('2d', { colorSpace: 'display-p3', colorType: 'float16' })
    if (!context) {
      throw new Error('Display P3 image conversion is not available')
    }
    context.drawImage(source, 0, 0)
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height, {
      colorSpace: 'display-p3',
      pixelFormat: 'rgba-float16',
    })
    if (pixels.colorSpace !== 'display-p3') {
      throw new Error('Display P3 image conversion is not available')
    }
    return pixels
  }
  finally {
    canvas.width = canvas.height = 0
  }
}

// Probe the actual upload, not the user agent: some implementations convert
// ImageBitmap to sRGB even when the destination explicitly requests Display P3.
export async function needsExplicitColorConversion(device: GPUDevice): Promise<boolean> {
  const canvas = new OffscreenCanvas(1, 1)
  const context = canvas.getContext('2d', { colorSpace: 'srgb' })
  if (!context) {
    throw new Error('Image color conversion is not available')
  }
  context.fillStyle = '#704030'
  context.fillRect(0, 0, 1, 1)
  const bitmap = await createImageBitmap(canvas)
  let texture: GPUTexture | undefined
  let buffer: GPUBuffer | undefined
  try {
    texture = device.createTexture({
      size: [1, 1],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.COPY_SRC | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
    })
    buffer = device.createBuffer({ size: 256, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ })
    const target = texture
    const readback = buffer
    async function matches(source: ImageBitmap | ImageData) {
      device.queue.copyExternalImageToTexture({ source }, { texture: target, colorSpace: 'display-p3' }, [1, 1])
      const encoder = device.createCommandEncoder()
      encoder.copyTextureToBuffer({ texture: target }, { buffer: readback, bytesPerRow: 256 }, [1, 1])
      device.queue.submit([encoder.finish()])
      await readback.mapAsync(GPUMapMode.READ)
      // Independent sRGB -> Display P3 conversion of #704030, rounded to 8 bits.
      const expected = [105, 66, 51, 255]
      const actual = new Uint8Array(readback.getMappedRange(), 0, 4)
      const match = expected.every((value, i) => Math.abs(value - actual[i]) <= 1)
      readback.unmap()
      return match
    }
    if (await matches(bitmap)) {
      return false
    }
    if (!(await matches(readDisplayP3(bitmap)))) {
      throw new Error('WebGPU image color conversion is not reliable')
    }
    return true
  }
  finally {
    bitmap.close()
    texture?.destroy()
    buffer?.destroy()
    canvas.width = canvas.height = 0
  }
}

export function uploadColorImage(
  device: GPUDevice,
  texture: GPUTexture,
  bitmap: ImageBitmap,
  explicitConversion: boolean,
) {
  // ImageData contains unpremultiplied values in the requested destination
  // space, avoiding the browser's faulty ImageBitmap upload conversion.
  // Older Canvas implementations return 8-bit data despite the float request.
  const source = explicitConversion ? readDisplayP3(bitmap) : bitmap
  device.queue.copyExternalImageToTexture(
    { source },
    { texture, colorSpace: 'display-p3', premultipliedAlpha: false },
    [bitmap.width, bitmap.height],
  )
}
