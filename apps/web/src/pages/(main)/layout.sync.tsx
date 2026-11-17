import { ScrollArea, ScrollElementContext } from '@afilmory/ui'
import { useAtomValue, useSetAtom } from 'jotai'
import { useEffect, useRef } from 'react'
import { Outlet, useLocation, useParams, useSearchParams } from 'react-router'

import { gallerySettingAtom } from '~/atoms/app'
import { getViewer, setViewer } from '~/atoms/viewer'
import { siteConfig } from '~/config'
import { useMobile } from '~/hooks/useMobile'
import { usePhotos } from '~/hooks/usePhotoViewer'
import { contrastRatio, hexToRgb } from '~/lib/color'
import { normalizeDateRange } from '~/modules/gallery/dateRangeUtils'
import { PhotosRoot } from '~/modules/gallery/PhotosRoot'
import { PhotosProvider } from '~/providers/photos-provider'

const ON_ACCENT_DARK = { r: 12, g: 13, b: 14 }
const ON_ACCENT_LIGHT = { r: 255, g: 255, b: 255 }

const accentContentFor = (hex: string) => {
  const rgb = hexToRgb(hex)
  if (!rgb) {
    return '#ffffff'
  }
  return contrastRatio(rgb, ON_ACCENT_DARK) >= contrastRatio(rgb, ON_ACCENT_LIGHT) ? '#0c0d0e' : '#ffffff'
}

export const Component = () => {
  useSyncGallerySettingsWithUrl()
  useSyncViewerWithUrl()
  useSyncViewerCloseShortcut()

  const isMobile = useMobile()
  const photos = usePhotos()

  return (
    <>
      <PhotosProvider photos={photos}>
        {siteConfig.accentColor && (
          <style
            dangerouslySetInnerHTML={{
              __html: `
          :root:has(input.theme-controller[value=dark]:checked), [data-theme="dark"] {
            --color-primary: ${siteConfig.accentColor};
            --color-accent: ${siteConfig.accentColor};
            --color-secondary: ${siteConfig.accentColor};
            --color-accent-content: ${accentContentFor(siteConfig.accentColor)};
          }
          `,
            }}
          />
        )}

        {isMobile ? (
          <ScrollElementContext value={document.body}>
            <PhotosRoot />
          </ScrollElementContext>
        ) : (
          <ScrollArea rootClassName="h-svh w-full" viewportClassName="size-full" scrollbarClassName="mt-12">
            <PhotosRoot />
          </ScrollArea>
        )}

        <Outlet />
      </PhotosProvider>
    </>
  )
}

/**
 * Sync gallery filter settings (tags, cameras, lenses, ratings) with URL search params.
 * This is bidirectional:
 * - On initial load: restore state from URL
 * - On state change: update URL
 * - On URL change (back/forward): update state
 */
