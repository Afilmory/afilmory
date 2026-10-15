const process = require('node:process')

const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '@playwright/test')
const cp = require('node:child_process')
const assert = require('node:assert/strict')
const lifecycle = require('./lifecycle.cjs')

const root = process.env.UPSTREAM_ROOT
const ref = process.env.AVIF_REFERENCE
;(async () => {
  const browser = process.env.BROWSER_CHANNEL === 'safari'
    ? await require('./safari-driver.cjs')()
    : await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chromium', args: ['--enable-unsafe-webgpu'] })
  const reports = []
  try {
    const colorUpload = await require('./color-upload.cjs')(browser, process.env.AVIF_TEST_URL)
    const legacyPixels = {}
    const cases = process.env.FORMAT_BASELINE_CASES ? ['jpeg-old', 'jpeg', ...JSON.parse(process.env.FORMAT_BASELINE_CASES)] : [
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
      'precision-gain-failure',
      'precision-no-decoder',
      'precision8-gain-failure',
      'precision8-no-decoder',
      'base-failure',
      'unsupported',
      'ordinary',
      ...JSON.parse(process.env.AVIF_CORPUS || '[]'),
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
        const pageErrors = []
        page.on('pageerror', e => pageErrors.push(e.message))
        page.on('console', (m) => {
          if (m.type() === 'error') {
            consoleErrors.push(m.text())
          }
          if (m.type() === 'warning') {
            warnings.push(m.text())
          }
        })
        if (['gain-failure', 'base-failure', 'precision-gain-failure', 'precision-no-decoder', 'precision8-gain-failure', 'precision8-no-decoder'].includes(primary)) {
          const prefix = primary.endsWith('-no-decoder')
            ? 'self.ImageDecoder=undefined;'
            : primary.startsWith('precision')
              ? 'self.ImageDecoder=class {constructor(){throw new Error("Injected native gain decode failure")}};'
              : primary === 'gain-failure'
                ? 'const originalBitmap=self.createImageBitmap.bind(self);self.createImageBitmap=(source,...args)=>{if(args[0]?.colorSpaceConversion==="none")return Promise.reject(new Error("Injected gain decode failure"));return originalBitmap(source,...args)};'
                : 'const originalBitmap=self.createImageBitmap.bind(self);let calls=0;self.createImageBitmap=(...args)=>{if(++calls===1)return Promise.reject(new Error("Injected base decode failure"));return originalBitmap(...args)};'
          if (page.setWorkerPrefix) {
            await page.setWorkerPrefix(prefix)
          }
          else {
            await page.route('**/assets/webgpu-texture.worker-*.js', async (route) => {
              const response = await route.fetch()
              const source = await response.text()
              await route.fulfill({
                response,
                body: prefix + source,
              })
            })
          }
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
            const createTexture = device.createTexture.bind(device)
            device.createTexture = descriptor => createTexture({ ...descriptor, usage: descriptor.usage | GPUTextureUsage.COPY_SRC })
            // Keep the real engine's pipeline, worker, uniforms, uploads and HDR predicate.
            // Substitute only a same-format render target so it can be read back without presentation conversion.
            const format = engine.context.getConfiguration().format
            const output = device.createTexture({
              size: [width, height],
              format,
              usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
            })
            engine.context.getCurrentTexture = () => output
            const filePrimary = primary.startsWith('precision8-')
              ? 'corpus-color-gain-8-420-ratio2'
              : primary.startsWith('precision-')
                ? 'corpus-color-gain-12-420-ratio2'
                : ['no-extended', 'range-change', 'gain-failure', 'base-failure'].includes(primary) ? 'color-12' : primary
            await engine.loadImage(
              new URL(
                primary === 'ordinary'
                  ? '/sdr.avif'
                  : primary.startsWith('baseline-jpeg-')
                    ? `/gainmap-${primary}.jpg`
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
              metadata: engine.metadata,
            }
            if (primary.startsWith('corpus-') || primary.startsWith('baseline-') || ['color-base', 'icc-base'].includes(primary)) {
              result.planes = {}
              for (const name of ['base', 'gain']) {
                if (!engine.overview[name]) {
                  continue
                }
                const texture = engine.overview[name].texture
                const bytesPerPixel = texture.format === 'rgba16float' ? 8 : 4
                const bytesPerRow = Math.ceil(texture.width * bytesPerPixel / 256) * 256
                const buffer = device.createBuffer({ size: bytesPerRow * texture.height, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ })
                const command = device.createCommandEncoder()
                command.copyTextureToBuffer({ texture }, { buffer, bytesPerRow }, [texture.width, texture.height])
                device.queue.submit([command.finish()])
                await buffer.mapAsync(GPUMapMode.READ)
                const data = texture.format === 'rgba16float' ? new Uint16Array(buffer.getMappedRange()) : new Uint8Array(buffer.getMappedRange())
                const samples = []
                for (let y = 0; y < texture.height; y++) {
                  for (let x = 0; x < texture.width; x++) {
                    samples.push([0, 1, 2].map((c) => {
                      const value = data[y * bytesPerRow / data.BYTES_PER_ELEMENT + x * 4 + c]
                      return texture.format === 'rgba16float' ? half(value) : value / 255
                    }))
                  }
                }
                buffer.unmap()
                buffer.destroy()
                result.planes[name] = { width: texture.width, height: texture.height, pixels: samples }
              }
            }
            output.destroy()
            read.destroy()
            engine.destroy()
            return result
          },
          { primary, width, height, hdr },
        )
        const expectedHDR = ['no-extended', 'gain-failure', 'precision-gain-failure', 'precision-no-decoder', 'precision8-gain-failure', 'precision8-no-decoder', 'base-failure', 'unsupported', 'ordinary'].includes(primary)
          ? false
          : primary === 'range-change'
            ? !hdr
            : hdr
        assert.equal(actual.hdr, expectedHDR, `${primary}: ${warnings.join('; ')}`)
        assert.equal(actual.extended, primary !== 'no-extended')
        assert.deepEqual(actual.failures, [])
        assert.deepEqual(pageErrors, [])
        assert.equal(requests.length, 1)
        const warns = ['gain-failure', 'precision-gain-failure', 'precision-no-decoder', 'precision8-gain-failure', 'precision8-no-decoder', 'base-failure', 'unsupported'].includes(primary)
        assert.equal(warnings.length, warns ? 1 : 0, `${primary}: ${warnings.join('; ')}`)
        if (warns) {
          assert.match(
            warnings[0],
            primary.includes('gain-failure') || primary.endsWith('-no-decoder') ? /HDR gain map could not be decoded/
              : primary === 'base-failure' ? /Extracted base could not be decoded/ : /AVIF gain map unsupported/,
          )
        }
        if (primary === 'base-failure') {
          assert.deepEqual(consoleErrors, [])
          assert.ok(actual.pixels.every(p => p.every(Number.isFinite) && p[3] === 1))
          reports.push({ primary, hdr: actual.hdr, requests: requests.length, warnings, comparison: 'Original browser decoding fallback; no reconstructed-HDR or guaranteed SDR claim' })
          await page.close()
          continue
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
          = primary.startsWith('precision8-')
            ? 'corpus-color-gain-8-420-ratio2'
            : primary.startsWith('precision-')
              ? 'corpus-color-gain-12-420-ratio2'
              : primary === 'ordinary'
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
          cp.execFileSync(primary.startsWith('baseline-jpeg-') ? process.env.JPEG_REFERENCE : ref, [
            ...(primary.startsWith('baseline-jpeg-') ? ['reference'] : []),
            `${process.env.AVIF_FIXTURES || `${root}/packages/webgl-viewer/src/fixtures`}/gainmap-${referencePrimary}.${primary.startsWith('baseline-jpeg-') ? 'jpg' : 'avif'}`,
            expectedHDR ? 'hdr' : 'sdr',
            ...(cropped ? ['crop'] : []),
          ]),
        )
        let gainPlaneError
        if (primary.startsWith('corpus-') || primary.startsWith('baseline-avif-') || ['color-base', 'icc-base'].includes(primary)) {
          gainPlaneError = 0
          actual.planes.gain.pixels.forEach((p, i) => p.forEach((value, c) => {
            gainPlaneError = Math.max(gainPlaneError, Math.abs(value - reference.gain.pixels[i][c]))
          }))
          assert.ok(gainPlaneError <= 0.0003, `Native gain samples exceed float16 rounding: ${gainPlaneError}`)
        }
        if (reference.pqRec2020) {
          reference.pqRec2020 = indices
            .flat()
            .map(i => reference.pqRec2020[cropped ? Math.floor(i / 32) * 24 + (i % 32) : i])
        }
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
        const mismatches = []
        const toP3 = [
          [1.3435783, -0.2821797, -0.0613986],
          [-0.06529745, 1.0757879, -0.01049045],
          [0.00282179, -0.0195985, 1.0167767],
        ]
        reference.linearP3 ??= reference.pqRec2020.map((p) => {
          const rgb = p.map(pqLinear)
          return toP3.map(row => row.reduce((sum, value, c) => sum + value * rgb[c], 0))
        })
        actual.pixels.forEach((p, i) =>
          p.slice(0, 3).forEach((v, c) => {
            const got = linear(v)
            const expected = reference.linearP3[i][c]
            const err = Math.abs(got - expected)
            if (err > maxError) {
              maxError = err
              worst = { i, c, got, expected }
            }
            maxRelative = Math.max(maxRelative, err / Math.max(0.1, Math.abs(expected)))
            maxOutput = Math.max(maxOutput, v)
          }))
        actual.pixels.forEach((p, i) => {
          const expected = reference.linearP3[i]
          const peak = Math.max(0.1, ...expected.map(Math.abs))
          const error = Math.max(...expected.map((v, c) => Math.abs(linear(p[c]) - v)))
          maxPixelRelative = Math.max(maxPixelRelative, error / peak)
          if (error > 0.005 + 0.02 * peak) {
            mismatches.push({ pixel: i, error, peak })
          }
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
          mismatchedPixels: mismatches.length,
          firstMismatch: mismatches[0],
          gainPlaneError,
          ...(['color-base', 'icc-base'].includes(primary) ? { srgbBaseReference: require('./format-baseline.cjs').srgbBaseReference(actual, reference, expectedHDR) } : {}),
          ...(primary.startsWith('baseline-') ? { baseline: require('./format-baseline.cjs')(actual, reference, expectedHDR) } : {}),
          ...(actual.planes ? { planes: actual.planes, referencePlanes: { base: reference.base, gain: reference.gain }, metadata: actual.metadata } : {}),
        })
        await page.close()
      }
    }
    const resources = process.env.FORMAT_BASELINE_CASES ? [] : await lifecycle(browser, process.env.AVIF_TEST_URL)
    const baselineFailures = process.env.FORMAT_BASELINE_CASES ? {
      matchedSampling: reports.filter(r => r.baseline?.pixelCenterReference.mismatchedPixels > 0).length,
      gpuFormula: reports.filter(r => r.baseline?.gpuFormulaControl.mismatchedPixels > 0).length,
    } : undefined
    process.stdout.write(`${JSON.stringify({ browser: browser.version(), numericalFailures: reports.filter(r => r.mismatchedPixels > 0).length, baselineFailures, colorUpload, reports, resources }, null, 2)}\n`)
    if (baselineFailures) {
      assert.equal(baselineFailures.gpuFormula, 0, 'GPU reconstruction disagrees with its uploaded samples')
      assert.equal(baselineFailures.matchedSampling, 0, 'Matched-sampling independent reference differs; see saved report')
    }
    assert.equal(reports.filter(r => r.srgbBaseReference?.mismatchedPixels > 0).length, 0, 'sRGB base working-space reference differs; see saved report')
    assert.equal(reports.filter(r => r.mismatchedPixels > 0).length, 0, 'Numerical failures; see saved report (tolerance unchanged)')
  }
  finally {
    await browser.close()
  }
})().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
