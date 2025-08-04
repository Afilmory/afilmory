import { photoLoader } from '@afilmory/data'
import { useAtom } from 'jotai'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { gallerySettingAtom } from '~/atoms/app'
import { Button } from '~/components/ui/button'
import { clsxm } from '~/lib/cn'

const allTags = photoLoader.getAllTags()
const allCameras = photoLoader.getAllCameras()
const allLenses = photoLoader.getAllLenses()

export const FilterPanel = () => {
  const { t } = useTranslation()
  const [gallerySetting, setGallerySetting] = useAtom(gallerySettingAtom)
  const [activeTab, setActiveTab] = useState<'tags' | 'cameras' | 'lenses'>(
    'tags',
  )
  const [tagSearchQuery, setTagSearchQuery] = useState(
    gallerySetting.tagSearchQuery,
  )
  const [cameraSearchQuery, setCameraSearchQuery] = useState(
    gallerySetting.cameraSearchQuery,
  )
  const [lensSearchQuery, setLensSearchQuery] = useState(
    gallerySetting.lensSearchQuery,
  )
  const inputRef = useRef<HTMLInputElement>(null)

  // Auto-focus input when panel opens
  useEffect(() => {
    if (gallerySetting.isTagsPanelOpen && inputRef.current) {
      inputRef.current?.focus()
    }
  }, [gallerySetting.isTagsPanelOpen])

  // Toggle handlers with useCallback to prevent re-creation
  const toggleTag = useCallback(
    (tag: string) => {
      setGallerySetting((prev) => {
        const newSelectedTags = prev.selectedTags.includes(tag)
          ? prev.selectedTags.filter((t) => t !== tag)
          : [...prev.selectedTags, tag]

        return {
          ...prev,
          selectedTags: newSelectedTags,
        }
      })
    },
    [setGallerySetting],
  )

  const toggleCamera = useCallback(
    (camera: string) => {
      setGallerySetting((prev) => {
        const newSelectedCameras = prev.selectedCameras.includes(camera)
          ? prev.selectedCameras.filter((c) => c !== camera)
          : [...prev.selectedCameras, camera]

        return {
          ...prev,
          selectedCameras: newSelectedCameras,
        }
      })
    },
    [setGallerySetting],
  )

  const toggleLens = useCallback(
    (lens: string) => {
      setGallerySetting((prev) => {
        const newSelectedLenses = prev.selectedLenses.includes(lens)
          ? prev.selectedLenses.filter((l) => l !== lens)
          : [...prev.selectedLenses, lens]

        return {
          ...prev,
          selectedLenses: newSelectedLenses,
        }
      })
    },
    [setGallerySetting],
  )

  // Clear handlers with useCallback
  const clearTags = useCallback(() => {
    setGallerySetting((prev) => ({
      ...prev,
      selectedTags: [],
      tagSearchQuery: '',
    }))
    setTagSearchQuery('')
  }, [setGallerySetting])

  const clearCameras = useCallback(() => {
    setGallerySetting((prev) => ({
      ...prev,
      selectedCameras: [],
      cameraSearchQuery: '',
    }))
    setCameraSearchQuery('')
  }, [setGallerySetting])

  const clearLenses = useCallback(() => {
    setGallerySetting((prev) => ({
      ...prev,
      selectedLenses: [],
      lensSearchQuery: '',
    }))
    setLensSearchQuery('')
  }, [setGallerySetting])

  // Search handlers with useCallback
  const onTagSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const query = e.target.value
      setTagSearchQuery(query)
      setGallerySetting((prev) => ({
        ...prev,
        tagSearchQuery: query,
      }))
    },
    [setGallerySetting],
  )

  const onCameraSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const query = e.target.value
      setCameraSearchQuery(query)
      setGallerySetting((prev) => ({
        ...prev,
        cameraSearchQuery: query,
      }))
    },
    [setGallerySetting],
  )

  const onLensSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const query = e.target.value
      setLensSearchQuery(query)
      setGallerySetting((prev) => ({
        ...prev,
        lensSearchQuery: query,
      }))
    },
    [setGallerySetting],
  )

  // Filter data based on regex search
  const filterItems = (items: string[], searchQuery: string) => {
    if (!searchQuery) return items

    try {
      const regex = new RegExp(searchQuery, 'i')
      return items.filter((item) => regex.test(item))
    } catch {
      return items.filter((item) =>
        item.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    }
  }

  const filteredTags = filterItems(allTags, tagSearchQuery)
  const filteredCameras = filterItems(
    allCameras.map((camera) => camera.displayName),
    cameraSearchQuery,
  )
  const filteredLenses = filterItems(
    allLenses.map((lens) => lens.displayName),
    lensSearchQuery,
  )

  // Tab data configuration with useMemo to prevent recreation
  const tabs = useMemo(
    () => [
      {
        id: 'tags' as const,
        label: t('action.tag.filter'),
        icon: 'i-mingcute-tag-line',
        count: gallerySetting.selectedTags.length,
        data: allTags,
        filteredData: filteredTags,
        selectedItems: gallerySetting.selectedTags,
        searchQuery: tagSearchQuery,
        searchPlaceholder: t('action.tag.search'),
        emptyMessage: t('action.tag.empty'),
        notFoundMessage: t('action.tag.not-found'),
        onToggle: toggleTag,
        onClear: clearTags,
        onSearchChange: onTagSearchChange,
      },
      {
        id: 'cameras' as const,
        label: t('action.camera.filter'),
        icon: 'i-mingcute-camera-line',
        count: gallerySetting.selectedCameras.length,
        data: allCameras.map((camera) => camera.displayName),
        filteredData: filteredCameras,
        selectedItems: gallerySetting.selectedCameras,
        searchQuery: cameraSearchQuery,
        searchPlaceholder: t('action.camera.search'),
        emptyMessage: t('action.camera.empty'),
        notFoundMessage: t('action.camera.not-found'),
        onToggle: toggleCamera,
        onClear: clearCameras,
        onSearchChange: onCameraSearchChange,
      },
      {
        id: 'lenses' as const,
        label: t('action.lens.filter'),
        icon: 'i-ri-camera-lens-line',
        count: gallerySetting.selectedLenses.length,
        data: allLenses.map((lens) => lens.displayName),
        filteredData: filteredLenses,
        selectedItems: gallerySetting.selectedLenses,
        searchQuery: lensSearchQuery,
        searchPlaceholder: t('action.lens.search'),
        emptyMessage: t('action.lens.empty'),
        notFoundMessage: t('action.lens.not-found'),
        onToggle: toggleLens,
        onClear: clearLenses,
        onSearchChange: onLensSearchChange,
      },
    ],
    [
      t,
      gallerySetting.selectedTags,
      gallerySetting.selectedCameras,
      gallerySetting.selectedLenses,
      filteredTags,
      filteredCameras,
      filteredLenses,
      tagSearchQuery,
      cameraSearchQuery,
      lensSearchQuery,
      toggleTag,
      toggleCamera,
      toggleLens,
      clearTags,
      clearCameras,
      clearLenses,
      onTagSearchChange,
      onCameraSearchChange,
      onLensSearchChange,
    ],
  )

  const currentTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTab)!,
    [tabs, activeTab],
  )

  return (
    <div className="lg:pb-safe-2 w-full p-2 pb-0 text-sm lg:w-80 lg:p-0">
      {/* Header with title */}
      <div className="relative mb-2 flex items-center justify-between">
        <h3 className="flex h-6 items-center px-2 text-base font-medium lg:h-8">
          {t('action.filter.title')}
        </h3>

        {/* Reset all filters */}
        <Button
          variant="ghost"
          className="opacity-80"
          size="xs"
          onClick={() => {
            setGallerySetting((prev) => ({
              ...prev,
              selectedTags: [],
              selectedCameras: [],
              selectedLenses: [],
              tagSearchQuery: '',
              cameraSearchQuery: '',
              lensSearchQuery: '',
            }))
          }}
        >
          <i className="i-mingcute-refresh-1-line mr-1 text-sm" />
          Reset
        </Button>
      </div>

      {/* Tab Navigation - Improved spacing and layout */}
      <div className="mb-2 flex rounded-lg bg-zinc-100 p-1 dark:bg-zinc-800">
        {tabs.map((tab) => (
          <button
            type="button"
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={clsxm(
              'min-w-0 flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-2.5 text-xs font-medium transition-all duration-200',
              activeTab === tab.id
                ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-white'
                : 'text-zinc-600 hover:bg-zinc-200/50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-700/50 dark:hover:text-zinc-300',
            )}
          >
            <i className={clsxm(tab.icon, 'shrink-0 text-sm')} />
            <span className="truncate text-center leading-tight">
              {tab.label}
            </span>
            {tab.count > 0 && (
              <span className="bg-accent flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-xs text-white">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="space-y-3">
        {/* Search and Clear section - Aligned on same baseline */}
        <div className="px-2">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <input
                ref={activeTab === currentTab.id ? inputRef : undefined}
                type="text"
                placeholder={currentTab.searchPlaceholder}
                value={currentTab.searchQuery}
                onChange={currentTab.onSearchChange}
                className="w-full rounded-md border border-gray-200 bg-transparent px-3 py-2 pr-9 text-sm placeholder:text-gray-500 focus:border-gray-400 focus:outline-none dark:border-gray-700 dark:text-white dark:placeholder:text-gray-400 dark:focus:border-gray-500"
              />
              <i className="i-mingcute-search-line absolute top-1/2 right-3 -translate-y-1/2 text-gray-400" />
            </div>
            {currentTab.count > 0 && (
              <Button
                variant="ghost"
                size="xs"
                onClick={currentTab.onClear}
                className="flex h-9 items-center gap-1 rounded-md px-2 text-xs whitespace-nowrap"
              >
                <i className="i-mingcute-delete-line text-sm" />
                {t('action.tag.clear')}
              </Button>
            )}
          </div>
        </div>

        {/* Content area - Clean list without background */}
        {currentTab.data.length === 0 ? (
          <div className="px-3 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
            {currentTab.emptyMessage}
          </div>
        ) : currentTab.filteredData.length === 0 ? (
          <div className="px-3 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
            {currentTab.notFoundMessage}
          </div>
        ) : (
          <div className="pb-safe-offset-4 lg:pb-safe -mx-4 -mb-4 max-h-64 overflow-y-auto px-4 lg:mx-0 lg:mb-0 lg:px-0">
            {currentTab.filteredData.map((item) => (
              <div
                key={item}
                onClick={() => currentTab.onToggle(item)}
                className={clsxm(
                  'hover:bg-accent/50 flex cursor-pointer items-center rounded-md bg-transparent px-2 py-2.5 transition-colors lg:py-2',
                  currentTab.selectedItems.includes(item) && 'bg-accent/20',
                )}
              >
                <span className="mr-2 flex-1 truncate">{item}</span>
                {currentTab.selectedItems.includes(item) && (
                  <i className="i-mingcute-check-line ml-auto text-green-600 dark:text-green-400" />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
