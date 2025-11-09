import { photoLoader } from '@afilmory/data'
import { ScrollArea, ScrollElementContext } from '@afilmory/ui'
import { useAtomValue, useSetAtom } from 'jotai'
import { useEffect, useRef } from 'react'
import { Outlet, useLocation, useNavigate, useParams, useSearchParams } from 'react-router'

import { gallerySettingAtom } from '~/atoms/app'
import { siteConfig } from '~/config'
import { useMobile } from '~/hooks/useMobile'
import { getFilteredPhotos, usePhotos, usePhotoViewer } from '~/hooks/usePhotoViewer'
import { MasonryRoot } from '~/modules/gallery/MasonryRoot'
import { PhotosProvider } from '~/providers/photos-provider'

export const Component = () => {
  useStateRestoreFromUrl()
  useSyncStateToUrl()

  // const location = useLocation()
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
          }
          `,
            }}
          />
        )}

        {isMobile ? (
          <ScrollElementContext value={document.body}>
            <MasonryRoot />
          </ScrollElementContext>
        ) : (
          <ScrollArea rootClassName={'h-svh w-full'} viewportClassName="size-full">
            <MasonryRoot />
          </ScrollArea>
        )}

        <Outlet />
      </PhotosProvider>
    </>
  )
}

let isRestored = false
const useStateRestoreFromUrl = () => {
  const triggerOnceRef = useRef(false)

  const { openViewer } = usePhotoViewer()
  const { photoId } = useParams()
  const setGallerySetting = useSetAtom(gallerySettingAtom)

  const [searchParams] = useSearchParams()
  useEffect(() => {
    if (triggerOnceRef.current) return
    triggerOnceRef.current = true
    isRestored = true

    if (photoId) {
      const photo = photoLoader.getPhotos().find((photo) => photo.id === photoId)
      if (photo) {
        openViewer(photoLoader.getPhotos().indexOf(photo))
      }
    }

    const tagsFromSearchParams = searchParams.get('tags')?.split(',')
    const camerasFromSearchParams = searchParams.get('cameras')?.split(',')
    const lensesFromSearchParams = searchParams.get('lenses')?.split(',')
    const ratingsFromSearchParams = searchParams.get('rating') ? Number(searchParams.get('rating')) : null
    const tagModeFromSearchParams = searchParams.get('tag_mode') as 'union' | 'intersection' | null

    if (
      tagsFromSearchParams ||
      camerasFromSearchParams ||
      lensesFromSearchParams ||
      ratingsFromSearchParams !== null ||
      tagModeFromSearchParams
    ) {
      setGallerySetting((prev) => ({
        ...prev,
        selectedTags: tagsFromSearchParams || prev.selectedTags,
        selectedCameras: camerasFromSearchParams || prev.selectedCameras,
        selectedLenses: lensesFromSearchParams || prev.selectedLenses,
        selectedRatings: ratingsFromSearchParams ?? prev.selectedRatings,
        tagFilterMode: tagModeFromSearchParams || prev.tagFilterMode,
      }))
    }
  }, [openViewer, photoId, searchParams, setGallerySetting])
}

const useSyncStateToUrl = () => {
  const { selectedTags, selectedCameras, selectedLenses, selectedRatings, tagFilterMode } =
    useAtomValue(gallerySettingAtom)
  const [_, setSearchParams] = useSearchParams()
  const navigate = useNavigate()

  const location = useLocation()
  const { isOpen, currentIndex } = usePhotoViewer()

  useEffect(() => {
    if (!isRestored) return

    if (!isOpen) {
      const isExploryPath = location.pathname === '/explory'
      if (!isExploryPath) {
        const timer = setTimeout(() => {
          navigate('/')
        }, 500)
        return () => clearTimeout(timer)
      }
    } else {
      const photos = getFilteredPhotos()
      const targetPathname = `/photos/${photos[currentIndex].id}`
      if (location.pathname !== targetPathname) {
        navigate(targetPathname)
      }
    }
  }, [currentIndex, isOpen, location.pathname, navigate])

  useEffect(() => {
    if (!isRestored) return

    const tags = selectedTags.join(',')
    const cameras = selectedCameras.join(',')
    const lenses = selectedLenses.join(',')
    const rating = selectedRatings?.toString() ?? ''
    const tagMode = tagFilterMode === 'union' ? '' : tagFilterMode

    setSearchParams((search) => {
      const currentTags = search.get('tags')
      const currentCameras = search.get('cameras')
      const currentLenses = search.get('lenses')
      const currentRating = search.get('rating')
      const currentTagMode = search.get('tag_mode')

      // Check if anything has changed
      if (
        currentTags === tags &&
        currentCameras === cameras &&
        currentLenses === lenses &&
        currentRating === rating &&
        currentTagMode === tagMode
      ) {
        return search
      }

      const newer = new URLSearchParams(search)

      // Update tags
      if (tags) {
        newer.set('tags', tags)
      } else {
        newer.delete('tags')
      }

      // Update cameras
      if (cameras) {
        newer.set('cameras', cameras)
      } else {
        newer.delete('cameras')
      }

      // Update lenses
      if (lenses) {
        newer.set('lenses', lenses)
      } else {
        newer.delete('lenses')
      }

      // Update rating
      if (rating) {
        newer.set('rating', rating)
      } else {
        newer.delete('rating')
      }

      // Update tag filter mode
      if (tagMode) {
        newer.set('tag_mode', tagMode)
      } else {
        newer.delete('tag_mode')
      }

      return newer
    })
  }, [selectedTags, selectedCameras, selectedLenses, selectedRatings, tagFilterMode, setSearchParams])
}
