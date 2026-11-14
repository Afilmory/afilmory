import type { CameraState } from './camera'
import type { DrawInstance } from './core'
import type { FilmFrame } from './layouts/film'
import { FILM_FRAME, filmFrameRect, filmOffsetBounds, filmPhotoRect } from './layouts/film'
import { interpolateRect } from './transition'
import type { CanvasPhoto, Rect, Size } from './types'

const FILM_STEP = FILM_FRAME.width + FILM_FRAME.gap
const STAGGER = 0.035
const MAX_DELAY = 0.4
const FADE_POWER = 1.6

export interface FilmState {
  progress: number
  offset: number
  frames: FilmFrame[]
}

export interface FilmStageInput {
  settled: DrawInstance[]
  progress: number
  camera: CameraState
  viewport: Size
  photos: CanvasPhoto[]
  order: number[]
  rankOf: number[]
  offset: number
}

const smooth = (t: number) => {
  const clamped = Math.min(1, Math.max(0, t))
  return clamped * clamped * (3 - 2 * clamped)
}

export const composeFilmStage = (input: FilmStageInput) => {
  const { settled, progress, camera, viewport, photos, order, rankOf } = input
  let focus: DrawInstance | null = null
  let focusDistance = Infinity
  const nearest = new Map<number, { instance: DrawInstance, distance: number }>()
  for (const instance of settled) {
    const distance = Math.hypot(instance.x + instance.w / 2 - camera.x, instance.y + instance.h / 2 - camera.y)
    if (distance < focusDistance) {
      focus = instance
      focusDistance = distance
    }
    const known = nearest.get(instance.photoIndex)
    if (!known || distance < known.distance) {
      nearest.set(instance.photoIndex, { instance, distance })
    }
  }
  const focusRank = focus ? rankOf[focus.photoIndex] : 0
  const { min, max } = filmOffsetBounds(order.length, focusRank)
  const offset = Math.min(max, Math.max(min, input.offset))

  const toWorld = (rect: Rect): Rect => ({
    x: camera.x + (rect.x - viewport.width / 2) / camera.scale,
    y: camera.y + (rect.y - viewport.height / 2) / camera.scale,
    w: rect.w / camera.scale,
    h: rect.h / camera.scale,
  })
  const firstRank = Math.max(0, focusRank + Math.floor((-offset - viewport.width / 2) / FILM_STEP) - 1)
  const lastRank = Math.min(order.length - 1, focusRank + Math.ceil((viewport.width / 2 - offset) / FILM_STEP) + 1)
  const frames: FilmFrame[] = []
  const drawn: DrawInstance[] = []
  const sources = new Set<string>()
  for (let rank = firstRank; rank <= lastRank; rank++) {
    const photoIndex = order[rank]
    const photo = photos[photoIndex]
    const frameRect = filmFrameRect(rank, focusRank, offset, viewport)
    frames.push({ photoId: photo.id, rank, rect: frameRect, dateTaken: photo.dateTaken, camera: photo.camera })
    const target = toWorld(filmPhotoRect(photo.aspectRatio, frameRect))
    const delay = Math.min(MAX_DELAY, Math.abs(rank - focusRank) * STAGGER)
    const t = smooth((progress - delay) / (1 - delay))
    const source = nearest.get(photoIndex)?.instance
    if (source) {
      sources.add(source.key)
    }
    const key = `f:${photoIndex}`
    drawn.push(
      source
        ? { ...source, key, ...interpolateRect(source, target, t), alpha: 1 }
        : { key, photoIndex, id: photo.id, ...target, alpha: t },
    )
  }
  const fade = (1 - progress) ** FADE_POWER
  const background = fade < 0.01 ? [] : settled.filter(i => !sources.has(i.key)).map(i => ({ ...i, alpha: fade }))
  const film: FilmState = { progress, offset, frames }
  return { instances: [...background, ...drawn], film, focus: focusRank }
}

export class FilmRoll {
  state: FilmState | null = null
  private order: number[] = []
  private rankOf: number[] = []
  private offset = 0
  private velocity = 0
  private focus = 0

  reset(order: number[]) {
    this.order = order
    this.rankOf = []
    order.forEach((photoIndex, rank) => {
      this.rankOf[photoIndex] = rank
    })
    this.offset = 0
    this.velocity = 0
    this.state = null
  }

  get gliding() {
    return this.velocity !== 0
  }

  stop() {
    this.velocity = 0
  }

  fling(pxPerMs: number) {
    this.velocity = pxPerMs
  }

  scroll(dxPx: number) {
    const { min, max } = filmOffsetBounds(this.order.length, this.focus)
    const before = this.offset
    this.offset = Math.min(max, Math.max(min, this.offset + dxPx))
    return Math.abs(this.offset - before)
  }

  glide(dtMs: number, decay: (velocity: number, dtMs: number) => number, stopSpeed: number) {
    const moved = this.scroll(this.velocity * dtMs)
    this.velocity = decay(this.velocity, dtMs)
    if (moved === 0 || Math.abs(this.velocity) < stopSpeed) {
      this.velocity = 0
    }
    return moved
  }

  takeCenteredPhoto(): number | null {
    if (this.offset === 0) {
      return null
    }
    const rank = Math.round(this.focus - this.offset / FILM_STEP)
    this.offset = 0
    this.velocity = 0
    return this.order[rank] ?? null
  }

  compose(input: Omit<FilmStageInput, 'order' | 'rankOf' | 'offset'>) {
    const stage = composeFilmStage({ ...input, order: this.order, rankOf: this.rankOf, offset: this.offset })
    this.focus = stage.focus
    this.offset = stage.film.offset
    this.state = stage.film
    return stage.instances
  }
}
