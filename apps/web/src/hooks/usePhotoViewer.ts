import { photoLoader } from '@afilmory/data'
import { atom, useAtom, useAtomValue } from 'jotai'
import { use, useCallback, useMemo } from 'react'

import { gallerySettingAtom } from '~/atoms/app'
import { jotaiStore } from '~/lib/jotai'
import { trackView } from '~/lib/tracker'
import { PhotosContext } from '~/providers/photos-provider'

const openAtom = atom(false)
const currentIndexAtom = atom(0)
const triggerElementAtom = atom<HTMLElement | null>(null)
const data = photoLoader.getPhotos()

// 抽取照片筛选和排序逻辑为独立函数
const filterAndSortPhotos = (
  selectedTags: string[],
  selectedCameras: string[],
  selectedLenses: string[],
  selectedRatings: number | null,
  sortOrder: 'asc' | 'desc',
  tagFilterMode: 'union' | 'intersection' = 'union',
) => {
  // 根据 tags、cameras、lenses 和 ratings 筛选
  let filteredPhotos = data

  // Tags 筛选：根据模式进行并集或交集筛选
  if (selectedTags.length > 0) {
    filteredPhotos = filteredPhotos.filter((photo) => {
      if (tagFilterMode === 'intersection') {
        // 交集模式：照片必须包含所有选中的标签
        return selectedTags.every((tag) => photo.tags.includes(tag))
      } else {
        // 并集模式：照片必须包含至少一个选中的标签
        return selectedTags.some((tag) => photo.tags.includes(tag))
      }
    })
  }

  // Cameras 筛选：照片的相机必须匹配选中的相机之一
  if (selectedCameras.length > 0) {
    filteredPhotos = filteredPhotos.filter((photo) => {
      if (!photo.exif?.Make || !photo.exif?.Model) return false
      const cameraDisplayName = `${photo.exif.Make.trim()} ${photo.exif.Model.trim()}`
      return selectedCameras.includes(cameraDisplayName)
    })
  }

  // Lenses 筛选：照片的镜头必须匹配选中的镜头之一
  if (selectedLenses.length > 0) {
    filteredPhotos = filteredPhotos.filter((photo) => {
      if (!photo.exif?.LensModel) return false
      const lensModel = photo.exif.LensModel.trim()
      const lensMake = photo.exif.LensMake?.trim()
      const lensDisplayName = lensMake ? `${lensMake} ${lensModel}` : lensModel
      return selectedLenses.includes(lensDisplayName)
    })
  }

  // Ratings 筛选：照片的评分必须大于等于选中的最小阈值
  if (selectedRatings !== null) {
    filteredPhotos = filteredPhotos.filter((photo) => {
      if (!photo.exif?.Rating) return false
      return photo.exif.Rating >= selectedRatings
    })
  }

  // 然后排序
  const sortedPhotos = filteredPhotos.toSorted((a, b) => {
    let aDateStr = ''
    let bDateStr = ''

    if (a.exif && a.exif.DateTimeOriginal) {
      aDateStr = a.exif.DateTimeOriginal as unknown as string
    } else {
      aDateStr = a.lastModified
    }

    if (b.exif && b.exif.DateTimeOriginal) {
      bDateStr = b.exif.DateTimeOriginal as unknown as string
    } else {
      bDateStr = b.lastModified
    }

    return sortOrder === 'asc' ? aDateStr.localeCompare(bDateStr) : bDateStr.localeCompare(aDateStr)
  })

  return sortedPhotos
}

// 提供一个 getter 函数供非 UI 组件使用
export const getFilteredPhotos = () => {
  // 直接从 jotaiStore 中读取当前状态
  const currentGallerySetting = jotaiStore.get(gallerySettingAtom)
  return filterAndSortPhotos(
    currentGallerySetting.selectedTags,
    currentGallerySetting.selectedCameras,
    currentGallerySetting.selectedLenses,
    currentGallerySetting.selectedRatings,
    currentGallerySetting.sortOrder,
    currentGallerySetting.tagFilterMode,
  )
}

export const usePhotos = () => {
  const { sortOrder, selectedTags, selectedCameras, selectedLenses, selectedRatings, tagFilterMode } =
    useAtomValue(gallerySettingAtom)

  const masonryItems = useMemo(() => {
    return filterAndSortPhotos(selectedTags, selectedCameras, selectedLenses, selectedRatings, sortOrder, tagFilterMode)
  }, [sortOrder, selectedTags, selectedCameras, selectedLenses, selectedRatings, tagFilterMode])

  return masonryItems
}

export const useContextPhotos = () => {
  const photos = use(PhotosContext)
  if (!photos) {
    throw new Error('PhotosContext is not initialized')
  }
  return photos
}

export const usePhotoViewer = () => {
  const photos = usePhotos()
  const [isOpen, setIsOpen] = useAtom(openAtom)
  const [currentIndex, setCurrentIndex] = useAtom(currentIndexAtom)
  const [triggerElement, setTriggerElement] = useAtom(triggerElementAtom)

  const id = useMemo(() => {
    return photos[currentIndex]?.id
  }, [photos, currentIndex])
  const openViewer = useCallback(
    (index: number, element?: HTMLElement) => {
      setCurrentIndex(index)
      setTriggerElement(element || null)
      setIsOpen(true)
      // 防止背景滚动
      document.body.style.overflow = 'hidden'

      trackView(id)
    },
    [id, setCurrentIndex, setIsOpen, setTriggerElement],
  )

  const closeViewer = useCallback(() => {
    setIsOpen(false)
    setTriggerElement(null)
    // 恢复背景滚动
    document.body.style.overflow = ''
  }, [setIsOpen, setTriggerElement])

  const goToIndex = useCallback(
    (index: number) => {
      if (index >= 0 && index < photos.length) {
        setCurrentIndex(index)
        trackView(photos[index].id)
      }
    },
    [photos, setCurrentIndex],
  )

  return {
    isOpen,
    currentIndex,
    triggerElement,
    openViewer,
    closeViewer,

    goToIndex,
  }
}
