import { atom } from 'jotai'

export type GallerySortBy = 'date'
export type GallerySortOrder = 'asc' | 'desc'
export type GalleryViewMode = 'masonry' | 'list' | 'canvas'

export interface DateRangeFilter {
  from: string | null
  to: string | null
}

export const gallerySettingAtom = atom({
  sortBy: 'date' as GallerySortBy,
  sortOrder: 'desc' as GallerySortOrder,
  selectedTags: [] as string[],
  selectedCameras: [] as string[], // Selected camera display names
  selectedLenses: [] as string[], // Selected lens display names
  selectedRatings: null as number | null, // Selected minimum rating threshold
  selectedDateRange: null as DateRangeFilter | null,
  tagFilterMode: 'union' as 'union' | 'intersection', // Tag filtering logic mode

  columns: 'auto' as number | 'auto', // 自定义列数，auto 表示自动计算
  viewMode: 'masonry' as GalleryViewMode, // 视图模式：瀑布流或列表详情
})

export const isExiftoolLoadedAtom = atom(false)

// Command Palette state
export const isCommandPaletteOpenAtom = atom(false)
