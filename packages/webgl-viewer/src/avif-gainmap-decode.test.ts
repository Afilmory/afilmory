import assert from 'node:assert/strict'

import { afterEach, it, vi } from 'vitest'

import { decodeAVIFGainMap, gainSamplesToRGBA } from './avif-gainmap-decode'

afterEach(() => vi.unstubAllGlobals())

function samples(depth: number, values: number[], width = values.length, height = 1, subsampled = false) {
  const count = subsampled ? Math.ceil(width / 2) * Math.ceil(height / 2) : width * height
  const step = depth > 8 ? 2 : 1
  const bytes = new Uint8Array((values.length + 2 * count) * step)
  const view = new DataView(bytes.buffer)
  for (let i = 0; i < values.length + 2 * count; i++) {
    const value = i < values.length ? values[i] : 2 ** (depth - 1)
    if (step === 1) {
      view.setUint8(i, value)
    }
    else {
      view.setUint16(i * step, value, true)
    }
  }
  return {
    width,
    height,
    depth,
    subsampled,
    bytes,
    rotation: 0,
    flip: false,
    layout: [
      { offset: 0, stride: width * step },
      { offset: values.length * step, stride: (subsampled ? Math.ceil(width / 2) : width) * step },
      { offset: (values.length + count) * step, stride: (subsampled ? Math.ceil(width / 2) : width) * step },
    ],
  }
}

for (const depth of [8, 10, 12]) {
  it(`preserves ${depth}-bit neutral gain samples without an 8-bit intermediate`, () => {
    const input = samples(depth, [0, 1, 2, 2 ** depth - 1])
    const output = gainSamplesToRGBA(input)
    for (let x = 0; x < 4; x++) {
      const expected = [0, 1, 2, 2 ** depth - 1][x] / (2 ** depth - 1)
      for (let c = 0; c < 3; c++) {
        assert.ok(Math.abs(output.data[x * 4 + c] - expected) < 0.00001)
      }
      assert.equal(output.data[x * 4 + 3], 1)
    }
    assert.ok(output.data[4] > 0 && output.data[4] < output.data[8])
  })
}

it('interpolates centered 4:2:0 chroma before clipping RGB', () => {
  const input = samples(8, [128, 128, 128, 128], 4, 1, true)
  input.bytes.set([64, 192], input.layout[1].offset)
  const output = gainSamplesToRGBA(input)
  // Second pixel Cb = 3/4 * 64 + 1/4 * 192 = 96, not nearest 64.
  assert.ok(Math.abs(output.data[6] - (128 - 32 * 1.772) / 255) < 0.0003)
  assert.equal(output.data[2], new Float16Array([(128 - 64 * 1.772) / 255])[0])
})

it('handles odd chroma dimensions and clamps sampling at image edges', () => {
  const output = gainSamplesToRGBA(
    samples(
      12,
      Array.from({ length: 9 }).fill(2048),
      3,
      3,
      true,
    ),
  )
  assert.equal(output.data.length, 36)
  assert.ok(Array.from(output.data).every(Number.isFinite))
})

it('applies frame rotation clockwise, then horizontal reflection, exactly once', () => {
  const input = samples(8, [10, 20, 30, 40, 50, 60], 3, 2)
  const expected = new Map([
    [0, [10, 20, 30, 40, 50, 60]],
    [90, [40, 10, 50, 20, 60, 30]],
    [180, [60, 50, 40, 30, 20, 10]],
    [270, [30, 60, 20, 50, 10, 40]],
  ])
  for (const [rotation, values] of expected) {
    for (const flip of [false, true]) {
      const output = gainSamplesToRGBA({ ...input, rotation, flip })
      const reordered = Array.from(values)
      if (flip) {
        for (let y = 0; y < output.height; y++) {
          reordered.splice(
            y * output.width,
            output.width,
            ...values.slice(y * output.width, (y + 1) * output.width).reverse(),
          )
        }
      }
      assert.deepEqual(
        Array.from({ length: 6 }, (_, i) => Math.round(output.data[i * 4] * 255)),
        reordered,
      )
    }
  }
})

it('rejects unsupported sample layout and truncated native buffers', () => {
  assert.throws(() => gainSamplesToRGBA({ ...samples(8, [0]), rotation: 45 }), /layout/)
  assert.throws(() => gainSamplesToRGBA({ ...samples(8, [0]), bytes: new Uint8Array(0) }), RangeError)
})

for (const failure of ['decode', 'format', 'depth', 'budget', 'copy', 'bitmap', 'precision', 'success']) {
  it(`releases native decoder/frame resources on ${failure}`, async () => {
    const frameClose = vi.fn()
    const decoderClose = vi.fn()
    const source = samples(10, [1])
    vi.stubGlobal(
      'ImageDecoder',
      class {
        close = decoderClose
        async decode() {
          if (failure === 'decode') {
            throw new Error('decode')
          }
          return {
            image: {
              format: failure === 'format' ? 'RGBA' : failure === 'depth' ? 'I444' : 'I444P10',
              colorSpace: { fullRange: true, matrix: 'smpte170m' },
              visibleRect: { x: 0, y: 0, width: 1, height: 1 },
              displayWidth: 1,
              displayHeight: 1,
              rotation: 0,
              flip: false,
              allocationSize: () => (failure === 'budget' ? 129 * 1024 * 1024 : source.bytes.length),
              copyTo: async (bytes: Uint8Array) => {
                if (failure === 'copy') {
                  throw new Error('copy')
                }
                bytes.set(source.bytes)
                return source.layout
              },
              close: frameClose,
            },
          }
        }
      },
    )
    vi.stubGlobal(
      'ImageData',
      class {
        data: Float16Array | Uint8ClampedArray
        constructor(data: Float16Array) {
          this.data = failure === 'precision' ? new Uint8ClampedArray(4) : data
        }
      },
    )
    vi.stubGlobal('createImageBitmap', async () => {
      if (failure === 'bitmap') {
        throw new Error('bitmap')
      }
      return { width: 1, height: 1 }
    })
    const result = decodeAVIFGainMap(new Blob([new Uint8Array(1)]), 10)
    if (failure === 'success') {
      assert.equal((await result).width, 1)
    }
    else {
      await assert.rejects(result)
    }
    assert.equal(decoderClose.mock.calls.length, 1)
    assert.equal(frameClose.mock.calls.length, failure === 'decode' ? 0 : 1)
  })
}

it('reports missing native precision decoding instead of silently quantizing', async () => {
  vi.stubGlobal('ImageDecoder', undefined)
  await assert.rejects(decodeAVIFGainMap(new Blob(), 10), /lacks native AVIF sample decoding/)
})
