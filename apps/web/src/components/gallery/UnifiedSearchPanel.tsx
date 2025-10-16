import { photoLoader } from '@afilmory/data'
import { useAtom } from 'jotai'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'

import { gallerySettingAtom } from '~/atoms/app'
import { Checkbox } from '~/components/ui/checkbox'
import { usePhotoViewer } from '~/hooks/usePhotoViewer'
import { clsxm } from '~/lib/cn'

const allTags = photoLoader.getAllTags()
const allCameras = photoLoader.getAllCameras()
const allLenses = photoLoader.getAllLenses()

type SearchPreset = 'all' | 'tags' | 'cameras' | 'lenses' | 'ratings'

// 统一的搜索逻辑
const searchPhotos = (
  photos: ReturnType<typeof photoLoader.getPhotos>,
  query: string,
) => {
  const lowerQuery = query.trim().toLowerCase()
  if (!lowerQuery) return []

  return photos.filter((photo) => {
    const matchesTitle = photo.title?.toLowerCase().includes(lowerQuery)
    const matchesDescription = photo.description
      ?.toLowerCase()
      .includes(lowerQuery)
    const matchesTags = photo.tags?.some((tag) =>
      tag.toLowerCase().includes(lowerQuery),
    )
    const matchesCamera =
      photo.exif?.Make?.toLowerCase().includes(lowerQuery) ||
      photo.exif?.Model?.toLowerCase().includes(lowerQuery)
    const matchesLens =
      photo.exif?.LensModel?.toLowerCase().includes(lowerQuery)

    return (
      matchesTitle ||
      matchesDescription ||
      matchesTags ||
      matchesCamera ||
      matchesLens
    )
  })
}

