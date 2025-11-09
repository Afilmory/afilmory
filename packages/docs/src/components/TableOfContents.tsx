import { ScrollArea } from '@radix-ui/react-scroll-area'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'

import type { TocItem } from '../toc-data'
import { getTocByPath } from '../toc-data'

// Custom hook to track active TOC item position for the thumb indicator
function useTocThumb(containerRef: React.RefObject<HTMLDivElement | null>, activeId: string | null) {
  const [pos, setPos] = useState<[number, number]>([0, 0])

  useLayoutEffect(() => {
    if (!containerRef.current || !activeId) return

    const container = containerRef.current
    const activeElement = container.querySelector(`a[href="#${activeId}"]`) as HTMLElement

    if (!activeElement) return

    const top = activeElement.offsetTop
    const height = activeElement.clientHeight

    setPos([top, height])
  }, [activeId, containerRef])

  return pos
}

interface TableOfContentsProps {
  currentPath: string
  onItemClick?: () => void
  handleScroll?: (top: number) => void
}

interface TocItemProps {
  item: TocItem
  activeId: string | null
  level: number
  onItemClick?: () => void
  handleScroll?: (top: number) => void
}

// Helper functions for SVG indicator positioning
function getItemOffset(depth: number): number {
  if (depth <= 2) return 16
  if (depth === 3) return 32
  return 48
}

function getLineOffset(depth: number): number {
  return depth >= 3 ? 12 : 0
}

function TocItemComponent({ item, activeId, level, onItemClick, handleScroll }: TocItemProps) {
  const isActive = activeId === item.id
  const hasChildren = item.children && item.children.length > 0

  return (
    <li>
      <a
        href={`#${item.id}`}
        className={`
          relative block py-1.5 text-sm transition-colors
          ${isActive ? 'text-accent font-medium' : 'text-text-tertiary hover:text-text-primary'}
        `}
        style={{
          paddingInlineStart: `${getItemOffset(level)}px`,
        }}
        onClick={(e) => {
          e.preventDefault()
          const element = document.querySelector(`#${item.id}`)
          if (element && element instanceof HTMLElement) {
            const elementTop = element.offsetTop
            console.info('Navigating to:', element, 'Top:', elementTop)
            handleScroll?.(elementTop - 74)
          }
          onItemClick?.()
        }}
      >
        {item.text}
      </a>

      {hasChildren && (
        <ul>
          {item.children!.map((child) => (
            <TocItemComponent
              key={child.id}
              item={child}
              activeId={activeId}
              level={level + 1}
              onItemClick={onItemClick}
              handleScroll={handleScroll}
            />
          ))}
        </ul>
      )}
    </li>
  )
}

export function TableOfContents({ currentPath, onItemClick, handleScroll }: TableOfContentsProps) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const pos = useTocThumb(containerRef, activeId)
  const [svg, setSvg] = useState<{
    path: string
    width: number
    height: number
  }>()

  // 获取当前页面的 TOC 数据
  const currentToc = getTocByPath(currentPath)

  // 计算 SVG 路径和尺寸
  useLayoutEffect(() => {
    if (!containerRef.current || !currentToc || currentToc.length === 0) return

    const container = containerRef.current

    function calculateSvg(): void {
      if (container.clientHeight === 0) return

      let w = 0
      let h = 0
      const d: string[] = []

      const getAllItems = (items: TocItem[], currentLevel = 1): Array<{ item: TocItem; level: number }> => {
        const result: Array<{ item: TocItem; level: number }> = []
        for (const item of items) {
          result.push({ item, level: currentLevel })
          if (item.children) {
            result.push(...getAllItems(item.children, currentLevel + 1))
          }
        }
        return result
      }

      const allItems = currentToc ? getAllItems(currentToc) : []

      for (const [i, { item, level }] of allItems.entries()) {
        const element = container.querySelector(`a[href="#${item.id}"]`) as HTMLElement
        if (!element) continue

        const styles = getComputedStyle(element)
        const offset = getLineOffset(level) + 1
        const top = element.offsetTop + Number.parseFloat(styles.paddingTop)
        const bottom = element.offsetTop + element.clientHeight - Number.parseFloat(styles.paddingBottom)

        w = Math.max(offset, w)
        h = Math.max(h, bottom)

        d.push(`${i === 0 ? 'M' : 'L'}${offset} ${top}`, `L${offset} ${bottom}`)
      }

      setSvg({
        path: d.join(' '),
        width: w + 1,
        height: h,
      })
    }

    const observer = new ResizeObserver(calculateSvg)
    calculateSvg()

    observer.observe(container)
    return () => {
      observer.disconnect()
    }
  }, [currentToc])

  // 监听滚动，高亮当前标题
  useEffect(() => {
    if (!currentToc || currentToc.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        // 找到可见的标题中最上面的一个
        const visibleEntries = entries.filter((entry) => entry.isIntersecting)
        if (visibleEntries.length > 0) {
          visibleEntries.sort((a, b) => {
            const aRect = a.boundingClientRect
            const bRect = b.boundingClientRect
            return aRect.top - bRect.top
          })
          setActiveId(visibleEntries[0].target.id)
        }
      },
      {
        rootMargin: '-20px 0px -80% 0px',
        threshold: 0.1,
      },
    )

    const getAllIds = (items: TocItem[]): string[] => {
      const ids: string[] = []
      for (const item of items) {
        ids.push(item.id)
        if (item.children) {
          ids.push(...getAllIds(item.children))
        }
      }
      return ids
    }

    const allIds = getAllIds(currentToc)

    // 观察所有标题元素
    allIds.forEach((id) => {
      const element = document.querySelector(`#${id}`)
      if (element) {
        observer.observe(element)
      }
    })

    return () => {
      observer.disconnect()
    }
  }, [currentToc])

  // 如果当前页面没有TOC数据，不显示
  if (!currentToc || currentToc.length === 0) {
    return null
  }

  return (
    <nav className="space-y-1">
      <ScrollArea className="max-h-screen-safe flex flex-col">
        <div className="relative min-h-0 text-sm" ref={containerRef}>
          {/* SVG 指示器背景 */}
          {svg && (
            <>
              {/* 半透明灰色背景线 */}
              <div
                className="absolute start-0 top-0"
                style={{
                  width: svg.width,
                  height: svg.height,
                  maskImage: `url("data:image/svg+xml,${encodeURIComponent(
                    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svg.width} ${svg.height}"><path d="${svg.path}" stroke="black" stroke-width="1" fill="none" /></svg>`,
                  )}")`,
                }}
              >
                <div className="bg-text-quaternary/30 h-full" />
              </div>

              {/* 高亮的活跃指示器 */}
              <div
                className="absolute start-0 top-0"
                style={{
                  width: svg.width,
                  height: svg.height,
                  maskImage: `url("data:image/svg+xml,${encodeURIComponent(
                    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svg.width} ${svg.height}"><path d="${svg.path}" stroke="black" stroke-width="1" fill="none" /></svg>`,
                  )}")`,
                }}
              >
                <div
                  className="bg-accent transition-all"
                  style={{
                    marginTop: pos[0],
                    height: pos[1],
                  }}
                />
              </div>
            </>
          )}

          <ul className="text-sm">
            {currentToc.map((item) => (
              <TocItemComponent
                key={item.id}
                item={item}
                activeId={activeId}
                level={1}
                onItemClick={onItemClick}
                handleScroll={handleScroll}
              />
            ))}
          </ul>
        </div>
      </ScrollArea>
    </nav>
  )
}
