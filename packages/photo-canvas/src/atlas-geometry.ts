export interface AtlasGeometry {
  size: number
  cellSize: number
  perRow: number
  perPage: number
  pages: number
}

export const PLACEHOLDER_CELL_SIZE = 32
export const MAX_ATLAS_SIZE = 4096

const nextPowerOfTwo = (value: number) => 2 ** Math.ceil(Math.log2(Math.max(1, value)))

export const atlasGeometry = (
  count: number,
  cellSize = PLACEHOLDER_CELL_SIZE,
  maxSize = MAX_ATLAS_SIZE,
): AtlasGeometry => {
  const side = Math.ceil(Math.sqrt(Math.max(1, count))) * cellSize
  const size = Math.min(maxSize, nextPowerOfTwo(side))
  const perRow = size / cellSize
  const perPage = perRow * perRow
  return { size, cellSize, perRow, perPage, pages: Math.max(1, Math.ceil(count / perPage)) }
}

export const atlasCell = (index: number, geometry: AtlasGeometry) => {
  const slot = index % geometry.perPage
  return {
    x: (slot % geometry.perRow) * geometry.cellSize,
    y: Math.floor(slot / geometry.perRow) * geometry.cellSize,
    layer: Math.floor(index / geometry.perPage),
  }
}
