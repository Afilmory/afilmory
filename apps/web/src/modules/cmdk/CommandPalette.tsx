import { photoLoader } from '@afilmory/data'
import { Modal } from '@afilmory/ui'
import { clsxm, Spring } from '@afilmory/utils'
import { useAtom } from 'jotai'
import { AnimatePresence, m } from 'motion/react'
import * as React from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'

import { gallerySettingAtom } from '~/atoms/app'
import { usePhotoViewer } from '~/hooks/usePhotoViewer'
import { MageLens } from '~/icons'
import { DateRangePicker } from '~/modules/gallery/DateRangePicker'
import { DATE_RANGE_PRESETS, isPresetActive } from '~/modules/gallery/dateRangeUtils'

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
  // When true, hide this command from the default (un-queried) list to avoid
  // crowding existing tag/camera/lens entries; it still surfaces on a matching query.
  hideFromDefault?: boolean
}

interface CommandPaletteProps {
  isOpen: boolean
  onClose: () => void
}

const allTags = photoLoader.getAllTags()
const allCameras = photoLoader.getAllCameras()
const allLenses = photoLoader.getAllLenses()

const BRACKET_CORNERS = [
  { cls: 'af-bracket-tl', tx: -22, ty: -22 },
  { cls: 'af-bracket-tr', tx: 22, ty: -22 },
  { cls: 'af-bracket-bl', tx: -22, ty: 22 },
  { cls: 'af-bracket-br', tx: 22, ty: 22 },
] as const

const getLocationTokens = (
  location?: { locationName?: string | null, city?: string | null, country?: string | null } | null,
) => {
  if (!location) {
    return []
  }

  const tokens = [location.locationName, location.city, location.country]
    .map(token => token?.trim())
    .filter((token): token is string => typeof token === 'string' && token.length > 0)

  const uniqueTokens: string[] = []
  const seen = new Set<string>()
  tokens.forEach((token) => {
    const normalized = token.toLowerCase()
    if (!seen.has(normalized)) {
      seen.add(normalized)
      uniqueTokens.push(token)
    }
  })

  return uniqueTokens
}

