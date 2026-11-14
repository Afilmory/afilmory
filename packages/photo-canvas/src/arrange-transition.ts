import type { CameraState } from './camera'
import { springToward } from './camera'
import type { DrawInstance } from './core'
import type { TransitionPlan } from './transition'
import { interpolateRect } from './transition'
import type { CanvasPhoto } from './types'

const FADE_MS = 200
const SETTLED_GAP = 0.002

export interface ActiveTransition {
  plan: TransitionPlan
  fromIds: string[]
  fromCamera: CameraState
  toCamera: CameraState
  progress: number
  velocity: number
  elapsed: number
}

const mixCamera = (from: CameraState, to: CameraState, t: number): CameraState => ({
  x: from.x + (to.x - from.x) * t,
  y: from.y + (to.y - from.y) * t,
  scale: from.scale * (to.scale / from.scale) ** t,
})

export const stepArrangeTransition = (transition: ActiveTransition, dtMs: number, durationMs: number) => {
  transition.elapsed += dtMs
  const next = springToward(transition.progress, 1, transition.velocity, dtMs, durationMs)
  transition.progress = Math.min(1, next.value)
  transition.velocity = next.velocity
  const done = transition.elapsed >= durationMs && 1 - transition.progress < SETTLED_GAP
  return {
    camera: done ? transition.toCamera : mixCamera(transition.fromCamera, transition.toCamera, transition.progress),
    done,
  }
}

export const arrangeTransitionInstances = (transition: ActiveTransition, photos: CanvasPhoto[]): DrawInstance[] => {
  const { plan, progress } = transition
  const fade = Math.min(1, transition.elapsed / FADE_MS)
  const out: DrawInstance[] = []
  for (const instance of plan.fadeOut) {
    out.push({ ...instance, id: transition.fromIds[instance.photoIndex], alpha: 1 - fade })
  }
  for (const instance of plan.fadeIn) {
    out.push({ ...instance, id: photos[instance.photoIndex].id, alpha: fade })
  }
  for (const move of plan.moves) {
    out.push({ ...move.to, ...interpolateRect(move.from, move.to, progress), id: move.id, alpha: 1 })
  }
  return out
}
