import { photoLoader } from '@afilmory/data'
import { clsxm } from '@afilmory/utils'
import { useAtom } from 'jotai'
import * as React from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'

import { gallerySettingAtom } from '~/atoms/app'
import { usePhotoViewer } from '~/hooks/usePhotoViewer'
import { MageLens } from '~/icons'

// Command types
type CommandType = 'search' | 'filter' | 'action' | 'photo'

interface Command {
  id: string
  type: CommandType
  title: string
  subtitle?: string
  icon: string | React.ReactNode
  action: () => void
  keywords?: string[]
  badge?: string | number
  active?: boolean
}

interface CommandPaletteProps {
  isOpen: boolean
  onClose: () => void
}

const allTags = photoLoader.getAllTags()
const allCameras = photoLoader.getAllCameras()
const allLenses = photoLoader.getAllLenses()

// Fuzzy search utility
const fuzzyMatch = (text: string, query: string): boolean => {
  const lowerText = text.toLowerCase()
  const lowerQuery = query.toLowerCase()

  if (lowerText.includes(lowerQuery)) return true

  let queryIndex = 0
  for (let i = 0; i < lowerText.length && queryIndex < lowerQuery.length; i++) {
    if (lowerText[i] === lowerQuery[queryIndex]) {
      queryIndex++
    }
  }
  return queryIndex === lowerQuery.length
}

// Search photos utility
const searchPhotos = (photos: ReturnType<typeof photoLoader.getPhotos>, query: string) => {
  const lowerQuery = query.trim().toLowerCase()
  if (!lowerQuery) return []

  return photos.filter((photo) => {
    const matchesTitle = photo.title?.toLowerCase().includes(lowerQuery)
    const matchesDescription = photo.description?.toLowerCase().includes(lowerQuery)
    const matchesTags = photo.tags?.some((tag) => tag.toLowerCase().includes(lowerQuery))
    const matchesCamera =
      photo.exif?.Make?.toLowerCase().includes(lowerQuery) || photo.exif?.Model?.toLowerCase().includes(lowerQuery)
    const matchesLens = photo.exif?.LensModel?.toLowerCase().includes(lowerQuery)

    return matchesTitle || matchesDescription || matchesTags || matchesCamera || matchesLens
  })
}

