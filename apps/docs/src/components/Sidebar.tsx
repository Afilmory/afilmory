import { Collapsible, CollapsibleContent, CollapsibleTrigger, useCollapsibleContext } from '@afilmory/ui'
import clsx from 'clsx'
import { ChevronRight } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import type { RouteConfig } from '../routes'
import { routes } from '../routes'
import { getMatchedRoute } from '../utils/routes'
import { HeaderLogoSection } from './HeaderLogoSection'

interface SidebarProps {
  currentPath?: string
  onNavigate?: (path: string) => void
}

interface NavigationItem {
  path: string
  title: string
  children?: NavigationItem[]
}

// 构建嵌套的导航树结构
function buildNavigationTree(routes: RouteConfig[]): NavigationItem[] {
  const tree: NavigationItem[] = []
  const pathMap = new Map<string, NavigationItem>()

  // 先创建所有节点
  routes.forEach((route) => {
    const item: NavigationItem = {
      path: route.path,
      title: route.title,
      children: [],
    }
    pathMap.set(route.path, item)
  })

  // 构建树结构
  routes.forEach((route) => {
    const item = pathMap.get(route.path)!
    const pathParts = route.path.split('/').filter(Boolean)

    if (pathParts.length === 0) {
      // 根路径
      tree.push(item)
    } else if (pathParts.length === 1) {
      // 一级路径
      tree.push(item)
    } else {
      // 多级路径，找到父级
      const parentPath = `/${pathParts.slice(0, -1).join('/')}`
      const parent = pathMap.get(parentPath)
      if (parent) {
        parent.children!.push(item)
      } else {
        // 如果没有找到父级，作为顶级项添加
        tree.push(item)
      }
    }
  })

  return tree
}

interface NavigationItemProps {
  item: NavigationItem
  currentPath?: string
  onNavigate?: (path: string) => void
  level?: number
}

// 自定义图标组件，使用 Collapsible context 来获取展开状态
function CollapsibleChevronIcon() {
  const { isOpen } = useCollapsibleContext()
  return (
    <ChevronRight
      className={clsx(
        'h-3.5 w-3.5 text-zinc-500 transition-transform duration-150 dark:text-zinc-400',
        isOpen && 'rotate-90',
      )}
    />
  )
}

function NavigationItemComponent({ item, currentPath, onNavigate, level = 0 }: NavigationItemProps) {
  // 检查是否应该展开：当前路径是该项目的子路径，或者当前路径就是该项目且有子项目
  const shouldExpand = useCallback(() => {
    if (!currentPath) return false

    // 如果当前路径以该项目路径开头且不完全相等，说明是子路径
    if (currentPath.startsWith(item.path) && currentPath !== item.path) {
      // 确保是真正的子路径（避免 /api 匹配 /api-docs 这种情况）
      const remainingPath = currentPath.slice(item.path.length)
      return remainingPath.startsWith('/')
    }

    // 如果当前路径就是该项目路径，且有子项目，也展开
    if (currentPath === item.path && item.children && item.children.length > 0) {
      return true
    }

    return false
  }, [currentPath, item.path, item.children])

  const shouldBeOpen = useMemo(() => shouldExpand(), [shouldExpand])
  const [isOpen, setIsOpen] = useState(shouldBeOpen)
  const isActive = currentPath ? getMatchedRoute(currentPath)?.path === item.path : false
  const hasChildren = item.children && item.children.length > 0

  // 当 shouldBeOpen 改变时，更新展开状态
  useEffect(() => {
    setIsOpen(shouldBeOpen)
  }, [shouldBeOpen])

  const handleTitleClick = () => {
    onNavigate?.(item.path)
  }

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open)
  }

  if (!hasChildren) {
    return (
      <div className="w-full">
        <div
          className={clsx(
            'group relative flex w-full items-center transition-colors duration-150 select-none',
            isActive
              ? 'bg-zinc-100 text-zinc-900 dark:bg-zinc-800/50 dark:text-zinc-50'
              : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50',
            level > 0 && 'pl-6',
          )}
        >
          {/* Left indicator bar for active item */}
          {isActive && <div className="absolute top-0 left-0 h-full w-0.5 bg-zinc-900 dark:bg-zinc-50" />}
          <button
            onClick={handleTitleClick}
            className={clsx(
              'flex-1 truncate py-1.5 text-left text-sm transition-colors',
              level === 0 ? 'pr-3 pl-4' : 'pr-3 pl-4',
              isActive && 'font-medium',
            )}
            type="button"
          >
            {item.title}
          </button>
        </div>
      </div>
    )
  }

  return (
    <Collapsible open={isOpen} onOpenChange={handleOpenChange} className="w-full">
      <div
        className={clsx(
          'group relative flex w-full items-center transition-colors duration-150 select-none',
          isActive
            ? 'bg-zinc-100 text-zinc-900 dark:bg-zinc-800/50 dark:text-zinc-50'
            : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50',
          level > 0 && 'pl-6',
        )}
      >
        {/* Left indicator bar for active item */}
        {isActive && <div className="absolute top-0 left-0 h-full w-0.5 bg-zinc-900 dark:bg-zinc-50" />}
        <button
          onClick={handleTitleClick}
          className={clsx(
            'flex-1 truncate py-1.5 text-left text-sm transition-colors',
            level === 0 ? 'pr-2 pl-4' : 'pr-2 pl-4',
            isActive && 'font-medium',
          )}
          type="button"
        >
          {item.title}
        </button>
        <CollapsibleTrigger className="mr-2 flex w-auto shrink-0 items-center justify-center rounded p-1 transition-colors duration-150 hover:bg-zinc-200/50 dark:hover:bg-zinc-700/50">
          <CollapsibleChevronIcon />
        </CollapsibleTrigger>
      </div>

      <CollapsibleContent className="mt-0.5">
        {item.children!.map((child) => (
          <NavigationItemComponent
            key={child.path}
            item={child}
            currentPath={currentPath}
            onNavigate={onNavigate}
            level={level + 1}
          />
        ))}
      </CollapsibleContent>
    </Collapsible>
  )
}

export function Sidebar({ currentPath, onNavigate }: SidebarProps) {
  const navigationTree = buildNavigationTree(routes)

  return (
    <aside className="lg:bg-background relative h-screen w-72 overflow-x-hidden overflow-y-auto border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <HeaderLogoSection />

      <nav className="space-y-0.5 px-2 py-3">
        {navigationTree.map((item) => (
          <NavigationItemComponent key={item.path} item={item} currentPath={currentPath} onNavigate={onNavigate} />
        ))}
      </nav>
    </aside>
  )
}
