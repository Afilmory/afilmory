// Gain maps contain numbers, not display colors. ImageBitmap decoding can
// quantize 10/12-bit AV1 to 8-bit and use nearest-neighbor chroma upsampling.
// Read native YUV samples instead, and retain their precision through tiling.
interface AVIFFrame extends VideoFrame {
  readonly rotation: number
  readonly flip: boolean
}
interface NativeImageDecoder {
  decode: () => Promise<{ image: AVIFFrame }>
  close: () => void
}
interface DecoderConstructor {
  new (options: { data: ArrayBuffer, type: string, colorSpaceConversion: 'none' }): NativeImageDecoder
}

export interface GainSamples {
  width: number
  height: number
  depth: number
  subsampled: boolean
  bytes: Uint8Array
  layout: { offset: number, stride: number }[]
  rotation: number
  flip: boolean
}

export function gainSamplesToRGBA(samples: GainSamples) {
  const { width, height, depth, subsampled, bytes, layout, rotation, flip } = samples
  if (
    ![8, 10, 12].includes(depth)
    || ![0, 90, 180, 270].includes(rotation)
    || width <= 0
    || height <= 0
    || layout.length !== 3
  ) {
    throw new Error('Unsupported AVIF gain-map sample layout')
  }
  const swapped = rotation === 90 || rotation === 270
  const outputWidth = swapped ? height : width
  const outputHeight = swapped ? width : height
  const output = new Float16Array(width * height * 4)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const maximum = 2 ** depth - 1
  const center = 2 ** (depth - 1)
  const step = depth > 8 ? 2 : 1
  const cw = subsampled ? Math.ceil(width / 2) : width
  const ch = subsampled ? Math.ceil(height / 2) : height
  const read = (plane: number, x: number, y: number) => {
    const { offset, stride } = layout[plane]
    const index = offset + y * stride + x * step
    return step === 1 ? view.getUint8(index) : view.getUint16(index, true)
  }
  const chroma = (plane: number, x: number, y: number) => {
    if (!subsampled) {
      return read(plane, x, y)
    }
    // Centered 4:2:0: interpolate the chroma plane before RGB conversion and
    // clamping, rather than interpolating already-clipped RGB boundary pixels.
    const sx = Math.max(0, (x + 0.5) / 2 - 0.5)
    const sy = Math.max(0, (y + 0.5) / 2 - 0.5)
    const x0 = Math.floor(sx)
    const y0 = Math.floor(sy)
    const x1 = Math.min(cw - 1, x0 + 1)
    const y1 = Math.min(ch - 1, y0 + 1)
    const fx = sx - x0
    const fy = sy - y0
    return (
      (read(plane, x0, y0) * (1 - fx) + read(plane, x1, y0) * fx) * (1 - fy)
      + (read(plane, x0, y1) * (1 - fx) + read(plane, x1, y1) * fx) * fy
    )
  }
  const clamp = (value: number) => Math.max(0, Math.min(1, value))
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const luma = read(0, x, y) / maximum
      const cb = (chroma(1, x, y) - center) / maximum
      const cr = (chroma(2, x, y) - center) / maximum
      let dx = x
      let dy = y
      if (rotation === 90) {
        dx = height - 1 - y
        dy = x
      }
      else if (rotation === 180) {
        dx = width - 1 - x
        dy = height - 1 - y
      }
      else if (rotation === 270) {
        dx = y
        dy = width - 1 - x
      }
      if (flip) {
        dx = outputWidth - 1 - dx
      }
      const i = (dy * outputWidth + dx) * 4
      output[i] = clamp(luma + 1.402 * cr)
      output[i + 1] = clamp(luma - (0.114 * 1.772 * cb + 0.299 * 1.402 * cr) / 0.587)
      output[i + 2] = clamp(luma + 1.772 * cb)
      output[i + 3] = 1
    }
  }
  return { data: output, width: outputWidth, height: outputHeight }
}

export async function decodeAVIFGainMap(blob: Blob, expectedDepth: number): Promise<ImageBitmap> {
  const Decoder = (globalThis as unknown as { ImageDecoder?: DecoderConstructor }).ImageDecoder
  if (!Decoder || typeof Float16Array === 'undefined') {
    throw new Error('Browser lacks native AVIF sample decoding or float16 image support')
  }
  const decoder = new Decoder({ data: await blob.arrayBuffer(), type: 'image/avif', colorSpaceConversion: 'none' })
  let frame: AVIFFrame | undefined
  try {
    frame = (await decoder.decode()).image
    const format = /^(I420|I444)(?:P(10|12))?$/.exec(frame.format ?? '')
    if (!format || frame.colorSpace.fullRange !== true || frame.colorSpace.matrix !== 'smpte170m') {
      throw new Error('Unsupported native AVIF gain-map pixel format or color range')
    }
    if (Number(format[2] ?? 8) !== expectedDepth) {
      throw new Error('Browser did not preserve AVIF gain-map bit depth')
    }
    const rect = frame.visibleRect!
    const width = rect.width
    const height = rect.height
    const rotation = frame.rotation
    const flip = frame.flip
    if (typeof rotation !== 'number' || typeof flip !== 'boolean') {
      throw new TypeError('Browser does not expose AVIF frame transforms')
    }
    const swapped = rotation === 90 || rotation === 270
    if (frame.displayWidth !== (swapped ? height : width) || frame.displayHeight !== (swapped ? width : height)) {
      throw new Error('Unsupported AVIF gain-map display scaling')
    }
    // Bound native samples plus the float16 conversion buffer, separately from
    // the renderer's GPU texture budget. No full-size float32 intermediates.
    const size = frame.allocationSize({ rect })
    if (size + width * height * 8 > 128 * 1024 * 1024) {
      throw new Error('AVIF gain map exceeds precision decode memory budget')
    }
    const bytes = new Uint8Array(size)
    const layout = await frame.copyTo(bytes, { rect })
    frame.close()
    frame = undefined
    const pixels = gainSamplesToRGBA({
      width,
      height,
      depth: Number(format[2] ?? 8),
      subsampled: format[1] === 'I420',
      bytes,
      layout,
      rotation,
      flip,
    })
    // The pinned DOM typings predate float16 ImageData and frame transforms.
    const FloatImageData = ImageData as unknown as new (
      data: Float16Array<ArrayBuffer>,
      width: number,
      height: number,
      settings: { colorSpace: 'srgb', pixelFormat: 'rgba-float16' },
    ) => ImageData
    const image = new FloatImageData(pixels.data, pixels.width, pixels.height, {
      colorSpace: 'srgb',
      pixelFormat: 'rgba-float16',
    })
    if (image.data.BYTES_PER_ELEMENT !== 2) {
      throw new Error('Browser did not preserve float16 gain samples')
    }
    return await createImageBitmap(image, { colorSpaceConversion: 'none' })
  }
  finally {
    frame?.close()
    decoder.close()
  }
}