export const CommandPalette = ({ isOpen, onClose }: CommandPaletteProps) => {
  const { t } = useTranslation()
  const [gallerySetting, setGallerySetting] = useAtom(gallerySettingAtom)
  const navigate = useNavigate()
  const { openViewer } = usePhotoViewer()

  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const updateTagFilterMode = useCallback(
    (mode: 'union' | 'intersection') => {
      setGallerySetting((prev) => ({
        ...prev,
        tagFilterMode: mode,
      }))
    },
    [setGallerySetting],
  )

  const handleReset = useCallback(() => {
    setQuery('')
    setSelectedIndex(0)
    setGallerySetting((prev) => ({
      ...prev,
      selectedTags: [],
      selectedCameras: [],
      selectedLenses: [],
      selectedRatings: null,
      tagFilterMode: 'union',
    }))
  }, [setGallerySetting])

  // Reset state when opened
  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setSelectedIndex(0)
      const timer = setTimeout(() => inputRef.current?.focus(), 50)
      return () => clearTimeout(timer)
    }
  }, [isOpen])

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  // Generate commands
  const commands = useMemo((): Command[] => {
    const cmds: Command[] = []

    // Filter commands - Tags
    if (allTags.length > 0) {
      allTags.forEach((tag) => {
        const isActive = gallerySetting.selectedTags.includes(tag)
        cmds.push({
          id: `tag-${tag}`,
          type: 'filter',
          title: tag,
          subtitle: t('action.tag.filter'),
          icon: 'i-mingcute-tag-line',
          active: isActive,
          action: () => {
            setGallerySetting((prev) => ({
              ...prev,
              selectedTags: isActive ? prev.selectedTags.filter((t) => t !== tag) : [...prev.selectedTags, tag],
            }))
          },
          keywords: ['tag', 'filter', tag],
        })
      })
    }

    // Filter commands - Cameras
    if (allCameras.length > 0) {
      allCameras.forEach((camera) => {
        const isActive = gallerySetting.selectedCameras.includes(camera.displayName)
        cmds.push({
          id: `camera-${camera.displayName}`,
          type: 'filter',
          title: camera.displayName,
          subtitle: t('action.camera.filter'),
          icon: 'i-mingcute-camera-line',
          active: isActive,
          action: () => {
            setGallerySetting((prev) => ({
              ...prev,
              selectedCameras: isActive
                ? prev.selectedCameras.filter((c) => c !== camera.displayName)
                : [...prev.selectedCameras, camera.displayName],
            }))
          },
          keywords: ['camera', 'filter', camera.displayName, camera.make, camera.model],
        })
      })
    }

    // Filter commands - Lenses
    if (allLenses.length > 0) {
      allLenses.forEach((lens) => {
        const isActive = gallerySetting.selectedLenses.includes(lens.displayName)
        cmds.push({
          id: `lens-${lens.displayName}`,
          type: 'filter',
          title: lens.displayName,
          subtitle: t('action.lens.filter'),
          icon: <MageLens />,
          active: isActive,
          action: () => {
            setGallerySetting((prev) => ({
              ...prev,
              selectedLenses: isActive
                ? prev.selectedLenses.filter((l) => l !== lens.displayName)
                : [...prev.selectedLenses, lens.displayName],
            }))
          },
          keywords: ['lens', 'filter', lens.displayName],
        })
      })
    }

    // Tag filter mode toggle
    if (allTags.length > 0) {
      const isUnionMode = gallerySetting.tagFilterMode === 'union'
      cmds.push({
        id: 'tag-filter-mode-toggle',
        type: 'action',
        title: isUnionMode ? t('action.tag.match.any') : t('action.tag.match.all'),
        subtitle: t('action.tag.match.label'),
        icon: 'i-mingcute-switch-line',
        badge: isUnionMode ? t('action.tag.mode.or') : t('action.tag.mode.and'),
        action: () => updateTagFilterMode(isUnionMode ? 'intersection' : 'union'),
        keywords: ['tag', 'filter', 'mode', 'toggle'],
      })
    }

    // Filter commands - Ratings
    for (let rating = 1; rating <= 5; rating++) {
      const isActive = gallerySetting.selectedRatings === rating
      cmds.push({
        id: `rating-${rating}`,
        type: 'filter',
        title: t('action.rating.filter-above', { rating }),
        subtitle: t('action.rating.filter'),
        icon: 'i-mingcute-star-line',
        active: isActive,
        action: () => {
          setGallerySetting((prev) => ({
            ...prev,
            selectedRatings: isActive ? null : rating,
          }))
        },
        keywords: ['rating', 'filter', 'star', rating.toString()],
      })
    }

    // Clear all filters
    const hasFilters =
      gallerySetting.selectedTags.length > 0 ||
      gallerySetting.selectedCameras.length > 0 ||
      gallerySetting.selectedLenses.length > 0 ||
      gallerySetting.selectedRatings !== null

    if (hasFilters) {
      cmds.push({
        id: 'clear-filters',
        type: 'action',
        title: t('action.search.clear'),
        subtitle: 'Clear all active filters',
        icon: 'i-mingcute-close-line',
        action: () => {
          setGallerySetting((prev) => ({
            ...prev,
            selectedTags: [],
            selectedCameras: [],
            selectedLenses: [],
            selectedRatings: null,
            tagFilterMode: 'union',
          }))
        },
        keywords: ['clear', 'reset', 'remove', 'filter'],
      })
    }

    // Photo search results
    if (query.trim()) {
      const photos = searchPhotos(photoLoader.getPhotos(), query)
      photos.slice(0, 10).forEach((photo) => {
        cmds.push({
          id: `photo-${photo.id}`,
          type: 'photo',
          title: photo.title || photo.id,
          subtitle: photo.description || `${photo.exif?.Model || 'Photo'}`,
          icon: <img src={photo.thumbnailUrl} alt={photo.title || 'Photo'} className="h-6 w-6 rounded object-cover" />,
          action: () => {
            const allPhotos = photoLoader.getPhotos()
            const photoIndex = allPhotos.findIndex((p) => p.id === photo.id)
            if (photoIndex !== -1) {
              openViewer(photoIndex)
              navigate(`/photos/${photo.id}`)
              onClose()
            }
          },
          keywords: [photo.title, photo.description, ...(photo.tags || [])].filter(Boolean) as string[],
        })
      })
    }

    return cmds
  }, [t, gallerySetting, query, navigate, onClose, setGallerySetting, openViewer, updateTagFilterMode])

  // Filter commands based on query
  const filteredCommands = useMemo(() => {
    if (!query.trim()) {
      // Show all filters when no query - group by type
      const activeFilters = commands.filter((cmd) => cmd.active)
      const allFilters = commands.filter((cmd) => cmd.type === 'filter')

      // Prioritize active filters, then show all available filters
      const uniqueFilters = new Map<string, Command>()

      // First add active filters
      activeFilters.forEach((cmd) => uniqueFilters.set(cmd.id, cmd))

      // Then add remaining filters
      allFilters.forEach((cmd) => {
        if (!uniqueFilters.has(cmd.id)) {
          uniqueFilters.set(cmd.id, cmd)
        }
      })

      return Array.from(uniqueFilters.values()).slice(0, 30)
    }

    return commands
      .filter((cmd) => {
        const searchText = `${cmd.title} ${cmd.subtitle || ''} ${cmd.keywords?.join(' ') || ''}`
        return fuzzyMatch(searchText, query)
      })
      .slice(0, 20)
  }, [commands, query])

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown': {
          e.preventDefault()
          setSelectedIndex((prev) => Math.min(prev + 1, filteredCommands.length - 1))
          break
        }
        case 'ArrowUp': {
          e.preventDefault()
          setSelectedIndex((prev) => Math.max(prev - 1, 0))
          break
        }
        case 'Enter': {
          e.preventDefault()
          if (filteredCommands[selectedIndex]) {
            filteredCommands[selectedIndex].action()
          }
          break
        }
      }
    },
    [filteredCommands, selectedIndex],
  )

  // Scroll selected item into view
  useEffect(() => {
    const selectedElement = listRef.current?.children[selectedIndex] as HTMLElement
    if (selectedElement) {
      selectedElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [selectedIndex])

  // Reset selected index when filtered commands change
  useEffect(() => {
    setSelectedIndex(0)
  }, [filteredCommands.length])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-9999 flex items-end justify-center lg:items-start lg:pt-[15vh]" onClick={onClose}>
      {/* Backdrop with blur */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-xl transition-all duration-200" />

      {/* Command Palette Panel */}
      <div
        className="animate-in fade-in slide-in-from-bottom-4 border-accent/20 lg:slide-in-from-top-4 relative w-full max-w-2xl overflow-hidden rounded-2xl rounded-b-none border backdrop-blur-2xl duration-200 lg:rounded-2xl!"
        style={{
          backgroundImage:
            'linear-gradient(to bottom right, color-mix(in srgb, var(--color-background) 98%, transparent), color-mix(in srgb, var(--color-background) 95%, transparent))',
          boxShadow:
            '0 8px 32px color-mix(in srgb, var(--color-accent) 8%, transparent), 0 4px 16px color-mix(in srgb, var(--color-accent) 6%, transparent), 0 2px 8px rgba(0, 0, 0, 0.1)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Inner glow layer */}
        <div
          className="pointer-events-none absolute inset-0 rounded-2xl"
          style={{
            background:
              'linear-gradient(to bottom right, color-mix(in srgb, var(--color-accent) 5%, transparent), transparent, color-mix(in srgb, var(--color-accent) 5%, transparent))',
          }}
        />
        {/* Search Input */}
        <div className="border-accent/20 relative flex items-center gap-3 border-b px-4 py-4">
          <i className="i-mingcute-search-line text-text-tertiary shrink-0 text-xl" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('action.search.placeholder')}
            className="text-text placeholder-text-tertiary flex-1 bg-transparent text-base outline-none"
          />
          <button
            type="button"
            onClick={handleReset}
            className="glassmorphic-btn border-accent/20 text-text-secondary inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-medium transition-all duration-200"
          >
            <i className="i-mingcute-refresh-1-line text-sm" />
            Reset
          </button>
          <button
            type="button"
            onClick={onClose}
            className="glassmorphic-btn border-accent/20 text-text-secondary inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-medium transition-all duration-200"
          >
            <i className="i-mingcute-close-line text-sm" />
            Close
          </button>
        </div>

        <div className="border-accent/20 bg-accent/3 text-text-secondary relative flex items-center justify-between gap-3 border-b px-4 py-2 text-xs">
          <div className="flex items-center gap-2">
            <i className="i-mingcute-filter-3-line text-sm" />
            <span>{t('action.tag.match.label')}</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => updateTagFilterMode('union')}
              className={clsxm(
                'rounded-full px-3 py-1 text-xs font-medium transition-all duration-200',
                gallerySetting.tagFilterMode === 'union'
                  ? 'bg-accent text-white'
                  : 'glassmorphic-btn text-text-secondary',
              )}
            >
              {t('action.tag.match.any')}
            </button>
            <button
              type="button"
              onClick={() => updateTagFilterMode('intersection')}
              className={clsxm(
                'rounded-full px-3 py-1 text-xs font-medium transition-all duration-200',
                gallerySetting.tagFilterMode === 'intersection'
                  ? 'bg-accent text-white'
                  : 'glassmorphic-btn text-text-secondary',
              )}
            >
              {t('action.tag.match.all')}
            </button>
          </div>
        </div>

        {/* Commands List */}
        <div ref={listRef} className="max-h-[60vh] overflow-y-auto overscroll-contain py-2">
          {filteredCommands.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <i className="i-mingcute-search-line text-text-quaternary mb-3 text-4xl" />
              <p className="text-text-secondary text-sm">{t('action.search.no-results')}</p>
            </div>
          ) : (
            filteredCommands.map((cmd, index) => (
              <button
                key={cmd.id}
                type="button"
                onClick={cmd.action}
                onMouseEnter={() => setSelectedIndex(index)}
                className={clsxm(
                  'command-item group flex w-full items-center gap-3 px-4 py-3 text-left transition-all duration-200',
                  selectedIndex === index && 'selected',
                )}
              >
                {/* Icon */}
                <div
                  className={clsxm(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-lg transition-all duration-200',
                    cmd.active ? 'bg-accent/10 text-accent' : 'bg-background/95 text-text-secondary',
                  )}
                  style={
                    cmd.active
                      ? {
                          boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--color-accent) 20%, transparent)',
                        }
                      : undefined
                  }
                >
                  {typeof cmd.icon === 'string' ? <i className={cmd.icon} /> : cmd.icon}
                </div>

                {/* Content */}
                <div className="flex-1 overflow-hidden">
                  <div className="flex items-center gap-2">
                    <span className="text-text truncate text-sm font-medium">{cmd.title}</span>
                    {cmd.badge !== undefined && (
                      <span className="bg-fill-tertiary text-text-secondary rounded-full px-2 py-0.5 text-xs">
                        {cmd.badge}
                      </span>
                    )}
                    {cmd.active && (
                      <span className="bg-accent flex h-5 w-5 items-center justify-center rounded-full text-white">
                        <i className="i-mingcute-check-line text-xs" />
                      </span>
                    )}
                  </div>
                  {cmd.subtitle && <p className="text-text-secondary truncate text-xs">{cmd.subtitle}</p>}
                </div>
              </button>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="border-accent/20 relative border-t px-4 py-2">
          <div className="text-text-secondary flex items-center justify-between text-xs">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1">
                <kbd className="border-accent/20 bg-accent/5 rounded border px-1.5 py-0.5 font-mono">↑↓</kbd>
                Navigate
              </span>
              <span className="flex items-center gap-1">
                <kbd className="border-accent/20 bg-accent/5 rounded border px-1.5 py-0.5 font-mono">↵</kbd>
                Select
              </span>
            </div>
            {filteredCommands.length > 0 && <span>{filteredCommands.length} results</span>}
          </div>
        </div>
      </div>
    </div>
  )
}
