import React from '/node_modules/.vite/deps/react.js'
import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js'
const { createRoot } = ReactDOM
import { ImageViewer } from '../../packages/webgl-viewer/src/ImageViewer'
import { WebGPUImageViewerEngine } from '../../packages/webgl-viewer/src/WebGPUImageViewerEngine'
import { ProgressiveImage } from '../../apps/web/src/modules/viewer/ProgressiveImage'

const fixture = new URL('./fixtures/', import.meta.url).href
const devices: GPUDevice[] = []
const engines: WebGPUImageViewerEngine[] = []
const originalInit = WebGPUImageViewerEngine.prototype.loadImage
WebGPUImageViewerEngine.prototype.loadImage = function (...args) {
  engines.push(this)
  return originalInit.apply(this, args)
}
const originalRequest = navigator.gpu?.requestAdapter.bind(navigator.gpu)
let fault = ''
if (navigator.gpu)
  navigator.gpu.requestAdapter = async (...args) => {
    if (fault === 'adapter') throw new Error('Test: adapter unavailable')
    const adapter = await originalRequest!(...args)
    if (adapter) {
      const requestDevice = adapter.requestDevice.bind(adapter)
      adapter.requestDevice = async (...deviceArgs) => {
        const device = await requestDevice(...deviceArgs)
        devices.push(device)
        return device
      }
    }
    return adapter
  }
const workers = new Set<Worker>()
const NativeWorker = window.Worker
window.Worker = class extends NativeWorker {
  constructor(...args: ConstructorParameters<typeof Worker>) {
    super(...args)
    workers.add(this)
  }
  terminate() {
    workers.delete(this)
    super.terminate()
  }
}
const errors: string[] = []
window.addEventListener('error', (e) => errors.push(e.message))
window.addEventListener('unhandledrejection', (e) => errors.push(String(e.reason)))
const host = document.createElement('div')
host.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:#111;color:white'
document.body.append(host)
const root = createRoot(host)
const ref = React.createRef<any>()
let state: Record<string, any> = {},
  generation = 0
const loadingRef = { current: null } as any
export function mount(options: { mode?: string; src?: string; progressive?: boolean; video?: string } = {}) {
  fault = options.mode ?? ''
  if (fault === 'absent') Object.defineProperty(navigator, 'gpu', { configurable: true, value: undefined })
  else if (Object.hasOwn(navigator, 'gpu')) delete (navigator as any).gpu
  state = { loads: 0, started: performance.now() }
  const props = {
    src: options.src ?? fixture + 'hdr-201mp.jpg',
    alt: 'Production image rendering check',
    onLoad: () => {
      state.loads++
      state.loadMs = performance.now() - state.started
    },
    onError: (error: unknown) => {
      state.error = String(error)
    },
    onHDRChange: (hdr: boolean) => {
      state.hdr = hdr
    },
    onRendererChange: (renderer: string) => {
      state.renderer = renderer
    },
    onViewportChange: (v: unknown) => {
      state.viewport = v
    },
  }
  root.render(
    options.progressive ? (
      <ProgressiveImage
        key={++generation}
        {...props}
        className="h-full w-full"
        isCurrentImage
        shouldRenderHighRes
        shouldAutoPlayVideoOnce
        videoSource={options.video ? { type: 'live-photo', videoUrl: options.video } : undefined}
        loadingIndicatorRef={loadingRef}
      />
    ) : (
      <ImageViewer key={++generation} {...props} ref={ref} minScale={1} maxScale={20} />
    ),
  )
}
export const status = () => ({
  ...state,
  workers: workers.size,
  errors: [...errors],
  deviceCount: devices.length,
  engines: engines.length,
  renderer: host.querySelector('[data-image-renderer]')?.getAttribute('data-image-renderer'),
  textures: (engines.at(-1) as any)?.textureBytes,
  pending: (engines.at(-1) as any)?.pending?.size,
  uploads: (engines.at(-1) as any)?.uploads?.length,
  tiles: (engines.at(-1) as any)?.tiles?.size,
})
export const zoom = () => ref.current?.zoomIn(false)
export const reset = () => ref.current?.resetView()
export const lose = () => devices.at(-1)?.destroy()
export const unmount = () => root.render(null)
export const engine = () => engines.at(-1) as any
export async function readHDR() {
  const e = engine(),
    device = e.device as GPUDevice
  const context = e.context as GPUCanvasContext
  const config = context.getConfiguration()!
  context.configure({ ...config, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC })
  e.render()
  const texture = context.getCurrentTexture(),
    width = texture.width,
    height = texture.height
  const bytesPerRow = Math.ceil((width * 8) / 256) * 256
  const buffer = device.createBuffer({
    size: bytesPerRow * height,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  })
  const encoder = device.createCommandEncoder()
  encoder.copyTextureToBuffer({ texture }, { buffer, bytesPerRow }, [width, height])
  device.queue.submit([encoder.finish()])
  await buffer.mapAsync(GPUMapMode.READ)
  const data = new Uint16Array(buffer.getMappedRange())
  let max = 0,
    overOne = 0
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      for (let c = 0; c < 3; c++) {
        const bits = data[(y * bytesPerRow) / 2 + x * 4 + c],
          exp = (bits >> 10) & 31,
          mant = bits & 1023
        const value = (bits & 32768 ? -1 : 1) * (exp === 0 ? mant * 2 ** -24 : (1 + mant / 1024) * 2 ** (exp - 15))
        max = Math.max(max, value)
        if (value > 1) overOne++
      }
  buffer.unmap()
  buffer.destroy()
  return { max, overOne, format: config.format, toneMapping: config.toneMapping, width, height }
}
