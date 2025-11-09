import { useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { PhotoManifest } from '~/types/photo'

interface DateRange {
  startDate: Date | null
  endDate: Date | null
  formattedRange: string
  location?: string
}

interface VisibleRange {
  start: number
  end: number
}

/**
 * Hook to calculate the date range of currently visible photos in the viewport
 * Works with masonry onRender callback
 */
export const useVisiblePhotosDateRange = (_photos: PhotoManifest[]) => {
  const [dateRange, setDateRange] = useState<DateRange>({
    startDate: null,
    endDate: null,
    formattedRange: '',
    location: undefined,
  })

  const currentRange = useRef<VisibleRange>({ start: 0, end: 0 })

  const getPhotoDate = useCallback((photo: PhotoManifest): Date => {
    // 优先使用 EXIF 中的拍摄时间
    if (photo.exif?.DateTimeOriginal) {
      const dateStr = photo.exif.DateTimeOriginal as unknown as string
      // EXIF 日期格式通常是 "YYYY:MM:DD HH:mm:ss"
      const formattedDateStr = dateStr.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3')
      const date = new Date(formattedDateStr)
      if (!Number.isNaN(date.getTime())) {
        return date
      }
    }

    // 回退到 lastModified
    return new Date(photo.lastModified)
  }, [])
  const { i18n } = useTranslation()

  const formatDateRange = useCallback(
    (startDate: Date, endDate: Date): string => {
      const startYear = startDate.getFullYear()
      const endYear = endDate.getFullYear()
      const startMonth = startDate.getMonth()
      const endMonth = endDate.getMonth()

      // 如果是同一天
      if (startDate.toDateString() === endDate.toDateString()) {
        return startDate.toLocaleDateString(i18n.language, {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })
      }

      // 如果是同一年
      if (startYear === endYear) {
        // 如果是同一个月
        if (startMonth === endMonth) {
          return `${startYear}年${startDate.getMonth() + 1}月${startDate.getDate()}日 - ${endDate.getDate()}日`
        } else {
          return `${startYear}年${startDate.getMonth() + 1}月 - ${endDate.getMonth() + 1}月`
        }
      }

      // 不同年份
      return `${startYear}年${startDate.getMonth() + 1}月 - ${endYear}年${endDate.getMonth() + 1}月`
    },
    [i18n.language],
  )

  const extractLocation = useCallback((photos: PhotoManifest[]): string | undefined => {
    // 尝试从照片标签中提取位置信息
    for (const photo of photos) {
      // 如果照片有位置标签，优先使用
      if (photo.tags) {
        const locationTag = photo.tags.find(
          (tag) =>
            tag.includes('省') ||
            tag.includes('市') ||
            tag.includes('区') ||
            tag.includes('县') ||
            tag.includes('镇') ||
            tag.includes('村') ||
            tag.includes('街道') ||
            tag.includes('路') ||
            tag.includes('北京') ||
            tag.includes('上海') ||
            tag.includes('广州') ||
            tag.includes('深圳') ||
            tag.includes('杭州') ||
            tag.includes('南京') ||
            tag.includes('成都'),
        )
        if (locationTag) {
          return locationTag
        }
      }
    }

    return undefined
  }, [])

  // 计算当前可视范围内照片的日期范围
  const calculateDateRange = useCallback(
    (startIndex: number, endIndex: number, items: any[]) => {
      if (!items || items.length === 0) {
        setDateRange({
          startDate: null,
          endDate: null,
          formattedRange: '',
          location: undefined,
        })
        return
      }

      // 过滤出照片类型的items (排除header等)
      const visiblePhotos = items
        .slice(startIndex, endIndex + 1)
        .filter((item): item is PhotoManifest => item && typeof item === 'object' && 'id' in item)

      if (visiblePhotos.length === 0) {
        setDateRange({
          startDate: null,
          endDate: null,
          formattedRange: '',
          location: undefined,
        })
        return
      }

      // 计算日期范围
      const dates = visiblePhotos.map((photo) => getPhotoDate(photo)).sort((a, b) => a.getTime() - b.getTime())

      const startDate = dates[0]
      const endDate = dates.at(-1)

      if (!startDate || !endDate) {
        setDateRange({
          startDate: null,
          endDate: null,
          formattedRange: '',
          location: undefined,
        })
        return
      }

      const formattedRange = formatDateRange(startDate, endDate)
      const location = extractLocation(visiblePhotos)

      setDateRange({
        startDate,
        endDate,
        formattedRange,
        location,
      })

      // 更新当前范围
      currentRange.current = { start: startIndex, end: endIndex }
    },
    [getPhotoDate, formatDateRange],
  )

  // 用于传递给 masonry 的 onRender 回调
  const handleRender = useCallback(
    (startIndex: number, stopIndex: number, items: any[]) => {
      calculateDateRange(startIndex, stopIndex, items)
    },
    [calculateDateRange],
  )

  return {
    dateRange,
    handleRender,
    currentRange: currentRange.current,
  }
}
