const process = require('node:process')

const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '@playwright/test')
const cp = require('node:child_process')
const assert = require('node:assert/strict')

const root = process.env.UPSTREAM_ROOT
const ref = process.env.AVIF_REFERENCE
;(async () => {
  const browser = await chromium.launch({ channel: 'chromium', args: ['--enable-unsafe-webgpu'] })
  const reports = []
  try {
    const legacyPixels = {}
    const cases = [
      '1',
      '12',
      '9',
      'color-1',
      'color-12',
      'color-9',
      ...['r1', 'r2', 'r3', 'm0', 'm1', 'crop', 'combo'].map(x => `transform-${x}`),
      'icc',
      'color-base',
      'icc-base',
      'jpeg-old',
      'jpeg',
      'no-extended',
      'range-change',
      'gain-failure',
      'unsupported',
      'ordinary',
    ]
    for (const primary of cases) {
      for (const hdr of [false, true]) {
        let indices = Array.from({ length: 24 }, (_, y) => Array.from({ length: 32 }, (_, x) => y * 32 + x))
        if (primary === 'transform-crop' || primary === 'transform-combo') {
          indices = indices.slice(0, 16).map(r => r.slice(0, 24))
        }
        const turns = primary === 'transform-combo' ? 1 : primary.startsWith('transform-r') ? Number(primary.at(-1)) : 0
        for (let i = 0; i < turns; i++) {
          indices = indices[0].map((_, x) => indices.map(r => r[indices[0].length - 1 - x]))
        }
        if (primary === 'transform-m0') {
          indices.reverse()
        }
        if (primary === 'transform-m1' || primary === 'transform-combo') {
          indices.forEach(r => r.reverse())
        }
        const width = indices[0].length
        const height = indices.length
        const page = await browser.newPage({ viewport: { width: 200, height: 150 }, deviceScaleFactor: 1 })
        const consoleErrors = []
        const warnings = []
        page.on('console', (m) => {
          if (m.type() === 'error') {
            consoleErrors.push(m.text())
          }
          if (m.type() === 'warning') {
            warnings.push(m.text())
          }
        })
        if (primary === 'gain-failure') {
          await page.route('**/assets/webgpu-texture.worker-*.js', async (route) => {
            const response = await route.fetch()
            const source = await response.text()
            await route.fulfill({
              response,
              body:
                `const originalBitmap=self.createImageBitmap.bind(self);self.createImageBitmap=(source,...args)=>{if(source instanceof Blob && args[0]?.colorSpaceConversion==="none")return Promise.reject(new Error("Injected gain decode failure"));return originalBitmap(source,...args)};${
                  source}`,
            })
          })
        }
        await page.addInitScript(
          ({ hdr, primary }) => {
            const original = window.matchMedia.bind(window)
            const listeners = []
            const capability = {
              matches: hdr,
              media: '(dynamic-range: high)',
              addEventListener(_type, fn) {
                listeners.push(fn)
              },
              removeEventListener() {},
            }
            window.__setHDR = (value) => {
              capability.matches = value
              listeners.forEach(fn => fn())
            }
            window.matchMedia = query => (query === '(dynamic-range: high)' ? capability : original(query))
            if (primary === 'no-extended') {
              const configure = GPUCanvasContext.prototype.configure
              GPUCanvasContext.prototype.configure = function (config) {
                if (config.toneMapping?.mode === 'extended') {
                  throw new Error('Simulated unsupported extended canvas')
                }
                return configure.call(this, config)
              }
            }
          },
          { hdr, primary },
        )
        await page.goto(process.env.AVIF_TEST_URL)
        const requests = []
        page.on('request', (r) => {
          if (/\.(?:avif|jpg)$/.test(r.url())) {
            requests.push(r.url())
          }
        })
        const actual = await page.evaluate(
          async ({ primary, width, height, hdr }) => {
            const { WebGPUImageViewerEngine } = await import(primary === 'jpeg-old' ? '/engine-old.js' : '/engine.js')
            const host = document.createElement('div')
            host.style.cssText = `width:${width}px;height:${height}px;position:relative`
            document.body.append(host)
            const canvas = document.createElement('canvas')
            canvas.width = width
            canvas.height = height
            canvas.style.cssText = `width:${width}px;height:${height}px`
            host.append(canvas)
            const failures = []
            const states = []
            const config = {
              src: '',
              className: '',
              width: 32,
              height: 24,
              initialScale: 1,
              minScale: 0.1,
              maxScale: 10,
              wheel: { step: 0.1 },
              pinch: { step: 0.1 },
              doubleClick: { step: 2, mode: 'toggle', animationTime: 0 },
              panning: {},
              limitToBounds: true,
              centerOnInit: true,
              smooth: false,
              alignmentAnimation: { sizeX: 0, sizeY: 0, velocityAlignmentTime: 0 },
              velocityAnimation: { sensitivity: 1, animationTime: 0 },
              debug: false,
            }
            const engine = new WebGPUImageViewerEngine(
              canvas,
              config,
              e => failures.push(e.message),
              v => states.push(v),
            )
            await engine.initialized
            const device = engine.device
            // Keep the real engine's pipeline, worker, uniforms, uploads and HDR predicate.
            // Substitute only a same-format render target so it can be read back without presentation conversion.
            const format = engine.context.getConfiguration().format
            const output = device.createTexture({
              size: [width, height],
              format,
              usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
            })
            engine.context.getCurrentTexture = () => output
            const filePrimary = ['no-extended', 'range-change', 'gain-failure'].includes(primary) ? 'color-12' : primary
            await engine.loadImage(
              new URL(
                primary === 'ordinary'
                  ? '/sdr.avif'
                  : String(primary).startsWith('jpeg')
                    ? '/gainmap-icc.jpg'
                    : `/gainmap-${filePrimary}.avif`,
                window.location.origin,
              ).href,
              width,
              height,
            )
            if (primary === 'range-change') {
              window.__setHDR(!hdr)
            }
            await device.queue.onSubmittedWorkDone()
            const read = device.createBuffer({
              size: 256 * height,
              usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
            })
            const enc = device.createCommandEncoder()
            enc.copyTextureToBuffer({ texture: output }, { buffer: read, bytesPerRow: 256 }, [width, height])
            device.queue.submit([enc.finish()])
            await read.mapAsync(GPUMapMode.READ)
            const raw = read.getMappedRange().slice(0)
            const data = format === 'rgba16float' ? new Uint16Array(raw) : new Uint8Array(raw)
            read.unmap()
            const half = (b) => {
              const e = (b >> 10) & 31
              return (b & 32768 ? -1 : 1) * (e ? (1 + (b & 1023) / 1024) * 2 ** (e - 15) : (b & 1023) * 2 ** -24)
            }
            const pixels = []
            for (let y = 0; y < height; y++) {
              for (let x = 0; x < width; x++) {
                pixels.push(
                  [0, 1, 2, 3].map(c =>
                    format === 'rgba16float'
                      ? half(data[y * 128 + x * 4 + c])
                      : data[y * 256 + x * 4 + (format === 'bgra8unorm' ? [2, 1, 0, 3][c] : c)] / 255),
                )
              }
            }
            const result = {
              hdr: engine.isHDR,
              extended: engine.extendedRange,
              states,
              failures,
              viewport: engine.getViewport(),
              pixels,
            }
            output.destroy()
            read.destroy()
            engine.destroy()
            return result
          },
          { primary, width, height, hdr },
        )
        const expectedHDR = ['no-extended', 'gain-failure', 'unsupported', 'ordinary'].includes(primary)
          ? false
          : primary === 'range-change'
            ? !hdr
            : hdr
        assert.equal(actual.hdr, expectedHDR)
        assert.equal(actual.extended, primary !== 'no-extended')
        assert.deepEqual(actual.failures, [])
        assert.equal(requests.length, 1)
        const warns = ['gain-failure', 'unsupported'].includes(primary)
        assert.equal(warnings.length, warns ? 1 : 0)
        if (warns) {
          assert.match(
            warnings[0],
            primary === 'gain-failure' ? /HDR gain map could not be decoded/ : /AVIF gain map unsupported/,
          )
        }
        if (String(primary).startsWith('jpeg')) {
          if (primary === 'jpeg-old') {
            legacyPixels[hdr] = actual.pixels
          }
          else {
            assert.deepEqual(
              actual.pixels,
              legacyPixels[hdr],
              'JPEG ICC rendered pixels must remain identical to the pre-refactor decoder',
            )
          }
          assert.deepEqual(consoleErrors, [])
          reports.push({ primary, hdr, pixelsIdenticalToLegacy: primary === 'jpeg', requests: requests.length })
          await page.close()
          continue
        }
        const referencePrimary
          = primary === 'ordinary'
            ? 1
            : ['transform-m0', 'transform-crop'].includes(primary)
                ? 12
                : String(primary).startsWith('transform-')
                  || ['no-extended', 'range-change', 'gain-failure', 'unsupported'].includes(primary)
                  ? 'color-12'
                  : primary === 'icc'
                    ? 'color-1'
                    : primary === 'icc-base' ? 'color-base' : primary
        const cropped = ['transform-crop', 'transform-combo'].includes(primary)
        const reference = JSON.parse(
          cp.execFileSync(ref, [
            `${root}/packages/webgl-viewer/src/fixtures/gainmap-${referencePrimary}.avif`,
            expectedHDR ? 'hdr' : 'sdr',
            ...(cropped ? ['crop'] : []),
          ]),
        )
        reference.pqRec2020 = indices
          .flat()
          .map(i => reference.pqRec2020[cropped ? Math.floor(i / 32) * 24 + (i % 32) : i])
        const linear = x =>
          Math.sign(x) * (Math.abs(x) <= 0.04045 ? Math.abs(x) / 12.92 : ((Math.abs(x) + 0.055) / 1.055) ** 2.4)
        const pqLinear = (v) => {
          const p = v ** (1 / (2523 / 32))
          return (
            ((Math.max(p - 3424 / 4096, 0) / (2413 / 128 - (2392 / 128) * p)) ** (1 / (2610 / 16384)) * 10000) / 203
          )
        }
        let maxError = 0
        let maxRelative = 0
        let maxOutput = 0
        let worst = null
        let maxPixelRelative = 0
        const toP3 = [
          [1.3435783, -0.2821797, -0.0613986],
          [-0.06529745, 1.0757879, -0.01049045],
          [0.00282179, -0.0195985, 1.0167767],
        ]
        actual.pixels.forEach((p, i) =>
          p.slice(0, 3).forEach((v, c) => {
            const got = linear(v)
            const rgb = reference.pqRec2020[i].map(pqLinear)
            const expected = toP3[c].reduce((n, v, k) => n + v * rgb[k], 0)
            const err = Math.abs(got - expected)
            if (err > maxError) {
              maxError = err
              worst = { i, c, got, expected }
            }
            maxRelative = Math.max(maxRelative, err / Math.max(0.1, Math.abs(expected)))
            maxOutput = Math.max(maxOutput, v)
          }))
        actual.pixels.forEach((p, i) => {
          const rgb = reference.pqRec2020[i].map(pqLinear)
          const expected = toP3.map(row => row.reduce((n, v, k) => n + v * rgb[k], 0))
          const peak = Math.max(0.1, ...expected.map(Math.abs))
          const error = Math.max(...expected.map((v, c) => Math.abs(linear(p[c]) - v)))
          maxPixelRelative = Math.max(maxPixelRelative, error / peak)
          assert.ok(
            error <= 0.005 + 0.02 * peak,
            `CICP ${primary} HDR=${hdr} pixel ${i}: linear error ${error}, reference peak ${peak}`,
          )
          assert.equal(p[3], 1)
        })
        assert.deepEqual(consoleErrors, [])
        assert.ok(expectedHDR ? maxOutput > 1 : maxOutput <= 1, 'HDR must exceed SDR white; SDR must preserve the base')
        reports.push({
          primary,
          hdr: expectedHDR,
          initialHDRCapability: hdr,
          extended: actual.extended,
          requests: requests.length,
          maxError,
          maxRelative,
          maxPixelRelative,
          maxOutput,
          worst,
          viewport: actual.viewport,
          warnings,
          failures: actual.failures,
        })
        await page.close()
      }
    }
    process.stdout.write(`${JSON.stringify({ browser: browser.version(), reports }, null, 2)}\n`)
  }
  finally {
    await browser.close()
  }
})().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
