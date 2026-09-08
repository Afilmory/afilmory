let base, gain
self.onmessage = async ({ data: m }) => {
  try {
    if (m.type === 'init') {
      const t = performance.now()
      ;[base, gain] = await Promise.all(
        ['base.jpg', 'gain.jpg'].map(async (name) =>
          createImageBitmap(await (await fetch('./fixtures/' + name)).blob()),
        ),
      )
      postMessage({ type: 'ready', ms: performance.now() - t })
      return
    }
    const { key, x, y, lod } = m,
      span = 1024 / lod
    const w = Math.min(span, 12288 - x),
      h = Math.min(span, 16384 - y),
      tw = Math.round(w * lod),
      th = Math.round(h * lod)
    const t = performance.now()
    const [b, g] = await Promise.all([
      createImageBitmap(base, x, y, w, h, { resizeWidth: tw, resizeHeight: th, resizeQuality: 'high' }),
      createImageBitmap(gain, x / 4, y / 4, w / 4, h / 4, {
        resizeWidth: tw / 4,
        resizeHeight: th / 4,
        resizeQuality: 'high',
      }),
    ])
    postMessage({ type: 'tile', key, x, y, w, h, b, g, ms: performance.now() - t }, [b, g])
  } catch (e) {
    postMessage({ type: 'error', key: m.key, error: String(e) })
  }
}
