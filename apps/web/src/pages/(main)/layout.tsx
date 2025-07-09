import { photoLoader } from '@afilmory/data'
import { useAtomValue, useSetAtom } from 'jotai'
// import { AnimatePresence } from 'motion/react'
import { useEffect, useRef } from 'react'
import {
  Outlet,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router'

import { gallerySettingAtom } from '~/atoms/app'
import { ScrollElementContext } from '~/components/ui/scroll-areas/ctx'
import { ScrollArea } from '~/components/ui/scroll-areas/ScrollArea'
import { useMobile } from '~/hooks/useMobile'
import { usePhotoViewer } from '~/hooks/usePhotoViewer'
import { MasonryRoot } from '~/modules/gallery/MasonryRoot'

export const Component = () => {
  useStateRestoreFromUrl()
  useSyncStateToUrl()

  // const location = useLocation()
  const isMobile = useMobile()

  return (
    <>
      {isMobile ? (
        <ScrollElementContext value={document.body}>
          <MasonryRoot />
        </ScrollElementContext>
      ) : (
        <ScrollArea
          rootClassName={'h-svh w-full'}
          viewportClassName="size-full"
        >
          <MasonryRoot />
        </ScrollArea>
      )}

      <Outlet />
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
      const photo = photoLoader
        .getPhotos()
        .find((photo) => photo.id === photoId)
      if (photo) {
        openViewer(photoLoader.getPhotos().indexOf(photo))
      }
    }

    const tagsFromSearchParams = searchParams.get('tags')?.split(',')
    if (tagsFromSearchParams) {
      setGallerySetting((prev) => ({
        ...prev,
        selectedTags: tagsFromSearchParams,
      }))
    }
  }, [openViewer, photoId, searchParams, setGallerySetting])
}

const useSyncStateToUrl = () => {
  const { selectedTags } = useAtomValue(gallerySettingAtom)
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
      const photos = photoLoader.getPhotos()
      const targetPathname = `/${photos[currentIndex].id}`
      if (location.pathname !== targetPathname) {
        navigate(targetPathname)
      }
    }
  }, [currentIndex, isOpen, location.pathname, navigate])

  useEffect(() => {
    if (!isRestored) return
    const tags = selectedTags.join(',')
    if (tags) {
      setSearchParams((search) => {
        const currentTags = search.get('tags')
        if (currentTags === tags) return search

        const newer = new URLSearchParams(search)
        newer.set('tags', tags)
        return newer
      })
    } else {
      setSearchParams((search) => {
        const currentTags = search.get('tags')
        if (!currentTags) return search

        const newer = new URLSearchParams(search)
        newer.delete('tags')
        return newer
      })
    }
  }, [selectedTags, setSearchParams])
}