const useSyncGallerySettingsWithUrl = () => {
  const setGallerySetting = useSetAtom(gallerySettingAtom)
  const { selectedTags, selectedCameras, selectedLenses, selectedRatings, selectedDateRange, tagFilterMode }
    = useAtomValue(gallerySettingAtom)
  const [searchParams, setSearchParams] = useSearchParams()

  // Track if initial restore is done
  const isInitializedRef = useRef(false)
  // Track the last URL we synced from to detect external URL changes
  const lastSyncedUrlRef = useRef<string>('')
  // Track if we're currently updating URL (to prevent loops)
  const isUpdatingUrlRef = useRef(false)

  // Restore state from URL on mount and when URL changes externally (back/forward)
  useEffect(() => {
    const currentUrl = searchParams.toString()

    // Skip if we just updated the URL ourselves
    if (isUpdatingUrlRef.current) {
      isUpdatingUrlRef.current = false
      return
    }

    // Skip if URL hasn't changed from what we last synced
    if (isInitializedRef.current && currentUrl === lastSyncedUrlRef.current) {
      return
    }

    lastSyncedUrlRef.current = currentUrl

    const tagsFromSearchParams = searchParams.get('tags')?.split(',')
    const camerasFromSearchParams = searchParams.get('cameras')?.split(',')
    const lensesFromSearchParams = searchParams.get('lenses')?.split(',')
    const ratingsFromSearchParams = searchParams.get('rating') ? Number(searchParams.get('rating')) : null
    const tagModeFromSearchParams = searchParams.get('tag_mode') as 'union' | 'intersection' | null
    const dateRangeFromSearchParams = normalizeDateRange(searchParams.get('from'), searchParams.get('to'))

    // Always update state from URL (URL is source of truth for filters)
    setGallerySetting(prev => ({
      ...prev,
      selectedTags: tagsFromSearchParams || [],
      selectedCameras: camerasFromSearchParams || [],
      selectedLenses: lensesFromSearchParams || [],
      selectedRatings: ratingsFromSearchParams,
      selectedDateRange: dateRangeFromSearchParams,
      tagFilterMode: tagModeFromSearchParams || 'union',
    }))

    isInitializedRef.current = true
  }, [searchParams, setGallerySetting])

  // Sync state changes to URL
  useEffect(() => {
    // Wait for initial restore before syncing state to URL
    if (!isInitializedRef.current) {
      return
    }

    const tags = selectedTags.join(',')
    const cameras = selectedCameras.join(',')
    const lenses = selectedLenses.join(',')
    const rating = selectedRatings?.toString() ?? ''
    const tagMode = tagFilterMode === 'union' ? '' : tagFilterMode
    const fromParam = selectedDateRange?.from ?? ''
    const toParam = selectedDateRange?.to ?? ''

    setSearchParams(
      (currentParams) => {
        const currentTags = currentParams.get('tags') || ''
        const currentCameras = currentParams.get('cameras') || ''
        const currentLenses = currentParams.get('lenses') || ''
        const currentRating = currentParams.get('rating') || ''
        const currentTagMode = currentParams.get('tag_mode') || ''
        const currentFrom = currentParams.get('from') || ''
        const currentTo = currentParams.get('to') || ''

        // Check if anything has changed
        if (
          currentTags === tags
          && currentCameras === cameras
          && currentLenses === lenses
          && currentRating === rating
          && currentTagMode === tagMode
          && currentFrom === fromParam
          && currentTo === toParam
        ) {
          return currentParams
        }

        // Mark that we're updating URL to prevent loop
        isUpdatingUrlRef.current = true

        const newer = new URLSearchParams(currentParams)

        if (tags) {
          newer.set('tags', tags)
        }
        else {
          newer.delete('tags')
        }

        if (cameras) {
          newer.set('cameras', cameras)
        }
        else {
          newer.delete('cameras')
        }

        if (lenses) {
          newer.set('lenses', lenses)
        }
        else {
          newer.delete('lenses')
        }

        if (rating) {
          newer.set('rating', rating)
        }
        else {
          newer.delete('rating')
        }

        if (tagMode) {
          newer.set('tag_mode', tagMode)
        }
        else {
          newer.delete('tag_mode')
        }

        if (fromParam) {
          newer.set('from', fromParam)
        }
        else {
          newer.delete('from')
        }

        if (toParam) {
          newer.set('to', toParam)
        }
        else {
          newer.delete('to')
        }

        // Update last synced URL
        lastSyncedUrlRef.current = newer.toString()

        return newer
      },
      { replace: true },
    ) // Use replace to avoid polluting history for filter changes
  }, [
    selectedTags,
    selectedCameras,
    selectedLenses,
    selectedRatings,
    selectedDateRange,
    tagFilterMode,
    setSearchParams,
  ])
}

/**
 * Sync viewer state with URL.
 * URL is the source of truth:
 * - /photos/:photoId -> viewer is open
 * - / or /map -> viewer is closed
 *
 * This handles browser back/forward by reacting to location changes.
 */
const useSyncViewerWithUrl = () => {
  const location = useLocation()
  const { photoId } = useParams()
  const photos = usePhotos()

  // Track last processed location to avoid redundant updates
  const lastProcessedPathRef = useRef<string>('')

  useEffect(() => {
    const currentPath = location.pathname

    // Skip if we already processed this path
    if (currentPath === lastProcessedPathRef.current) {
      return
    }

    lastProcessedPathRef.current = currentPath

    const isPhotoRoute = currentPath.startsWith('/photos/')
    const currentViewer = getViewer()

    if (isPhotoRoute && photoId) {
      // URL says viewer should be open
      const targetIndex = photos.findIndex(p => p.id === photoId)

      if (
        targetIndex !== -1 // Open viewer if closed, or update photo if different
        && (!currentViewer.isOpen || currentViewer.photoId !== photoId)
      ) {
        setViewer(prev => ({
          ...prev,
          isOpen: true,
          openInstanceId: prev.isOpen ? prev.openInstanceId : prev.openInstanceId + 1,
          pendingCloseInstanceId: null,
          photoId,
          // When syncing from URL, do not preserve a potentially stale triggerElement
          triggerElement: null,
        }))

        // Prevent background scroll
        document.body.style.overflow = 'hidden'
      }
    }
    else {
      // URL says viewer should be closed
      if (currentViewer.isOpen) {
        setViewer(prev => ({
          ...prev,
          isOpen: false,
          pendingCloseInstanceId: null,
          triggerElement: null,
        }))

        // Restore background scroll
        document.body.style.overflow = ''
      }
    }

    return () => {
      // Clean up body scroll lock if component unmounts while viewer was open
      // This is a safety measure, normally closeViewer handles this
      document.body.style.overflow = ''
    }
  }, [location.pathname, photoId, photos])
}

const useSyncViewerCloseShortcut = () => {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return
      }

      const currentViewer = getViewer()
      if (!currentViewer.isOpen || !currentViewer.openInstanceId) {
        return
      }
      if (currentViewer.pendingCloseInstanceId === currentViewer.openInstanceId) {
        return
      }

      event.preventDefault()

      setViewer((prev) => {
        if (!prev.isOpen || !prev.openInstanceId) {
          return prev
        }
        if (prev.pendingCloseInstanceId === prev.openInstanceId) {
          return prev
        }

        return {
          ...prev,
          pendingCloseInstanceId: prev.openInstanceId,
        }
      })
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [])
}
