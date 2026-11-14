import type { CanvasPhoto, Rect, Size } from '../types'

export interface FilmFrame {
  photoId: string
  rank: number
  rect: Rect
  dateTaken: string
  camera: string | null
}

export const FILM_START_SCALE = 0.2
export const FILM_SCALE = 0.1
export const FILM_FRAME = { width: 294, height: 196, gap: 18 } as const

const FILM_STEP = FILM_FRAME.width + FILM_FRAME.gap
const ROLL_SPAN = Math.log(FILM_START_SCALE / FILM_SCALE)

export const filmProgress = (scale: number) => {
  const t = Math.min(1, Math.max(0, Math.log(FILM_START_SCALE / scale) / ROLL_SPAN))
  return t * t * (3 - 2 * t)
}

export const filmOrder = (photos: CanvasPhoto[]): number[] =>
  photos
    .map((photo, index) => ({ index, time: Date.parse(photo.dateTaken) }))
    .sort((a, b) => (a.time === b.time ? a.index - b.index : a.time - b.time))
    .map(({ index }) => index)

export const filmFrameRect = (rank: number, focusRank: number, offset: number, viewport: Size): Rect => ({
  x: viewport.width / 2 - FILM_FRAME.width / 2 + (rank - focusRank) * FILM_STEP + offset,
  y: viewport.height / 2 - FILM_FRAME.height / 2,
  w: FILM_FRAME.width,
  h: FILM_FRAME.height,
})

export const filmPhotoRect = (aspectRatio: number, frame: Rect): Rect => {
  const wide = aspectRatio >= frame.w / frame.h
  const w = wide ? frame.w : frame.h * aspectRatio
  const h = wide ? frame.w / aspectRatio : frame.h
  return { x: frame.x + (frame.w - w) / 2, y: frame.y + (frame.h - h) / 2, w, h }
}

export const filmOffsetBounds = (count: number, focusRank: number) => ({
  min: -(count - 1 - focusRank) * FILM_STEP,
  max: focusRank * FILM_STEP,
})
