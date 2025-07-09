import { photoLoader } from '@afilmory/data'
import { useAtom } from 'jotai'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { Drawer } from 'vaul'

import { gallerySettingAtom } from '~/atoms/app'
import { Button } from '~/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu'
import { Slider } from '~/components/ui/slider'
import { useMobile } from '~/hooks/useMobile'
import { clsxm } from '~/lib/cn'

const allTags = photoLoader.getAllTags()

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
        <span>最新优先</span>
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
        <span>最早优先</span>
        {gallerySetting.sortOrder === 'asc' && (
          <i className="i-mingcute-check-line ml-auto" />
        )}
      </div>
    </div>
  )
}

const TagsPanel = () => {
  const { t } = useTranslation()
  const [gallerySetting, setGallerySetting] = useAtom(gallerySettingAtom)

  const toggleTag = (tag: string) => {
    const newSelectedTags = gallerySetting.selectedTags.includes(tag)
      ? gallerySetting.selectedTags.filter((t) => t !== tag)
      : [...gallerySetting.selectedTags, tag]

    setGallerySetting({
      ...gallerySetting,
      selectedTags: newSelectedTags,
    })
  }

  const clearAllTags = () => {
    setGallerySetting({
      ...gallerySetting,
      selectedTags: [],
    })
  }

  return (
    <div className="lg:pb-safe-2 w-full p-2 pb-0 text-sm lg:w-64 lg:p-0">
      <div className="relative mb-2">
        <h3 className="flex h-6 items-center px-2 font-medium lg:h-8">
          {t('action.tag.filter')}
        </h3>
        {gallerySetting.selectedTags.length > 0 && (
          <Button
            variant="ghost"
            size="xs"
            onClick={clearAllTags}
            className="absolute top-0 right-0 h-8 rounded-md px-2 text-xs"
          >
            清除
          </Button>
        )}
      </div>

      {allTags.length === 0 ? (
        <div className="px-3 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
          暂无标签
        </div>
      ) : (
        <div className="pb-safe-offset-4 lg:pb-safe -mx-4 -mb-4 max-h-64 overflow-y-auto px-4 lg:mx-0 lg:mb-0 lg:px-0">
          {allTags.map((tag) => (
            <div
              key={tag}
              onClick={() => toggleTag(tag)}
              className="hover:bg-accent/50 flex cursor-pointer items-center rounded-md bg-transparent px-2 py-3 lg:py-1"
            >
              <span className="flex-1">{tag}</span>
              {gallerySetting.selectedTags.includes(tag) && (
                <i className="i-mingcute-check-line ml-auto" />
              )}
            </div>
          ))}
        </div>
      )}
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
}: {
  icon: string
  title: string
  badge?: number | string
  children: React.ReactNode
  contentClassName?: string
}) => {
  return (
    <DropdownMenu>
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
}: {
  icon: string
  title: string
  badge?: number | string
  children: React.ReactNode
  contentClassName?: string
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
    >
      {children}
    </DesktopActionButton>
  )
}

export const ActionGroup = () => {
  const { t } = useTranslation()
  const [gallerySetting] = useAtom(gallerySettingAtom)
  const navigate = useNavigate()

  return (
    <div className="flex items-center justify-center gap-3">
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

      {/* 标签筛选按钮 */}
      <ResponsiveActionButton
        icon="i-mingcute-tag-line"
        title={t('action.tag.filter')}
        badge={
          gallerySetting.selectedTags.length > 0
            ? gallerySetting.selectedTags.length
            : undefined
        }
      >
        <TagsPanel />
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
  tags: TagsPanel,
  columns: ColumnsPanel,
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
