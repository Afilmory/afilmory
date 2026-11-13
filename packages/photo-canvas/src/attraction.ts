import type { PhotoColor } from './color'
import { hueDistance, isNeutral } from './color'
import type { DrawInstance } from './core'
import type { CanvasPhoto, Rect } from './types'

export type AttractBasis = 'color' | 'month' | 'camera' | 'tag'

export interface AttractionPlan {
  heldKey: string
  held: Rect
  targets: Map<string, Rect>
}

export const DIMMED_ALPHA = 0.14
const MAX_PULLED = 24
const HELD_SCALE = 1.25
const PULLED_SCALE = 0.72
const FIRST_RING = 6
const RING_GROWTH = 5
const HUE_TOLERANCE = 28
const LIGHTNESS_TOLERANCE = 0.3
const NEUTRAL_LIGHTNESS_TOLERANCE = 0.15

const monthOf = (photo: CanvasPhoto) => photo.dateTaken.slice(0, 7)

export const isRelated = (
  basis: AttractBasis,
  a: CanvasPhoto,
  b: CanvasPhoto,
  colorA: PhotoColor | null,
  colorB: PhotoColor | null,
) => {
  if (basis === 'camera') {
    return a.camera !== null && a.camera === b.camera
  }
  if (basis === 'month') {
    return monthOf(a).length === 7 && monthOf(a) === monthOf(b)
  }
  if (basis === 'tag') {
    return a.tags.some(tag => b.tags.includes(tag))
  }
  if (!colorA || !colorB) {
    return false
  }
  if (isNeutral(colorA) || isNeutral(colorB)) {
    return isNeutral(colorA) && isNeutral(colorB) && Math.abs(colorA.l - colorB.l) < NEUTRAL_LIGHTNESS_TOLERANCE
  }
  return hueDistance(colorA.h, colorB.h) < HUE_TOLERANCE && Math.abs(colorA.l - colorB.l) < LIGHTNESS_TOLERANCE
}

const centerDistance = (a: Rect, b: Rect) => Math.hypot(a.x + a.w / 2 - b.x - b.w / 2, a.y + a.h / 2 - b.y - b.h / 2)

export const planAttraction = (
  instances: DrawInstance[],
  photos: CanvasPhoto[],
  colors: (PhotoColor | null)[],
  heldKey: string,
  basis: AttractBasis,
): AttractionPlan | null => {
  const source = instances.find(instance => instance.key === heldKey)
  if (!source) {
    return null
  }
  const nearest = new Map<number, DrawInstance>()
  for (const instance of instances) {
    const index = instance.photoIndex
    if (
      index === source.photoIndex
      || !isRelated(basis, photos[source.photoIndex], photos[index], colors[source.photoIndex], colors[index])
    ) {
      continue
    }
    const current = nearest.get(index)
    if (!current || centerDistance(instance, source) < centerDistance(current, source)) {
      nearest.set(index, instance)
    }
  }
  if (nearest.size === 0) {
    return null
  }
  const pulled = [...nearest.values()]
    .sort((a, b) => centerDistance(a, source) - centerDistance(b, source))
    .slice(0, MAX_PULLED)

  const centerX = source.x + source.w / 2
  const centerY = source.y + source.h / 2
  const held: Rect = {
    x: centerX - (source.w * HELD_SCALE) / 2,
    y: centerY - (source.h * HELD_SCALE) / 2,
    w: source.w * HELD_SCALE,
    h: source.h * HELD_SCALE,
  }
  const unit = source.w * PULLED_SCALE
  const firstRadius = Math.hypot(held.w, held.h) / 2 + unit * 0.75
  const targets = new Map<string, Rect>()
  let ring = 0
  let slot = 0
  let slots = FIRST_RING
  for (const instance of pulled) {
    if (slot >= slots) {
      ring += 1
      slot = 0
      slots += RING_GROWTH
    }
    const angle = (slot / slots) * Math.PI * 2 + ring * 0.5 - Math.PI / 2
    const radius = firstRadius + ring * unit * 1.15
    const ratio = instance.w / instance.h
    const h = Math.min(unit / ratio, unit)
    const w = h * ratio
    targets.set(instance.key, {
      x: centerX + Math.cos(angle) * radius * 1.2 - w / 2,
      y: centerY + Math.sin(angle) * radius - h / 2,
      w,
      h,
    })
    slot += 1
  }
  return { heldKey, held, targets }
}

const mix = (from: Rect, to: Rect, t: number): Rect =>
  t >= 1
    ? to
    : {
        x: from.x + (to.x - from.x) * t,
        y: from.y + (to.y - from.y) * t,
        w: from.w + (to.w - from.w) * t,
        h: from.h + (to.h - from.h) * t,
      }

export const applyAttraction = (instances: DrawInstance[], plan: AttractionPlan, progress: number): DrawInstance[] => {
  const dimmed: DrawInstance[] = []
  const pulled: DrawInstance[] = []
  let held: DrawInstance | null = null
  for (const instance of instances) {
    if (instance.key === plan.heldKey) {
      held = { ...instance, ...mix(instance, plan.held, progress) }
      continue
    }
    const target = plan.targets.get(instance.key)
    if (target) {
      pulled.push({ ...instance, ...mix(instance, target, progress) })
    }
    else {
      dimmed.push({ ...instance, alpha: instance.alpha * (1 - progress) + instance.alpha * DIMMED_ALPHA * progress })
    }
  }
  return held ? [...dimmed, ...pulled, held] : [...dimmed, ...pulled]
}
