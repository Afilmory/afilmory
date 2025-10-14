import { photoLoader } from '@afilmory/data'
import { useAtom, useSetAtom } from 'jotai'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { Drawer } from 'vaul'

import { gallerySettingAtom } from '~/atoms/app'
import { FilterPanel } from '~/components/gallery/FilterPanel'
import { Button } from '~/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu'
import { Slider } from '~/components/ui/slider'
import { useMobile } from '~/hooks/useMobile'
import { usePhotoViewer } from '~/hooks/usePhotoViewer'
import { clsxm } from '~/lib/cn'

const SortPanel = () => {
  const { t } = useTranslation()
  const [gallerySetting, setGallerySetting] = useAtom(gallerySettingAtom)

  const setSortOrder = (order: 'asc' | 'desc') => {
    setGallerySetting({
      ...gallerySetting,
      sortOrder: order,
    })
  }
  return (
    <div className="pb-safe flex flex-col gap-2 p-0 lg:gap-0 lg:pt-0 lg:pb-0 lg:text-sm">
      <h3 className="flex h-6 items-center px-2 text-sm font-medium lg:h-8">
        {t('action.sort.mode')}
      </h3>
      <div className="bg-border mx-2 my-1 h-px" />
      <div
        className={clsxm(
          'hover:bg-accent/50 flex cursor-pointer items-center gap-2 rounded-md bg-transparent px-2 py-3 transition-colors hover:backdrop-blur-3xl lg:py-1',
        )}
        onClick={() => setSortOrder('desc')}
      >
        <i className="i-mingcute-sort-descending-line" />
        <span>{t('action.sort.newest.first')}</span>
        {gallerySetting.sortOrder === 'desc' && (
          <i className="i-mingcute-check-line ml-auto" />
        )}
      </div>
      <div
        className={clsxm(
          'hover:bg-accent/50 flex cursor-pointer items-center gap-2 rounded-md bg-transparent px-2 py-3 transition-colors hover:backdrop-blur-3xl lg:py-1',
        )}
        onClick={() => setSortOrder('asc')}
      >
        <i className="i-mingcute-sort-ascending-line" />
        <span>{t('action.sort.oldest.first')}</span>
        {gallerySetting.sortOrder === 'asc' && (
          <i className="i-mingcute-check-line ml-auto" />
        )}
      </div>
    </div>
  )
}

const ColumnsPanel = () => {
  const { t } = useTranslation()
  const [gallerySetting, setGallerySetting] = useAtom(gallerySettingAtom)
  const isMobile = useMobile()

  const setColumns = (columns: number | 'auto') => {
    setGallerySetting({
      ...gallerySetting,
      columns,
    })
  }
  // 根据设备类型提供不同的列数范围
  const columnRange = isMobile
    ? { min: 2, max: 4 } // 移动端适合的列数范围
    : { min: 2, max: 8 } // 桌面端适合的列数范围

  return (
    <div className="pb-safe lg:pb-safe-2 w-full lg:w-80 lg:p-2">
      <h3 className="mb-3 px-2 text-sm font-medium">
        {t('action.columns.setting')}
      </h3>

      <div className="px-2">
        <Slider
          value={gallerySetting.columns}
          onChange={setColumns}
          min={columnRange.min}
          max={columnRange.max}
          autoLabel={t('action.auto')}
        />
      </div>
    </div>
  )
}

