export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface Size {
  width: number
  height: number
}

export interface Point {
  x: number
  y: number
}

export type Arrangement = 'wall' | 'month' | 'camera' | 'tag' | 'location' | 'color'

export interface CanvasPhoto {
  id: string
  aspectRatio: number
  thumbnailUrl: string
  thumbHash: Uint8Array | null
  dateTaken: string
  camera: string | null
  tags: string[]
  place: string | null
}

export interface Instance extends Rect {
  key: string
  photoIndex: number
}
