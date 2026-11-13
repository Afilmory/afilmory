import type { FrameState } from '@afilmory/photo-canvas'

export type FrameListener = (frame: FrameState) => void

export const createFrameBus = () => {
  const listeners = new Set<FrameListener>()
  let last: FrameState | null = null
  return {
    emit(frame: FrameState) {
      last = frame
      for (const listener of listeners) {
        listener(frame)
      }
    },
    subscribe(listener: FrameListener) {
      listeners.add(listener)
      if (last) {
        listener(last)
      }
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

export type FrameBus = ReturnType<typeof createFrameBus>
