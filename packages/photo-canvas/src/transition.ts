import type { Instance, Point, Rect } from './types'

export interface TransitionMove {
  id: string
  from: Instance
  to: Instance
}

export interface TransitionPlan {
  moves: TransitionMove[]
  fadeOut: Instance[]
  fadeIn: Instance[]
}

export interface TransitionInput {
  from: Instance[]
  to: Instance[]
  fromIds: string[]
  toIds: string[]
  fromCenter: Point
  toCenter: Point
}

const distanceSquared = (instance: Instance, center: Point) =>
  (instance.x + instance.w / 2 - center.x) ** 2 + (instance.y + instance.h / 2 - center.y) ** 2

const nearestById = (instances: Instance[], ids: string[], center: Point) => {
  const nearest = new Map<string, Instance>()
  for (const instance of instances) {
    const id = ids[instance.photoIndex]
    const current = nearest.get(id)
    if (!current || distanceSquared(instance, center) < distanceSquared(current, center)) {
      nearest.set(id, instance)
    }
  }
  return nearest
}

export const planTransition = (input: TransitionInput): TransitionPlan => {
  const sources = nearestById(input.from, input.fromIds, input.fromCenter)
  const targets = nearestById(input.to, input.toIds, input.toCenter)
  const moves: TransitionMove[] = []
  const movingSources = new Set<Instance>()
  const movingTargets = new Set<Instance>()
  for (const [id, from] of sources) {
    const to = targets.get(id)
    if (to) {
      moves.push({ id, from, to })
      movingSources.add(from)
      movingTargets.add(to)
    }
  }
  return {
    moves,
    fadeOut: input.from.filter(instance => !movingSources.has(instance)),
    fadeIn: input.to.filter(instance => !movingTargets.has(instance)),
  }
}

export const interpolateRect = (from: Rect, to: Rect, t: number): Rect => ({
  x: from.x + (to.x - from.x) * t,
  y: from.y + (to.y - from.y) * t,
  w: from.w + (to.w - from.w) * t,
  h: from.h + (to.h - from.h) * t,
})
