import { clsxm, Spring } from '@afilmory/utils'
import { AnimatePresence, m } from 'motion/react'
import { memo } from 'react'
import { useTranslation } from 'react-i18next'

import { useMobile } from '~/hooks/useMobile'

interface DateRangeIndicatorProps {
  dateRange: string
  location?: string
  isVisible: boolean
  className?: string
}

export const DateRangeIndicator = memo(({ dateRange, location, isVisible, className }: DateRangeIndicatorProps) => {
  const { t } = useTranslation()
  const translateDay = (day: string | number) => t(`date.day.${day}` as any)
  const translateMonth = (month: string | number) => t(`date.month.${month}` as any)

  // 解析日期范围，提取主要的日期信息
  const parseMainDate = (range: string) => {
    // 匹配跨年日期范围格式 "2022年3月 - 2023年5月"
    const crossYearMatch = range.match(/(\d{4})年(\d+)月\s*-\s*(\d{4})年(\d+)月/)
    if (crossYearMatch) {
      const [, startYear, startMonth, endYear, endMonth] = crossYearMatch
      // return `${startMonth}月 ${startYear} – ${endMonth}月 ${endYear}`
      return `${translateMonth(startMonth)} ${startYear} - ${translateMonth(endMonth)} ${endYear}`
    }

    // 匹配类似 "2022年3月30日 - 5月2日" 的格式
    const singleYearDayMatch = range.match(/(\d{4})年(\d+)月(\d+)日?\s*-\s*(\d+)月(\d+)日?/)
    if (singleYearDayMatch) {
      const [, year, startMonth, startDay, endMonth, endDay] = singleYearDayMatch
      // return `${startMonth}月${startDay}日–${endMonth}月${endDay}日, ${year}`
      return `${translateMonth(startMonth)} ${translateDay(startDay)} - ${translateMonth(endMonth)} ${translateDay(endDay)} ${year}`
    }

    // 匹配类似 "2022年3月 - 5月" 的格式
    const monthRangeMatch = range.match(/(\d{4})年(\d+)月\s*-\s*(\d+)月/)
    if (monthRangeMatch) {
      const [, year, startMonth, endMonth] = monthRangeMatch
      // return `${startMonth}月–${endMonth}月, ${year}`
      return `${translateMonth(startMonth)} - ${translateMonth(endMonth)} ${year}`
    }

    // 匹配单个日期
    const singleDateMatch = range.match(/(\d{4})年(\d+)月(\d+)日/)
    if (singleDateMatch) {
      const [, year, month, day] = singleDateMatch
      // return `${month}月${day}日, ${year}`
      return `${translateMonth(month)} ${translateDay(day)} ${year}`
    }

    // 默认返回原始字符串
    return range
  }

  const isMobile = useMobile()
  const variants = isMobile
    ? {
        initial: {
          opacity: 0,
        },
        animate: { opacity: 1 },
      }
    : {
        initial: {
          opacity: 0,
          x: -20,
          scale: 0.95,
        },
        animate: { opacity: 1, x: 0, scale: 1 },
      }

  const formattedDate = parseMainDate(dateRange)

  return (
    <AnimatePresence>
      {isVisible && dateRange && (
        <m.div
          initial={variants.initial}
          animate={variants.animate}
          exit={variants.initial}
          transition={Spring.presets.snappy}
          className={clsxm(
            'border-material-opaque lg:rounded-xl border bg-black/60 p-4 shadow-2xl backdrop-blur-[70px]',
            `fixed left-4 z-50 top-4 lg:top-6 lg:left-6`,
            className,
          )}
        >
          <div className="flex flex-col">
            <span className="text-lg leading-tight font-bold tracking-tight text-white lg:text-4xl">
              {formattedDate}
            </span>
            {location && (
              <span className="mt-0.5 text-sm font-medium text-white/75 lg:mt-1 lg:text-lg">{location}</span>
            )}
          </div>
        </m.div>
      )}
    </AnimatePresence>
  )
})

DateRangeIndicator.displayName = 'DateRangeIndicator'