export const UnifiedSearchPanel = () => {
  const { t } = useTranslation()
  const [gallerySetting, setGallerySetting] = useAtom(gallerySettingAtom)
  const navigate = useNavigate()
  const { openViewer } = usePhotoViewer()
  const [activePreset, setActivePreset] = useState<SearchPreset>('all')

  // 全局搜索查询
  const onSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setGallerySetting({
      ...gallerySetting,
      searchQuery: e.target.value,
    })
  }

  // 全局搜索结果
  const searchResults = useMemo(() => {
    return searchPhotos(photoLoader.getPhotos(), gallerySetting.searchQuery)
  }, [gallerySetting.searchQuery])

  // 点击搜索结果
  const handlePhotoClick = (photoId: string) => {
    const allPhotos = photoLoader.getPhotos()
    const photoIndex = allPhotos.findIndex((p) => p.id === photoId)
    if (photoIndex !== -1) {
      openViewer(photoIndex)
      navigate(`/${photoId}`)
    }
  }

  // 切换标签
  const toggleTag = useCallback(
    (tag: string) => {
      setGallerySetting((prev) => ({
        ...prev,
        selectedTags: prev.selectedTags.includes(tag)
          ? prev.selectedTags.filter((t) => t !== tag)
          : [...prev.selectedTags, tag],
      }))
    },
    [setGallerySetting],
  )

  // 切换相机
  const toggleCamera = useCallback(
    (camera: string) => {
      setGallerySetting((prev) => ({
        ...prev,
        selectedCameras: prev.selectedCameras.includes(camera)
          ? prev.selectedCameras.filter((c) => c !== camera)
          : [...prev.selectedCameras, camera],
      }))
    },
    [setGallerySetting],
  )

  // 切换镜头
  const toggleLens = useCallback(
    (lens: string) => {
      setGallerySetting((prev) => ({
        ...prev,
        selectedLenses: prev.selectedLenses.includes(lens)
          ? prev.selectedLenses.filter((l) => l !== lens)
          : [...prev.selectedLenses, lens],
      }))
    },
    [setGallerySetting],
  )

  // 设置评分
  const setRating = useCallback(
    (rating: number | null) => {
      setGallerySetting((prev) => ({
        ...prev,
        selectedRatings: rating,
      }))
    },
    [setGallerySetting],
  )

  // 清除所有过滤器
  const clearAllFilters = () => {
    setGallerySetting((prev) => ({
      ...prev,
      selectedTags: [],
      selectedCameras: [],
      selectedLenses: [],
      selectedRatings: null,
      searchQuery: '',
      tagFilterMode: 'union',
    }))
  }

  // 计算激活的过滤器数量
  const activeFiltersCount =
    gallerySetting.selectedTags.length +
    gallerySetting.selectedCameras.length +
    gallerySetting.selectedLenses.length +
    (gallerySetting.selectedRatings !== null ? 1 : 0)

  // 预设配置
  const presets = [
    {
      id: 'all' as const,
      label: t('action.search.preset.all'),
      icon: 'i-mingcute-search-line',
    },
    {
      id: 'tags' as const,
      label: t('action.tag.filter'),
      icon: 'i-mingcute-tag-line',
      count: gallerySetting.selectedTags.length,
    },
    {
      id: 'cameras' as const,
      label: t('action.camera.filter'),
      icon: 'i-mingcute-camera-line',
      count: gallerySetting.selectedCameras.length,
    },
    {
      id: 'lenses' as const,
      label: t('action.lens.filter'),
      icon: 'i-ri-camera-lens-line',
      count: gallerySetting.selectedLenses.length,
    },
    {
      id: 'ratings' as const,
      label: t('action.rating.filter'),
      icon: 'i-mingcute-star-line',
      count: gallerySetting.selectedRatings !== null ? 1 : 0,
    },
  ]

  return (
    <div className="pb-safe lg:pb-safe-2 w-full lg:w-[520px] lg:py-1">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between px-2">
        <h3 className="text-sm font-medium">
          {t('action.search.unified.title')}
        </h3>
        {(gallerySetting.searchQuery || activeFiltersCount > 0) && (
          <button
            type="button"
            onClick={clearAllFilters}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <i className="i-mingcute-refresh-1-line" />
            {t('action.search.clear')}
          </button>
        )}
      </div>

      {/* 搜索输入框 */}
      <div className="px-2">
        <div className="relative mb-3">
          <input
            type="text"
            placeholder={t('action.search.placeholder')}
            value={gallerySetting.searchQuery}
            onChange={onSearchChange}
            className="w-full rounded-md border border-gray-200 bg-transparent px-3 py-2 pr-9 text-sm placeholder:text-gray-500 focus:border-gray-400 focus:outline-none dark:border-gray-700 dark:text-white dark:placeholder:text-gray-400 dark:focus:border-gray-500"
            autoFocus
          />
          <i className="i-mingcute-search-line absolute top-1/2 right-3 -translate-y-1/2 text-gray-400" />
        </div>

        {/* 预设快速过滤器 */}
        <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1">
          {presets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => setActivePreset(preset.id)}
              className={clsxm(
                'relative flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                activePreset === preset.id
                  ? 'bg-accent text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700',
              )}
            >
              <i className={preset.icon} />
              <span>{preset.label}</span>
              {preset.count !== undefined && preset.count > 0 && (
                <span
                  className={clsxm(
                    'flex h-4 w-4 items-center justify-center rounded-full text-xs',
                    activePreset === preset.id
                      ? 'bg-white/20 text-white'
                      : 'bg-accent text-white',
                  )}
                >
                  {preset.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* 内容区域 */}
      <div className="pb-safe-offset-4 lg:pb-safe -mx-2 max-h-96 overflow-y-auto px-2">
        {/* 全局搜索结果 */}
        {activePreset === 'all' && (
          <>
            {!gallerySetting.searchQuery ? (
              <p className="px-3 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                {t('action.search.hint')}
              </p>
            ) : searchResults.length > 0 ? (
              <div className="space-y-1 lg:space-y-2">
                <p className="mb-2 px-1 text-xs text-gray-500 dark:text-gray-400">
                  {t('action.search.results', { count: searchResults.length })}
                </p>
                {searchResults.map((photo) => (
                  <button
                    key={photo.id}
                    type="button"
                    onClick={() => handlePhotoClick(photo.id)}
                    className="hover:bg-accent/50 flex w-full cursor-pointer items-center gap-3 rounded-md bg-transparent p-2 text-left transition-colors lg:gap-4 lg:p-3"
                  >
                    <div className="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded lg:h-16 lg:w-16">
                      <img
                        src={photo.thumbnailUrl}
                        alt={photo.title}
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                        {photo.title || 'Untitled'}
                      </p>
                      <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                        {photo.exif?.Make && photo.exif?.Model
                          ? `${photo.exif.Make} ${photo.exif.Model}`
                          : photo.tags?.[0] || 'No info'}
                      </p>
                    </div>
                    <i className="i-mingcute-arrow-right-line flex-shrink-0 text-gray-400" />
                  </button>
                ))}
              </div>
            ) : (
              <p className="px-3 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                {t('action.search.no-results')}
              </p>
            )}
          </>
        )}

        {/* 标签过滤器 */}
        {activePreset === 'tags' && (
          <FilterList
            items={allTags}
            selectedItems={gallerySetting.selectedTags}
            onToggle={toggleTag}
            emptyMessage={t('action.tag.empty')}
            showMatchMode
            matchMode={gallerySetting.tagFilterMode}
            onMatchModeChange={(mode) =>
              setGallerySetting((prev) => ({ ...prev, tagFilterMode: mode }))
            }
          />
        )}

        {/* 相机过滤器 */}
        {activePreset === 'cameras' && (
          <FilterList
            items={allCameras.map((c) => c.displayName)}
            selectedItems={gallerySetting.selectedCameras}
            onToggle={toggleCamera}
            emptyMessage={t('action.camera.empty')}
          />
        )}

        {/* 镜头过滤器 */}
        {activePreset === 'lenses' && (
          <FilterList
            items={allLenses.map((l) => l.displayName)}
            selectedItems={gallerySetting.selectedLenses}
            onToggle={toggleLens}
            emptyMessage={t('action.lens.empty')}
          />
        )}

        {/* 评分过滤器 */}
        {activePreset === 'ratings' && (
          <StarRating
            value={gallerySetting.selectedRatings}
            onChange={setRating}
          />
        )}
      </div>
    </div>
  )
}

// 过滤器列表组件
const FilterList = ({
  items,
  selectedItems,
  onToggle,
  emptyMessage,
  showMatchMode = false,
  matchMode = 'union',
  onMatchModeChange,
}: {
  items: string[]
  selectedItems: string[]
  onToggle: (item: string) => void
  emptyMessage: string
  showMatchMode?: boolean
  matchMode?: 'union' | 'intersection'
  onMatchModeChange?: (mode: 'union' | 'intersection') => void
}) => {
  const { t } = useTranslation()
  const [searchQuery, setSearchQuery] = useState('')

  const filteredItems = useMemo(() => {
    if (!searchQuery) return items
    const lower = searchQuery.toLowerCase()
    return items.filter((item) => item.toLowerCase().includes(lower))
  }, [items, searchQuery])

  if (items.length === 0) {
    return (
      <p className="px-3 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
        {emptyMessage}
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {/* 搜索框 */}
      <div className="relative px-1">
        <input
          type="text"
          placeholder={t('action.search.filter.placeholder')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full rounded-md border border-gray-200 bg-transparent px-3 py-1.5 pr-9 text-xs placeholder:text-gray-500 focus:border-gray-400 focus:outline-none dark:border-gray-700 dark:text-white dark:placeholder:text-gray-400 dark:focus:border-gray-500"
        />
        <i className="i-mingcute-search-line absolute top-1/2 right-4 -translate-y-1/2 text-xs text-gray-400" />
      </div>

      {/* 匹配模式 */}
      {showMatchMode && selectedItems.length > 0 && (
        <div className="flex items-center gap-3 px-1 text-xs text-gray-600 dark:text-gray-400">
          <span>{t('action.tag.match.label')}</span>
          <label className="flex cursor-pointer items-center gap-1.5">
            <Checkbox
              checked={matchMode === 'union'}
              onCheckedChange={() => onMatchModeChange?.('union')}
            />
            <span>{t('action.tag.match.any')}</span>
          </label>
          <label className="flex cursor-pointer items-center gap-1.5">
            <Checkbox
              checked={matchMode === 'intersection'}
              onCheckedChange={() => onMatchModeChange?.('intersection')}
            />
            <span>{t('action.tag.match.all')}</span>
          </label>
        </div>
      )}

      {/* 过滤项列表 */}
      {filteredItems.length === 0 ? (
        <p className="px-3 py-8 text-center text-xs text-gray-500 dark:text-gray-400">
          {t('action.search.filter.no-results')}
        </p>
      ) : (
        <div className="space-y-0.5">
          {filteredItems.map((item) => {
            const isSelected = selectedItems.includes(item)
            return (
              <div
                key={item}
                onClick={() => onToggle(item)}
                className={clsxm(
                  'hover:bg-accent/50 flex cursor-pointer items-center rounded-md px-2 py-2 text-sm transition-colors',
                  isSelected && 'bg-accent/20',
                )}
              >
                <span className="mr-2 flex-1 truncate">{item}</span>
                {isSelected && (
                  <i className="i-mingcute-check-line ml-auto text-green-600 dark:text-green-400" />
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// 评分组件
const StarRating = ({
  value,
  onChange,
}: {
  value: number | null
  onChange: (rating: number | null) => void
}) => {
  const { t } = useTranslation()
  const [hoveredRating, setHoveredRating] = useState<number | null>(null)

  return (
    <div className="flex flex-col items-center space-y-3 py-8">
      <div className="text-sm text-gray-600 dark:text-gray-400">
        {value !== null
          ? t('action.rating.filter-above', { rating: value })
          : t('action.rating.filter-all')}
      </div>
      <div className="flex space-x-1">
        {[1, 2, 3, 4, 5].map((rating) => (
          <button
            key={rating}
            type="button"
            className="cursor-pointer transition-all duration-200 hover:scale-110"
            onClick={() => onChange(value === rating ? null : rating)}
            onMouseEnter={() => setHoveredRating(rating)}
            onMouseLeave={() => setHoveredRating(null)}
          >
            <i
              className={clsxm(
                'text-3xl',
                rating <= (hoveredRating ?? value ?? 0)
                  ? 'i-mingcute-star-fill text-yellow-400 dark:text-yellow-500'
                  : 'i-mingcute-star-line text-gray-300 dark:text-gray-600',
              )}
            />
          </button>
        ))}
      </div>
    </div>
  )
}
