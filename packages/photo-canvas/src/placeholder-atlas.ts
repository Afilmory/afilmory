import { thumbHashToRGBA } from 'thumbhash'

import type { AtlasGeometry } from './atlas-geometry'
import { atlasCell, atlasGeometry } from './atlas-geometry'
import type { CanvasPhoto } from './types'

export interface PlaceholderUv {
  u: number
  v: number
  w: number
  h: number
  layer: number
}

interface Entry {
  index: number
  hash: Uint8Array | null
  uv: PlaceholderUv | null
}

export class PlaceholderAtlas {
  version = 0
  private texture: WebGLTexture | null = null
  private geometry: AtlasGeometry | null = null
  private readonly entries = new Map<string, Entry>()
  private pending: string[] = []

  constructor(private readonly gl: WebGL2RenderingContext) {}

  sync(photos: CanvasPhoto[]) {
    for (const photo of photos) {
      if (this.entries.has(photo.id)) {
        continue
      }
      this.entries.set(photo.id, { index: this.entries.size, hash: photo.thumbHash, uv: null })
      if (photo.thumbHash) {
        this.pending.push(photo.id)
      }
    }
    const capacity = this.geometry ? this.geometry.perPage * this.geometry.pages : 0
    if (this.entries.size > capacity) {
      this.allocate()
    }
  }

  decode(budgetMs: number): boolean {
    const { gl, geometry } = this
    if (!geometry || this.pending.length === 0) {
      return false
    }
    const deadline = performance.now() + budgetMs
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.texture)
    while (this.pending.length > 0 && performance.now() < deadline) {
      const entry = this.entries.get(this.pending.pop()!)
      if (!entry?.hash) {
        continue
      }
      try {
        const image = thumbHashToRGBA(entry.hash)
        const cell = atlasCell(entry.index, geometry)
        gl.texSubImage3D(
          gl.TEXTURE_2D_ARRAY,
          0,
          cell.x,
          cell.y,
          cell.layer,
          image.w,
          image.h,
          1,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          image.rgba,
        )
        entry.uv = {
          u: (cell.x + 0.5) / geometry.size,
          v: (cell.y + 0.5) / geometry.size,
          w: (image.w - 1) / geometry.size,
          h: (image.h - 1) / geometry.size,
          layer: cell.layer,
        }
      }
      catch {
        entry.hash = null
      }
    }
    this.version += 1
    return this.pending.length > 0
  }

  uvOf(id: string): PlaceholderUv | null {
    return this.entries.get(id)?.uv ?? null
  }

  bind(unit: number) {
    const { gl } = this
    gl.activeTexture(gl.TEXTURE0 + unit)
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.texture)
  }

  dispose() {
    this.gl.deleteTexture(this.texture)
    this.texture = null
    this.entries.clear()
    this.pending = []
  }

  private allocate() {
    const { gl } = this
    gl.deleteTexture(this.texture)
    const maxSize = Math.min(4096, gl.getParameter(gl.MAX_TEXTURE_SIZE) as number)
    const geometry = atlasGeometry(Math.ceil(this.entries.size * 1.5), undefined, maxSize)
    this.geometry = geometry
    this.texture = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.texture)
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.RGBA8, geometry.size, geometry.size, geometry.pages)
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    this.pending = []
    for (const [id, entry] of this.entries) {
      entry.uv = null
      if (entry.hash) {
        this.pending.push(id)
      }
    }
    this.version += 1
  }
}
