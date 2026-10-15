const assert = require('node:assert/strict')

module.exports = async function lifecycle(browser, url) {
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } })
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  await page.goto(url)
  try {
    const result = await page.evaluate(async () => {
      const { WebGPUImageViewerEngine } = await import('/engine.js')
      const alive = { workers: new Set(), textures: new Set(), buffers: new Set(), devices: new Set() }
      const OriginalWorker = window.Worker
      window.Worker = class extends OriginalWorker {
        constructor(...args) {
          super(...args)
          alive.workers.add(this)
        }

        terminate() {
          alive.workers.delete(this)
          super.terminate()
        }
      }
      for (const [method, kind] of [['createTexture', 'textures'], ['createBuffer', 'buffers']]) {
        const original = GPUDevice.prototype[method]
        GPUDevice.prototype[method] = function (...args) {
          const resource = original.apply(this, args)
          alive[kind].add(resource)
          const destroy = resource.destroy.bind(resource)
          resource.destroy = () => {
            alive[kind].delete(resource)
            destroy()
          }
          return resource
        }
      }
      const requestDevice = GPUAdapter.prototype.requestDevice
      GPUAdapter.prototype.requestDevice = async function (...args) {
        const device = await requestDevice.apply(this, args)
        alive.devices.add(device)
        const destroy = device.destroy.bind(device)
        device.destroy = () => {
          alive.devices.delete(device)
          destroy()
        }
        return device
      }
      const snapshot = () => Object.fromEntries(Object.entries(alive).map(([key, set]) => [key, set.size]))
      const frame = () => new Promise(resolve => requestAnimationFrame(resolve))
      const config = {
        src: '',
        className: '',
        width: 4096,
        height: 3072,
        initialScale: 1,
        minScale: 0.1,
        maxScale: 10,
        wheel: { step: 1 },
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
      const reports = []
      for (const mode of ['view', 'view', 'view', 'cancel', 'cancel', 'broken']) {
        const host = document.createElement('div')
        host.style.cssText = 'position:relative;width:800px;height:600px'
        const canvas = document.createElement('canvas')
        canvas.style.cssText = 'width:100%;height:100%'
        host.append(canvas)
        document.body.append(host)
        const failures = []
        const engine = new WebGPUImageViewerEngine(canvas, config, e => failures.push(e.message), () => {})
        await engine.initialized
        let peakTextureBytes = 0
        let peakPending = 0
        let maximumTiles = 0
        const settled = async () => {
          const deadline = performance.now() + 15000
          let stable = 0
          while (stable < 4) {
            await frame()
            peakTextureBytes = Math.max(peakTextureBytes, engine.textureBytes)
            peakPending = Math.max(peakPending, engine.pending.size)
            maximumTiles = Math.max(maximumTiles, engine.tiles.size)
            stable = engine.pending.size === 0 && engine.uploads.length === 0 ? stable + 1 : 0
            if (performance.now() > deadline) {
              throw new Error('Tiles did not settle')
            }
          }
          await engine.device.queue.onSubmittedWorkDone()
        }
        const start = performance.now()
        const load = engine.loadImage(`${window.location.origin}/${mode === 'broken' ? 'broken' : 'large'}.avif`, 4096, 3072)
        // Attach the rejection handler before disposal to detect unhandled-rejection regressions.
        const outcome = load.then(() => 'loaded', e => e.name)
        if (mode === 'cancel') {
          await frame()
          engine.destroy()
        }
        const status = await outcome
        const gainFormat = engine.overview?.gain?.texture.format
        if (mode === 'view') {
          await settled()
          for (let n = 0; n < 3; n++) {
            engine.zoomIn(false)
            await settled()
          }
          const bounds = canvas.getBoundingClientRect()
          canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: bounds.x + 400, clientY: bounds.y + 300, button: 0 }))
          window.dispatchEvent(new MouseEvent('mousemove', { clientX: bounds.x + 650, clientY: bounds.y + 480, buttons: 1 }))
          window.dispatchEvent(new MouseEvent('mouseup'))
          await settled()
        }
        const elapsedMs = performance.now() - start
        engine.destroy()
        engine.destroy() // Idempotent cleanup must not double-release resources.
        host.remove()
        await frame()
        await frame()
        reports.push({ mode, status, failures, gainFormat, elapsedMs, peakTextureBytes, peakPending, maximumTiles, resources: snapshot(), textureBytesAfterDestroy: engine.textureBytes, queuedAfterDestroy: engine.pending.size + engine.uploads.length + engine.tiles.size, workerCleared: engine.worker === null, overviewCleared: engine.overview === null })
      }
      return reports
    })
    assert.deepEqual(errors, [])
    for (const r of result) {
      assert.deepEqual(r.resources, { workers: 0, textures: 0, buffers: 0, devices: 0 })
      assert.equal(r.textureBytesAfterDestroy, 0)
      assert.equal(r.queuedAfterDestroy, 0)
      assert.ok(r.workerCleared && r.overviewCleared)
      assert.ok(r.peakTextureBytes <= 128 * 1024 ** 2)
      assert.ok(r.peakPending <= 2)
      if (r.mode === 'view') {
        assert.equal(r.status, 'loaded')
        assert.ok(r.maximumTiles > 0)
        assert.equal(r.gainFormat, 'rgba16float')
      }
      if (r.mode === 'cancel') {
        assert.equal(r.status, 'AbortError')
      }
      assert.equal(r.failures.length, r.mode === 'broken' ? 1 : 0)
      if (r.mode === 'broken') {
        assert.equal(r.status, 'Error')
      }
    }
    return result
  }
  finally { await page.close() }
}