// 搜索照片逻辑
const searchPhotos = (
  photos: ReturnType<typeof photoLoader.getPhotos>,
  query: string,
) => {
  const lowerQuery = query.trim().toLowerCase()
  if (!lowerQuery) return []

  return photos.filter((photo) => {
    // 搜索文件名/标题
    const matchesTitle = photo.title?.toLowerCase().includes(lowerQuery)

    // 搜索描述
    const matchesDescription = photo.description
      ?.toLowerCase()
      .includes(lowerQuery)

    // 搜索标签
    const matchesTags = photo.tags?.some((tag) =>
      tag.toLowerCase().includes(lowerQuery),
    )

    // 搜索相机
    const matchesCamera =
      photo.exif?.Make?.toLowerCase().includes(lowerQuery) ||
      photo.exif?.Model?.toLowerCase().includes(lowerQuery)

    // 搜索镜头
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

const SearchPanel = () => {
  const { t } = useTranslation()
  const [gallerySetting, setGallerySetting] = useAtom(gallerySettingAtom)
  const navigate = useNavigate()
  const { openViewer } = usePhotoViewer()

  const onSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setGallerySetting({
      ...gallerySetting,
      searchQuery: e.target.value,
    })
  }

  const clearSearch = () => {
    setGallerySetting({
      ...gallerySetting,
      searchQuery: '',
    })
  }

  // 使用搜索函数
  const searchResults = useMemo(() => {
    return searchPhotos(photoLoader.getPhotos(), gallerySetting.searchQuery)
  }, [gallerySetting.searchQuery])

  // 点击搜索结果跳转到照片详情
  const handlePhotoClick = (photoId: string) => {
    const allPhotos = photoLoader.getPhotos()
    const photoIndex = allPhotos.findIndex((p) => p.id === photoId)
    if (photoIndex !== -1) {
      openViewer(photoIndex)
      navigate(`/${photoId}`)
    }
  }

  return (
    <div className="pb-safe lg:pb-safe-2 w-full lg:w-[420px] lg:p-2">
      <div className="mb-3 flex items-center justify-between px-2">
        <h3 className="text-sm font-medium">{t('action.search.title')}</h3>
        {gallerySetting.searchQuery && (
          <button
            type="button"
            onClick={clearSearch}
            className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            {t('action.search.clear')}
          </button>
        )}
      </div>

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

        {/* 搜索提示 */}
        {!gallerySetting.searchQuery && (
          <p className="px-1 text-xs text-gray-500 dark:text-gray-400">
            {t('action.search.hint')}
          </p>
        )}

        {/* 搜索结果 */}
        {gallerySetting.searchQuery && (
          <div className="pb-safe-offset-4 lg:pb-safe -mx-2 max-h-96 overflow-y-auto">
            {searchResults.length > 0 ? (
              <div className="space-y-1 px-2 lg:space-y-2">
                <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
                  {t('action.search.results', { count: searchResults.length })}
                </p>
                {searchResults.map((photo) => (
                  <button
                    key={photo.id}
                    type="button"
                    onClick={() => handlePhotoClick(photo.id)}
                    className="hover:bg-accent/50 flex w-full cursor-pointer items-center gap-3 rounded-md bg-transparent p-2 text-left transition-colors lg:gap-4 lg:p-3"
                  >
                    {/* 缩略图 */}
                    <div className="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded lg:h-16 lg:w-16">
                      <img
                        src={photo.thumbnailUrl}
                        alt={photo.title}
                        className="h-full w-full object-cover"
                      />
                    </div>

                    {/* 照片信息 */}
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

                    {/* 箭头图标 */}
                    <i className="i-mingcute-arrow-right-line flex-shrink-0 text-gray-400" />
                  </button>
                ))}
              </div>
            ) : (
              <p className="px-3 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                {t('action.search.no-results')}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// 通用的操作按钮组件
const ActionButton = ({
  icon,
  title,
  badge,
  onClick,
  ref,
  ...props
}: {
  icon: string
  title: string
  badge?: number | string
  onClick: () => void
  ref?: React.RefObject<HTMLButtonElement>
}) => {
  return (
    <Button
      variant="ghost"
      size="sm"
      className="relative h-10 w-10 rounded-full border-0 bg-gray-100 transition-all duration-200 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700"
      title={title}
      onClick={onClick}
      ref={ref}
      {...props}
    >
      <i
        className={clsxm(icon, 'text-base text-gray-600 dark:text-gray-300')}
      />
      {badge && (
        <span className="bg-accent absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full text-xs font-medium text-white shadow-sm">
          {badge}
        </span>
      )}
    </Button>
  )
}

// 桌面端的下拉菜单按钮
const DesktopActionButton = ({
  icon,
  title,
  badge,
  children,
  contentClassName,
  open,
  onOpenChange,
}: {
  icon: string
  title: string
  badge?: number | string
  children: React.ReactNode
  contentClassName?: string
  open?: boolean
  onOpenChange?: (
    open: boolean,
    setGallerySetting: (setting: any) => void,
  ) => void
}) => {
  const setGallerySetting = useSetAtom(gallerySettingAtom)
  return (
    <DropdownMenu
      defaultOpen={open}
      onOpenChange={(open) => {
        onOpenChange?.(open, setGallerySetting)
      }}
    >
      <DropdownMenuTrigger asChild>
        <ActionButton
          icon={icon}
          title={title}
          badge={badge}
          onClick={() => {}}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" className={contentClassName}>
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// 移动端的抽屉按钮
const MobileActionButton = ({
  icon,
  title,
  badge,
  children,
  open,
  onOpenChange,
}: {
  icon: string
  title: string
  badge?: number | string
  children: React.ReactNode
  open: boolean
  onOpenChange: (open: boolean) => void
}) => {
  return (
    <>
      <ActionButton
        icon={icon}
        title={title}
        badge={badge}
        onClick={() => onOpenChange(!open)}
      />
      <Drawer.Root open={open} onOpenChange={onOpenChange}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm" />
          <Drawer.Content className="fixed right-0 bottom-0 left-0 z-50 flex flex-col rounded-t-2xl border-t border-zinc-200 bg-white/80 p-4 backdrop-blur-xl dark:border-zinc-800 dark:bg-black/80">
            <div className="mx-auto mb-4 h-1.5 w-12 flex-shrink-0 rounded-full bg-zinc-300 dark:bg-zinc-700" />
            {children}
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </>
  )
}

// 响应式操作按钮组件
const ResponsiveActionButton = ({
  icon,
  title,
  badge,
  children,
  contentClassName,
  globalOpen,
  onGlobalOpenChange,
}: {
  icon: string
  title: string
  badge?: number | string
  children: React.ReactNode
  contentClassName?: string
  globalOpen?: boolean
  onGlobalOpenChange?: (
    open: boolean,
    setGallerySetting: (setting: any) => void,
  ) => void
}) => {
  const isMobile = useMobile()
  const [open, setOpen] = useState(false)

  if (isMobile) {
    return (
      <MobileActionButton
        icon={icon}
        title={title}
        badge={badge}
        open={open}
        onOpenChange={setOpen}
      >
        {children}
      </MobileActionButton>
    )
  }

  return (
    <DesktopActionButton
      icon={icon}
      title={title}
      badge={badge}
      contentClassName={contentClassName}
      open={globalOpen}
      onOpenChange={onGlobalOpenChange}
    >
      {children}
    </DesktopActionButton>
  )
}

export const ActionGroup = () => {
  const { t } = useTranslation()
  const [gallerySetting, setGallerySetting] = useAtom(gallerySettingAtom)
  const navigate = useNavigate()

  const onTagsPanelOpenChange = (open: boolean) => {
    setGallerySetting((prev: any) => ({
      ...prev,
      isTagsPanelOpen: open,
    }))
  }

  return (
    <div className="flex items-center justify-center gap-3">
      {/* 搜索按钮 */}
      <ResponsiveActionButton
        icon="i-mingcute-search-line"
        title={t('action.search.title')}
        badge={gallerySetting.searchQuery ? '●' : undefined}
      >
        <SearchPanel />
      </ResponsiveActionButton>

      {/* 地图探索按钮 */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate('/explory')}
        className="h-10 w-10 rounded-full border-0 bg-gray-100 transition-all duration-200 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700"
        title={t('action.map.explore')}
      >
        <i className="i-mingcute-map-pin-line text-base text-gray-600 dark:text-gray-300" />
      </Button>

      {/* 过滤按钮 */}
      <ResponsiveActionButton
        icon="i-mingcute-filter-line"
        title={t('action.filter.title')}
        badge={
          gallerySetting.selectedTags.length +
            gallerySetting.selectedCameras.length +
            gallerySetting.selectedLenses.length >
          0
            ? gallerySetting.selectedTags.length +
              gallerySetting.selectedCameras.length +
              gallerySetting.selectedLenses.length
            : undefined
        }
        // 使用全局状态实现滚动时自动收起标签面板
        globalOpen={gallerySetting.isTagsPanelOpen}
        onGlobalOpenChange={onTagsPanelOpenChange}
      >
        <FilterPanel />
      </ResponsiveActionButton>

      {/* 列数调整按钮 */}
      <ResponsiveActionButton
        icon="i-mingcute-grid-line"
        title={t('action.columns.setting')}
        badge={
          gallerySetting.columns !== 'auto' ? gallerySetting.columns : undefined
        }
      >
        <ColumnsPanel />
      </ResponsiveActionButton>

      {/* 排序按钮 */}
      <ResponsiveActionButton
        icon={
          gallerySetting.sortOrder === 'desc'
            ? 'i-mingcute-sort-descending-line'
            : 'i-mingcute-sort-ascending-line'
        }
        title={t('action.sort.mode')}
        contentClassName="w-48"
      >
        <SortPanel />
      </ResponsiveActionButton>
    </div>
  )
}

const panelMap = {
  sort: SortPanel,
  tags: FilterPanel,
  columns: ColumnsPanel,
  search: SearchPanel,
}

export type PanelType = keyof typeof panelMap
// 导出 ActionType 以保持与 FloatingActionButton 的一致性
export type ActionType = PanelType

export const ActionPanel = ({
  open,
  onOpenChange,
  type,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  type: PanelType | null
}) => {
  const Panel = type ? panelMap[type] : null
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm" />
        <Drawer.Content className="fixed right-0 bottom-0 left-0 z-50 flex flex-col rounded-t-2xl border-t border-zinc-200 bg-white/80 p-4 backdrop-blur-xl dark:border-zinc-800 dark:bg-black/80">
          <div className="mx-auto mb-4 h-1.5 w-12 flex-shrink-0 rounded-full bg-zinc-300 dark:bg-zinc-700" />
          {Panel && <Panel />}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}
