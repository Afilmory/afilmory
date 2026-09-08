/**
 * 双击缩放的分段计算
 *
 * 分段顺序（由小到大）：适应屏幕 → 铺满视口 → 100% 原始像素，双击在三段之间循环。
 * 铺满视口 = 照片有一个维度恰好等于视口、另一个维度 ≥ 视口（cover）。
 * 只有铺满仍小于 100% 时它才作为中间段保留：照片比视口还小时铺满会超过 100%，
 * 相当于把照片放大到糊，这种情况直接跳过铺满，双击一次就落到 100%。
 */

const SCALE_MATCH_EPSILON = 0.01

function isSameScale(a: number, b: number): boolean {
  return Math.abs(a / b - 1) < SCALE_MATCH_EPSILON
}

export interface ViewportScaleInput {
  canvasWidth: number
  canvasHeight: number
  imageWidth: number
  imageHeight: number
}

export interface DoubleClickZoomScales {
  /** 适应屏幕：完整显示照片的缩放（contain） */
  fitScale: number
  /** 铺满视口：一个维度贴合视口、另一个维度溢出的缩放（cover） */
  fillScale: number
  /** 100% 原始像素 */
  originalScale: number
}

/** 适应屏幕（contain）：完整显示照片所需的最大缩放 */
export function computeFitScale({ canvasWidth, canvasHeight, imageWidth, imageHeight }: ViewportScaleInput): number {
  return Math.min(canvasWidth / imageWidth, canvasHeight / imageHeight)
}

/** 铺满视口（cover）：一个维度贴合视口、另一个维度溢出的缩放 */
export function computeFillScale({ canvasWidth, canvasHeight, imageWidth, imageHeight }: ViewportScaleInput): number {
  return Math.max(canvasWidth / imageWidth, canvasHeight / imageHeight)
}

/** 双击循环里实际存在的分段，从小到大 */
export function resolveDoubleClickZoomStages({ fitScale, fillScale, originalScale }: DoubleClickZoomScales): number[] {
  const stages = [fitScale]

  if (fillScale < originalScale && !isSameScale(fillScale, fitScale)) {
    stages.push(fillScale)
  }

  if (!isSameScale(originalScale, stages.at(-1)!)) {
    stages.push(originalScale)
  }

  return stages
}

/**
 * 双击后应该落到哪一段。
 * 当前缩放命中某一段时前进到下一段，最后一段回到适应屏幕；
 * 捏合/滚轮自由缩放之后，放大到比当前大的最近一段，已经超过最后一段则回到适应屏幕。
 */
export function resolveNextDoubleClickScale(currentScale: number, stages: number[]): number {
  const currentIndex = stages.findIndex(scale => isSameScale(currentScale, scale))
  if (currentIndex !== -1) {
    return stages[(currentIndex + 1) % stages.length]
  }

  return stages.find(scale => scale > currentScale * (1 + SCALE_MATCH_EPSILON)) ?? stages[0]
}
