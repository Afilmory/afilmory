import manifest from '../../../apps/web/src/data/photos-manifest.json'
import type { Arrangement, CanvasPhoto, FrameState } from '../src'
import { PhotoCanvasEngine } from '../src'

interface ManifestPhoto {
  id: string
  aspectRatio: number
  thumbnailUrl: string
  thumbHash: string | null
  dateTaken: string
  tags: string[]
  exif: { Make?: string, Model?: string } | null
}

const decodeHex = (hex: string) => Uint8Array.from(hex.match(/.{1,2}/g)!.map(byte => Number.parseInt(byte, 16)))

const params = new URLSearchParams(window.location.search)
const total = Number(params.get('n') ?? 0)
const source = (manifest as unknown as { data: ManifestPhoto[] }).data

const toPhoto = (photo: ManifestPhoto, copy: number): CanvasPhoto => {
  const date = new Date(photo.dateTaken)
  date.setMonth(date.getMonth() - copy)
  return {
    id: copy === 0 ? photo.id : `${photo.id}-${copy}`,
    aspectRatio: photo.aspectRatio,
    thumbnailUrl: photo.thumbnailUrl,
    thumbHash: photo.thumbHash ? decodeHex(photo.thumbHash) : null,
    dateTaken: copy === 0 ? photo.dateTaken : date.toISOString(),
    camera: photo.exif?.Make && photo.exif.Model ? `${photo.exif.Make} ${photo.exif.Model}` : null,
    tags: copy === 0 ? photo.tags : [`tag ${copy % 80}`, `tag ${(copy * 7) % 80}`, ...photo.tags],
    place: null,
  }
}

const photos: CanvasPhoto[] = []
const count = total > 0 ? total : source.length
for (let i = 0; i < count; i++) {
  photos.push(toPhoto(source[i % source.length], Math.floor(i / source.length)))
}

const hud = document.querySelector<HTMLDivElement>('#hud')!
const frameTimes: number[] = []
let lastFrame = 0
let lastState: FrameState | null = null
let lastClick: { id: string, rect: unknown } | null = null

const engine = new PhotoCanvasEngine(document.querySelector<HTMLCanvasElement>('#canvas')!, {
  reducedMotion: params.has('reduced'),
  onPhotoClick: (id, rect) => {
    lastClick = { id, rect }
  },
  onHover: () => {},
  onFrame: (frame) => {
    const now = performance.now()
    if (lastFrame > 0 && now - lastFrame < 200) {
      frameTimes.push(now - lastFrame)
      if (frameTimes.length > 120) {
        frameTimes.shift()
      }
    }
    lastFrame = now
    lastState = frame
    const sorted = [...frameTimes].sort((a, b) => a - b)
    const p50 = sorted[Math.floor(sorted.length / 2)] ?? 0
    const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0
    hud.textContent = `${photos.length} photos · ${frame.instances.length} instances · ${frame.arrangement}\nscale ${frame.camera.scale.toFixed(3)} · frame p50 ${p50.toFixed(1)}ms p95 ${p95.toFixed(1)}ms`
  },
})
engine.setPhotos(photos)

const bar = document.querySelector<HTMLDivElement>('#bar')!
for (const arrangement of engine.arrangements()) {
  const button = document.createElement('button')
  button.textContent = arrangement
  button.addEventListener('click', () => engine.setArrangement(arrangement))
  bar.append(button)
}
const initial = params.get('arrange') as Arrangement | null
if (initial) {
  engine.setArrangement(initial)
}

Object.assign(window, {
  demo: {
    engine,
    frameTimes,
    state: () => lastState,
    lastClick: () => lastClick,
  },
})
