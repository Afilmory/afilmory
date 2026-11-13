import type { CameraState, ScaleLimits } from './camera'
import { fitRect } from './camera'
import type { PhotoColor } from './color'
import type { GroupedLayout } from './layouts/grouped'
import { createGroupedLayout } from './layouts/grouped'
import { groupPhotos } from './layouts/grouping'
import { createSpectrumLayout } from './layouts/spectrum'
import type { WallLayout } from './layouts/wall'
import { createWallLayout } from './layouts/wall'
import { maxScale } from './textures/tiers'
import type { Arrangement, CanvasPhoto, Size } from './types'

export const WALL_COLUMN_WIDTH = 248
export const WALL_GAP = 14
export const ISLAND_COLUMN_WIDTH = 220
export const ISLAND_GAP = 12
export const ISLAND_SPACING = 260
export const ISLAND_LABEL_HEIGHT = 56
export const WALL_MIN_SCALE = 0.2
export const FIT_PADDING = 96

const GROUPED_ZOOM_OUT_ALLOWANCE = 0.85
const WALL_TOP_INSET = 64
const REFERENCE_VIEWPORT: Size = { width: 1920, height: 1200 }

export interface Scene {
  wall: WallLayout | null
  grouped: GroupedLayout | null
}

export const buildScene = (
  photos: CanvasPhoto[],
  colors: (PhotoColor | null)[],
  arrangement: Arrangement,
  viewport: Size,
): Scene => {
  if (arrangement === 'wall') {
    return {
      grouped: null,
      wall: createWallLayout(photos, {
        columnWidth: WALL_COLUMN_WIDTH,
        gap: WALL_GAP,
        minPeriod: {
          width: (Math.max(viewport.width, REFERENCE_VIEWPORT.width) * 2) / WALL_MIN_SCALE,
          height: (Math.max(viewport.height, REFERENCE_VIEWPORT.height) * 2) / WALL_MIN_SCALE,
        },
      }),
    }
  }
  const aspect = viewport.width / Math.max(1, viewport.height)
  if (arrangement === 'color') {
    return {
      wall: null,
      grouped: createSpectrumLayout(photos, colors, { columnWidth: ISLAND_COLUMN_WIDTH, gap: ISLAND_GAP, aspect }),
    }
  }
  return {
    wall: null,
    grouped: createGroupedLayout(groupPhotos(photos, arrangement), photos, {
      columnWidth: ISLAND_COLUMN_WIDTH,
      gap: ISLAND_GAP,
      islandGap: ISLAND_SPACING,
      labelHeight: ISLAND_LABEL_HEIGHT,
      aspect,
    }),
  }
}

export const sceneLimits = (grouped: GroupedLayout | null, viewport: Size, dpr: number): ScaleLimits => {
  if (!grouped) {
    return { min: WALL_MIN_SCALE, max: Math.max(WALL_MIN_SCALE, maxScale(WALL_COLUMN_WIDTH, dpr)) }
  }
  const max = maxScale(ISLAND_COLUMN_WIDTH, dpr)
  const fitted = Math.min(fitRect(grouped.bounds, viewport, FIT_PADDING).scale, max)
  return { min: fitted * GROUPED_ZOOM_OUT_ALLOWANCE, max }
}

export const sceneHome = (grouped: GroupedLayout | null, viewport: Size, limits: ScaleLimits): CameraState => {
  if (!grouped) {
    return { x: viewport.width / 2, y: viewport.height / 2 - WALL_TOP_INSET, scale: 1 }
  }
  const fitted = fitRect(grouped.bounds, viewport, FIT_PADDING)
  return { ...fitted, scale: Math.min(fitted.scale, limits.max) }
}
