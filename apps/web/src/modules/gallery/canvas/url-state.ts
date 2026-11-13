import type { Arrangement } from '@afilmory/photo-canvas'

import type { GalleryViewMode } from '~/atoms/app'

const VIEW_PARAM = 'view'
const ARRANGE_PARAM = 'arrange'
const CANVAS_VIEW = 'canvas'
const ARRANGEMENTS: readonly Arrangement[] = ['wall', 'month', 'camera', 'tag', 'location']

export interface CanvasUrlState {
  view: 'canvas' | null
  arrange: Arrangement
}

const isArrangement = (value: string | null): value is Arrangement =>
  value !== null && (ARRANGEMENTS as readonly string[]).includes(value)

export const parseCanvasUrl = (search: URLSearchParams): CanvasUrlState => {
  const arrange = search.get(ARRANGE_PARAM)
  return {
    view: search.get(VIEW_PARAM) === CANVAS_VIEW ? 'canvas' : null,
    arrange: isArrangement(arrange) ? arrange : 'wall',
  }
}

export const writeCanvasUrl = (search: URLSearchParams, state: CanvasUrlState): URLSearchParams => {
  const next = new URLSearchParams(search)
  next.delete(VIEW_PARAM)
  next.delete(ARRANGE_PARAM)
  if (state.view !== 'canvas') {
    return next
  }
  next.set(VIEW_PARAM, CANVAS_VIEW)
  if (state.arrange !== 'wall') {
    next.set(ARRANGE_PARAM, state.arrange)
  }
  return next
}

export const resolveViewMode = (input: {
  requested: GalleryViewMode
  supported: boolean
  isLargeScreen: boolean
}): GalleryViewMode => {
  if (input.requested !== 'canvas') {
    return input.requested
  }
  return input.supported && input.isLargeScreen ? 'canvas' : 'masonry'
}
