const view = document.querySelector('#view'),
  status = document.querySelector('#status')
const W = 12288,
  H = 16384,
  tileSize = 1024
const stats = (a) => {
  a = [...a].sort((x, y) => x - y)
  return {
    n: a.length,
    p50: a[Math.floor(a.length * 0.5)] ?? 0,
    p95: a[Math.floor(a.length * 0.95)] ?? 0,
    p99: a[Math.floor(a.length * 0.99)] ?? 0,
    max: a.at(-1) ?? 0,
  }
}
const frame = () => new Promise(requestAnimationFrame)
async function load(url) {
  const t = performance.now()
  const img = new Image()
  img.src = url
  await img.decode()
  return { img, ms: performance.now() - t }
}
const shader = `
struct Params { rect: vec4f, viewport: vec4f }
@group(0) @binding(0) var smp: sampler;
@group(0) @binding(1) var base: texture_2d<f32>;
@group(0) @binding(2) var gain: texture_2d<f32>;
@group(0) @binding(3) var<uniform> p: Params;
struct Out { @builtin(position) pos:vec4f, @location(0) uv:vec2f }
@vertex fn vs(@builtin(vertex_index) i:u32)->Out {
 let positions=array<vec2f,6>(vec2f(0,0),vec2f(1,0),vec2f(0,1),vec2f(0,1),vec2f(1,0),vec2f(1,1));
 let uv=positions[i]; let xy=p.rect.xy+uv*p.rect.zw;
 var o:Out; o.pos=vec4f(xy.x/p.viewport.x*2-1,1-xy.y/p.viewport.y*2,0,1); o.uv=uv; return o;
}
fn linearize(c:vec3f)->vec3f {return select(c/12.92,pow((c+0.055)/1.055,vec3f(2.4)),c>vec3f(0.04045));}
fn encode(c:vec3f)->vec3f {return select(c*12.92,1.055*pow(c,vec3f(1.0/2.4))-0.055,c>vec3f(0.0031308));}
@fragment fn fs(o:Out)->@location(0) vec4f {
 let b=textureSample(base,smp,o.uv);
 if(p.viewport.z==0){return b;}
 let g=textureSample(gain,smp,o.uv).rgb;
 return vec4f(encode(linearize(b.rgb)*exp2(g*2.321928)),1);
}`
window.start = async (mode) => {
  if (window.running) return
  window.running = true
  const result = {
    mode,
    source: 'resampled real Ultra HDR base + gain map',
    width: W,
    height: H,
    pixels: W * H,
    ua: navigator.userAgent,
    dpr: devicePixelRatio,
    hdrDisplay: matchMedia('(dynamic-range: high)').matches,
    visibility: document.visibilityState,
    errors: [],
  }
  window.result = result
  let device
  const allTextures = new Set()
  try {
    view.replaceChildren()
    status.textContent = 'Decoding ' + mode
    const whole = performance.now()
    const source = await load(
      mode === 'tiles'
        ? './fixtures/overview.jpg'
        : mode === 'dom' || mode === 'native'
          ? './fixtures/hdr-201mp.jpg'
          : './fixtures/base.jpg',
    )
    result.decodeMs = source.ms
    result.decodedDimensions = [source.img.naturalWidth, source.img.naturalHeight]
    if (mode !== 'tiles' && (source.img.naturalWidth !== W || source.img.naturalHeight !== H))
      throw Error('Browser downsampled source')
    const vw = view.clientWidth,
      vh = view.clientHeight,
      dpr = devicePixelRatio
    result.viewport = { css: [vw, vh], physical: [Math.round(vw * dpr), Math.round(vh * dpr)] }
    let render,
      sampleHDR,
      sampleTiles,
      worker,
      tileTimes = [],
      uploadTimes = [],
      residentBytes = 0,
      peakBytes = 0,
      misses = 0
    if (mode === 'dom') {
      const img = source.img
      img.className = 'photo'
      img.width = W
      img.height = H
      view.append(img)
      render = (s, x, y) => {
        img.style.transform = `translate3d(${x}px,${y}px,0) scale(${s})`
      }
    } else {
      if (!navigator.gpu) throw Error('WebGPU unavailable')
      const adapter = await navigator.gpu.requestAdapter()
      if (!adapter) throw Error('No GPU adapter')
      result.adapter = {
        ...Object.fromEntries(
          ['vendor', 'architecture', 'device', 'description', 'isFallbackAdapter'].map((k) => [k, adapter.info[k]]),
        ),
        maxTextureDimension2D: adapter.limits.maxTextureDimension2D,
      }
      device = await adapter.requestDevice({
        requiredLimits: { maxTextureDimension2D: Math.min(16384, adapter.limits.maxTextureDimension2D) },
      })
      device.addEventListener('uncapturederror', (e) => result.errors.push(e.error.message))
      device.lost.then((info) => {
        if (info.reason !== 'destroyed') result.errors.push('device lost: ' + info.message)
      })
      if (mode !== 'tiles' && device.limits.maxTextureDimension2D < H)
        throw Error('Full texture exceeds maxTextureDimension2D')
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(vw * dpr)
      canvas.height = Math.round(vh * dpr)
      view.append(canvas)
      const ctx = canvas.getContext('webgpu')
      ctx.configure({
        device,
        format: 'rgba16float',
        colorSpace: 'display-p3',
        toneMapping: { mode: 'extended' },
        alphaMode: 'opaque',
      })
      result.canvasConfig = {
        format: ctx.getConfiguration().format,
        colorSpace: ctx.getConfiguration().colorSpace,
        toneMapping: ctx.getConfiguration().toneMapping,
      }
      const module = device.createShaderModule({ code: shader })
      const pipeline = await device.createRenderPipelineAsync({
        layout: 'auto',
        vertex: { module, entryPoint: 'vs' },
        fragment: { module, entryPoint: 'fs', targets: [{ format: 'rgba16float' }] },
      })
      const smp = device.createSampler({ magFilter: 'linear', minFilter: 'linear' })
      function texture(
        img,
        w = img.naturalWidth ?? img.width,
        h = img.naturalHeight ?? img.height,
        x = 0,
        y = 0,
        format = 'rgba8unorm',
        colorSpace = 'display-p3',
      ) {
        const t = performance.now()
        const tex = device.createTexture({
          size: [w, h],
          format,
          usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
        })
        device.queue.copyExternalImageToTexture({ source: img, origin: [x, y] }, { texture: tex, colorSpace }, [w, h])
        uploadTimes.push(performance.now() - t)
        allTextures.add(tex)
        const bytes = w * h * (format === 'rgba16float' ? 8 : 4)
        residentBytes += bytes
        peakBytes = Math.max(peakBytes, residentBytes)
        return { tex, bytes }
      }
      function item(base, gain, rect) {
        const buffer = device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })
        const bind = device.createBindGroup({
          layout: pipeline.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: smp },
            { binding: 1, resource: base.tex.createView() },
            { binding: 2, resource: gain.tex.createView() },
            { binding: 3, resource: { buffer } },
          ],
        })
        return { base, gain, rect, buffer, bind }
      }
      function draw(items, s, x, y, target = ctx.getCurrentTexture().createView(), cw = vw, ch = vh) {
        const enc = device.createCommandEncoder()
        const pass = enc.beginRenderPass({
          colorAttachments: [
            { view: target, loadOp: 'clear', storeOp: 'store', clearValue: { r: 0.015, g: 0.015, b: 0.015, a: 1 } },
          ],
        })
        pass.setPipeline(pipeline)
        for (const i of items) {
          const [ix, iy, iw, ih] = i.rect
          device.queue.writeBuffer(
            i.buffer,
            0,
            new Float32Array([x + ix * s, y + iy * s, iw * s, ih * s, cw, ch, mode === 'native' ? 0 : 1, 0]),
          )
          pass.setBindGroup(0, i.bind)
          pass.draw(6)
        }
        pass.end()
        device.queue.submit([enc.finish()])
      }
      const uploadStart = performance.now()
      let overview,
        cache = new Map()
      if (mode === 'native') {
        const b = texture(source.img, W, H, 0, 0, 'rgba16float')
        overview = item(b, b, [0, 0, W, H])
      } else {
        if (mode === 'gain') {
          const g = await load('./fixtures/gain.jpg')
          result.gainDecodeMs = g.ms
          overview = item(texture(source.img), texture(g.img, 3072, 4096, 0, 0, 'rgba8unorm', 'srgb'), [0, 0, W, H])
        } else {
          const smallGain = await load('./fixtures/overview-gain.jpg')
          overview = item(texture(source.img), texture(smallGain.img, 192, 256, 0, 0, 'rgba8unorm', 'srgb'), [
            0,
            0,
            W,
            H,
          ])
          worker = new Worker('./tiles.worker.js')
          const pending = new Set()
          let ready = false,
            needed = new Set()
          worker.onmessage = ({ data: m }) => {
            if (m.type === 'ready') {
              ready = true
              result.workerDecodeMs = m.ms
              return
            }
            pending.delete(m.key)
            if (m.type === 'error') {
              result.errors.push(m.error)
              return
            }
            tileTimes.push(m.ms)
            if (!needed.has(m.key)) {
              m.b.close()
              m.g.close()
              return
            }
            const bytes = m.b.width * m.b.height * 4 + m.g.width * m.g.height * 4
            while (residentBytes + bytes > 128 * 1024 * 1024) {
              const old = [...cache.keys()].find((k) => !needed.has(k))
              if (!old) {
                m.b.close()
                m.g.close()
                return
              }
              const v = cache.get(old)
              for (const r of [v.base, v.gain]) {
                r.tex.destroy()
                allTextures.delete(r.tex)
                residentBytes -= r.bytes
              }
              v.buffer.destroy()
              cache.delete(old)
            }
            const entry = item(texture(m.b), texture(m.g, m.g.width, m.g.height, 0, 0, 'rgba8unorm', 'srgb'), [
              m.x,
              m.y,
              m.w,
              m.h,
            ])
            cache.set(m.key, entry)
            m.b.close()
            m.g.close()
          }
          worker.postMessage({ type: 'init' })
          render = (s, x, y) => {
            const lod = [1 / 16, 1 / 8, 1 / 4, 1 / 2, 1].find((l) => l >= Math.min(1, s * dpr)) ?? 1
            const span = 1024 / lod,
              visible = []
            if (lod > 1 / 16) {
              const minX = Math.max(0, Math.floor(-x / s / span)),
                maxX = Math.min(Math.ceil(W / span) - 1, Math.floor((vw - x) / s / span))
              const minY = Math.max(0, Math.floor(-y / s / span)),
                maxY = Math.min(Math.ceil(H / span) - 1, Math.floor((vh - y) / s / span))
              for (let ty = minY; ty <= maxY; ty++)
                for (let tx = minX; tx <= maxX; tx++)
                  visible.push({ key: `${lod}:${tx}:${ty}`, x: tx * span, y: ty * span, lod })
              visible.sort(
                (a, b) =>
                  Math.hypot(a.x + span / 2 - (vw / 2 - x) / s, a.y + span / 2 - (vh / 2 - y) / s) -
                  Math.hypot(b.x + span / 2 - (vw / 2 - x) / s, b.y + span / 2 - (vh / 2 - y) / s),
              )
            }
            needed = new Set(visible.map((v) => v.key))
            for (const v of visible) {
              if (cache.has(v.key)) {
                const i = cache.get(v.key)
                cache.delete(v.key)
                cache.set(v.key, i)
              } else {
                misses++
                if (ready && !pending.has(v.key) && pending.size < 2) {
                  pending.add(v.key)
                  worker.postMessage({ type: 'tile', ...v })
                }
              }
            }
            // ponytail: old detail falls back to overview during LOD changes; parent-tile retention needed for production.
            draw([overview, ...visible.map((v) => cache.get(v.key)).filter(Boolean)], s, x, y)
          }
        }
      }
      await device.queue.onSubmittedWorkDone()
      result.initialUploadAndGainDecodeMs = performance.now() - uploadStart
      render ??= (s, x, y) => draw([overview], s, x, y)
      sampleTiles = async () => Promise.all([...cache.values()].slice(-8).map((i) => sampleHDR(i)))
      sampleHDR = async (i = overview) => {
        const tex = device.createTexture({
          size: [256, 256],
          format: 'rgba16float',
          usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
        })
        const ss = 256 / Math.max(i.rect[2], i.rect[3])
        draw([i], ss, -i.rect[0] * ss, -i.rect[1] * ss, tex.createView(), 256, 256)
        const buf = device.createBuffer({
          size: 256 * 256 * 8,
          usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        })
        const enc = device.createCommandEncoder()
        enc.copyTextureToBuffer({ texture: tex }, { buffer: buf, bytesPerRow: 2048 }, [256, 256])
        device.queue.submit([enc.finish()])
        await buf.mapAsync(GPUMapMode.READ)
        const half = new Uint16Array(buf.getMappedRange())
        let max = 0,
          over = 0
        for (let i = 0; i < half.length; i++) {
          if (i % 4 === 3) continue
          const v = half[i],
            e = (v >> 10) & 31,
            m = v & 1023
          const f = (v & 32768 ? -1 : 1) * (e === 0 ? (2 ** -14 * m) / 1024 : 2 ** (e - 15) * (1 + m / 1024))
          max = Math.max(max, f)
          if (f > 1.01) over++
        }
        buf.unmap()
        buf.destroy()
        tex.destroy()
        return { maxEncodedChannel: max, channelsAboveOne: over, sampleSize: [256, 256] }
      }
    }
    result.firstSetupMs = performance.now() - whole
    const fit = Math.min(vw / W, vh / H)
    render(fit, (vw - W * fit) / 2, (vh - H * fit) / 2)
    await frame()
    await frame()
    if (sampleHDR) result.hdrReadback = await sampleHDR()
    status.textContent = mode + ' — 15s deterministic fit → zoom → pan'
    // rAF measures scheduling cadence, not compositor presentation. No per-frame GPU wait.
    performance.mark('trajectory-start')
    let last = await frame(),
      start = last,
      frames = [],
      cpu = [],
      phases = { zoom: [], pan: [], return: [] }
    while (true) {
      const now = await frame(),
        t = (now - start) / 1000
      if (t >= 15) break
      const dt = now - last
      last = now
      frames.push(dt)
      let s, x, y, phase
      if (t < 5) {
        phase = 'zoom'
        s = fit * Math.pow(1 / fit, t / 5)
        x = (vw - W * s) / 2
        y = (vh - H * s) / 2
      } else if (t < 10) {
        phase = 'pan'
        s = 1
        x = -(W - vw) * (0.5 + 0.4 * Math.sin((t - 5) * 1.1))
        y = -(H - vh) * (0.5 + 0.4 * Math.sin((t - 5) * 0.7))
      } else {
        phase = 'return'
        s = Math.pow(fit, (t - 10) / 5)
        x = (vw - W * s) / 2
        y = (vh - H * s) / 2
      }
      phases[phase].push(dt)
      const begin = performance.now()
      render(s, x, y)
      cpu.push(performance.now() - begin)
    }
    performance.mark('trajectory-end')
    if (device) await device.queue.onSubmittedWorkDone()
    if (mode === 'tiles') result.tileHDRReadbacks = await sampleTiles()
    Object.assign(result, {
      rafMs: stats(frames),
      phases: Object.fromEntries(Object.entries(phases).map(([k, v]) => [k, stats(v)])),
      frameCpuMs: stats(cpu),
      over25ms: frames.filter((x) => x > 25).length,
      over50ms: frames.filter((x) => x > 50).length,
      textureUploadCallMs: stats(uploadTimes),
      texturePeakBytes: peakBytes,
      tileMissObservations: misses,
      tileWorkerMs: stats(tileTimes),
      visibilityAtEnd: document.visibilityState,
    })
    worker?.terminate()
    status.textContent = JSON.stringify(result, null, 2)
  } catch (e) {
    result.errors.push(e.stack ?? String(e))
    status.textContent = JSON.stringify(result, null, 2)
  }
  await fetch('/result', { method: 'POST', body: JSON.stringify(result) })
  window.running = false
  // Keep final image visible for inspection. Release on next navigation, not mid-capture.
  window.cleanup = () => {
    for (const t of allTextures) t.destroy()
    device?.destroy()
  }
  return result
}