// Fuzzy search utility
const fuzzyMatch = (text: string, query: string): boolean => {
  const lowerText = text.toLowerCase()
  const lowerQuery = query.toLowerCase()

  if (lowerText.includes(lowerQuery)) {
    return true
  }

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
  if (!lowerQuery) {
    return []
  }

  return photos.filter((photo) => {
    const matchesTitle = photo.title?.toLowerCase().includes(lowerQuery)
    const matchesDescription = photo.description?.toLowerCase().includes(lowerQuery)
    const matchesTags = photo.tags?.some(tag => tag.toLowerCase().includes(lowerQuery))
    const matchesCamera
      = photo.exif?.Make?.toLowerCase().includes(lowerQuery) || photo.exif?.Model?.toLowerCase().includes(lowerQuery)
    const matchesLens = photo.exif?.LensModel?.toLowerCase().includes(lowerQuery)
    const locationTokens = getLocationTokens(photo.location)
    const matchesLocation = locationTokens.some(token => token.toLowerCase().includes(lowerQuery))

    return matchesTitle || matchesDescription || matchesTags || matchesCamera || matchesLens || matchesLocation
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
      setGallerySetting(prev => ({
        ...prev,
        tagFilterMode: mode,
      }))
    },
    [setGallerySetting],
  )

  const handleReset = useCallback(() => {
    setQuery('')
    setSelectedIndex(0)
    setGallerySetting(prev => ({
      ...prev,
      selectedTags: [],
      selectedCameras: [],
      selectedLenses: [],
      selectedRatings: null,
      selectedDateRange: null,
      tagFilterMode: 'union',
    }))
  }, [setGallerySetting])

  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setSelectedIndex(0)
      const timer = setTimeout(() => inputRef.current?.focus(), 50)
      return () => clearTimeout(timer)
    }
  }, [isOpen])

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
            setGallerySetting(prev => ({
              ...prev,
              selectedTags: isActive ? prev.selectedTags.filter(t => t !== tag) : [...prev.selectedTags, tag],
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
            setGallerySetting(prev => ({
              ...prev,
              selectedCameras: isActive
                ? prev.selectedCameras.filter(c => c !== camera.displayName)
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
            setGallerySetting(prev => ({
              ...prev,
              selectedLenses: isActive
                ? prev.selectedLenses.filter(l => l !== lens.displayName)
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
          setGallerySetting(prev => ({
            ...prev,
            selectedRatings: isActive ? null : rating,
          }))
        },
        keywords: ['rating', 'filter', 'star', rating.toString()],
      })
    }

    // Filter commands - Date range presets (query-only; hidden from default list).
    // Compute `today` once per command-list rebuild so endpoints stay consistent.
    const todayForPresets = new Date()
    DATE_RANGE_PRESETS.forEach((preset) => {
      const presetRange = preset.compute(todayForPresets)
      const isActive = isPresetActive(preset, gallerySetting.selectedDateRange, todayForPresets)
      cmds.push({
        id: `date-preset-${preset.id}`,
        type: 'filter',
        title: t(preset.labelKey as never),
        subtitle: t('action.date.filter'),
        icon: 'i-mingcute-calendar-line',
        active: isActive,
        hideFromDefault: true,
        // Non-toggling: selecting an active preset re-applies the same range (no-op).
        action: () => {
          setGallerySetting(prev => ({
            ...prev,
            selectedDateRange: presetRange,
          }))
        },
        keywords: preset.keywords,
      })
    })

    cmds.push({
      id: 'date-custom',
      type: 'action',
      title: t('action.date.custom'),
      subtitle: t('action.date.filter'),
      icon: 'i-mingcute-calendar-line',
      action: () => {
        Modal.present(DateRangePicker, undefined, { dismissOnOutsideClick: true })
        onClose()
      },
      keywords: ['date', 'range', 'custom', 'picker', 'from', 'to'],
    })

    // Clear all filters
    const hasFilters
      = gallerySetting.selectedTags.length > 0
        || gallerySetting.selectedCameras.length > 0
        || gallerySetting.selectedLenses.length > 0
        || gallerySetting.selectedRatings !== null
        || gallerySetting.selectedDateRange !== null

    if (hasFilters) {
      cmds.push({
        id: 'clear-filters',
        type: 'action',
        title: t('action.search.clear'),
        subtitle: t('action.clear.filters'),
        icon: 'i-mingcute-close-line',
        action: () => {
          setGallerySetting(prev => ({
            ...prev,
            selectedTags: [],
            selectedCameras: [],
            selectedLenses: [],
            selectedRatings: null,
            selectedDateRange: null,
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
        const locationTokens = getLocationTokens(photo.location)
        const locationSubtitle = locationTokens.join(', ')
        cmds.push({
          id: `photo-${photo.id}`,
          type: 'photo',
          title: photo.title || photo.id,
          subtitle: photo.description || locationSubtitle || `${photo.exif?.Model || 'Photo'}`,
          icon: (
            <img src={photo.thumbnailUrl} alt={photo.title || 'Photo'} className="h-7 w-7 rounded-md object-cover" />
          ),
          action: () => {
            const allPhotos = photoLoader.getPhotos()
            const photoIndex = allPhotos.findIndex(p => p.id === photo.id)
            if (photoIndex !== -1) {
              openViewer(photoIndex)
              navigate(`/photos/${photo.id}`)
              onClose()
            }
          },
          keywords: [photo.title, photo.description, ...locationTokens, ...(photo.tags || [])].filter(
            Boolean,
          ) as string[],
        })
      })
    }

    return cmds
  }, [t, gallerySetting, query, navigate, onClose, setGallerySetting, openViewer, updateTagFilterMode])

  // Filter commands based on query
  const filteredCommands = useMemo(() => {
    if (!query.trim()) {
      // Show all filters when no query - group by type
      const activeFilters = commands.filter(cmd => cmd.active && !cmd.hideFromDefault)
      const allFilters = commands.filter(cmd => cmd.type === 'filter' && !cmd.hideFromDefault)

      // Prioritize active filters, then show all available filters
      const uniqueFilters = new Map<string, Command>()

      // First add active filters
      activeFilters.forEach(cmd => uniqueFilters.set(cmd.id, cmd))

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
          setSelectedIndex(prev => Math.min(prev + 1, filteredCommands.length - 1))
          break
        }
        case 'ArrowUp': {
          e.preventDefault()
          setSelectedIndex(prev => Math.max(prev - 1, 0))
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

  return (
    <AnimatePresence>
      {isOpen && (
        <m.div
          key="cmdk"
          className="fixed inset-0 z-9999 flex items-end justify-center bg-black/40 lg:items-start lg:pt-[15vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          onClick={onClose}
        >
          <m.div
            className="border-border bg-background relative w-full max-w-2xl border"
            style={{
              boxShadow: '0 12px 32px rgba(0,0,0,0.45), 0 4px 12px rgba(0,0,0,0.3)',
            }}
            initial={{ opacity: 0, scale: 1.04, filter: 'blur(8px)' }}
            animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, scale: 0.98, filter: 'blur(6px)' }}
            transition={Spring.smooth(0.32)}
            onClick={e => e.stopPropagation()}
          >
            {BRACKET_CORNERS.map(corner => (
              <m.span
                key={corner.cls}
                aria-hidden
                className={clsxm('af-bracket hidden lg:block', corner.cls)}
                initial={{ opacity: 0, x: corner.tx, y: corner.ty }}
                animate={{ opacity: 1, x: 0, y: 0 }}
                exit={{ opacity: 0, x: corner.tx, y: corner.ty }}
                transition={{ ...Spring.snappy(0.34), delay: 0.06 }}
              />
            ))}

            <div className="overflow-hidden">
              <div className="border-border relative flex items-center gap-2.5 border-b px-3 py-3">
                <i className="i-mingcute-search-line text-text-tertiary shrink-0 text-lg" />
                <input
                  ref={inputRef}
                  type="text"
                  name="search"
                  autoComplete="off"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={t('action.search.placeholder')}
                  className="text-text placeholder-text-tertiary flex-1 bg-transparent text-sm outline-none focus-visible:outline-none"
                />
                <button
                  type="button"
                  onClick={handleReset}
                  className="border-border bg-fill-quaternary text-text-secondary hover:bg-fill-secondary hover:text-text inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-all duration-200"
                >
                  <i className="i-mingcute-refresh-1-line text-sm" />
                  {t('action.reset')}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="border-border bg-fill-quaternary text-text-secondary hover:bg-fill-secondary hover:text-text inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-all duration-200"
                >
                  <i className="i-mingcute-close-line text-sm" />
                  {t('action.close')}
                </button>
              </div>

              <div className="border-border bg-fill-quaternary text-text-secondary relative flex items-center justify-between gap-3 border-b px-3 py-1.5 text-xs">
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
                        ? 'bg-accent text-accent-content'
                        : 'bg-fill-tertiary text-text-secondary hover:text-text',
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
                        ? 'bg-accent text-accent-content'
                        : 'bg-fill-tertiary text-text-secondary hover:text-text',
                    )}
                  >
                    {t('action.tag.match.all')}
                  </button>
                </div>
              </div>

              <div ref={listRef} className="max-h-[60vh] overflow-y-auto overscroll-contain py-1">
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
                        'command-item group flex w-full items-center gap-2.5 px-3 py-2 text-left transition-all duration-200',
                        selectedIndex === index && 'selected',
                      )}
                    >
                      <div
                        className={clsxm(
                          'flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-base transition-all duration-200',
                          cmd.active ? 'bg-accent/10 text-accent' : 'bg-fill-tertiary text-text-secondary',
                        )}
                      >
                        {typeof cmd.icon === 'string' ? <i className={cmd.icon} /> : cmd.icon}
                      </div>

                      <div className="flex-1 overflow-hidden">
                        <div className="flex items-center gap-2">
                          <span className="text-text truncate text-[13px] font-medium">{cmd.title}</span>
                          {cmd.badge !== undefined && (
                            <span className="bg-fill-tertiary text-text-secondary rounded-full px-2 py-0.5 text-[10px]">
                              {cmd.badge}
                            </span>
                          )}
                          {cmd.active && (
                            <span className="bg-accent text-accent-content flex h-4 w-4 items-center justify-center rounded-full">
                              <i className="i-mingcute-check-line text-[10px]" />
                            </span>
                          )}
                        </div>
                        {cmd.subtitle && <p className="text-text-secondary truncate text-[11px]">{cmd.subtitle}</p>}
                      </div>
                    </button>
                  ))
                )}
              </div>

              <div className="border-border bg-fill-quaternary relative border-t px-3 py-1.5">
                <div className="text-text-secondary flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-4">
                    <span className="flex items-center gap-1">
                      <kbd className="border-accent/15 bg-fill-tertiary text-text-secondary rounded-sm border px-1.5 py-0.5 font-mono text-[10px]">
                        ↑↓
                      </kbd>
                      {t('action.navigate')}
                    </span>
                    <span className="flex items-center gap-1">
                      <kbd className="border-accent/15 bg-fill-tertiary text-text-secondary rounded-sm border px-1.5 py-0.5 font-mono text-[10px]">
                        ↵
                      </kbd>
                      {t('action.select')}
                    </span>
                  </div>
                  {filteredCommands.length > 0 && (
                    <span>{t('action.results', { count: filteredCommands.length })}</span>
                  )}
                </div>
              </div>
            </div>
          </m.div>
        </m.div>
      )}
    </AnimatePresence>
  )
}
