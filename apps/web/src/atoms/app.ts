import { atom } from 'jotai'

export type GallerySortBy = 'date'
export type GallerySortOrder = 'asc' | 'desc'

export const gallerySettingAtom = atom({
  sortBy: 'date' as GallerySortBy,
  sortOrder: 'desc' as GallerySortOrder,
  selectedTags: [] as string[],
  selectedCameras: [] as string[], // Selected camera display names
  selectedLenses: [] as string[], // Selected lens display names
  selectedRatings: null as number | null, // Selected minimum rating threshold
  tagSearchQuery: '' as string,
  cameraSearchQuery: '' as string, // Camera search query
  lensSearchQuery: '' as string, // Lens search query
  ratingSearchQuery: '' as string, // Rating search query
  isTagsPanelOpen: false as boolean,
  columns: 'auto' as number | 'auto', // 自定义列数，auto 表示自动计算
})

export const isExiftoolLoadedAtom = atom(false)
