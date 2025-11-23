import { ChevronLeft, ChevronRight } from 'lucide-react'

import type { RouteConfig } from '../routes'
import { routes } from '../routes'
import { ContentFooter } from './ContentFooter'

interface DocumentNavigationProps {
  currentPath: string
  onNavigate?: (path: string) => void
}

export function DocumentNavigation({ currentPath, onNavigate }: DocumentNavigationProps) {
  // 找到当前路由在数组中的索引
  const currentIndex = routes.findIndex((route) => {
    const normalizedCurrentPath =
      currentPath.endsWith('/') && currentPath !== '/' ? currentPath.slice(0, -1) : currentPath
    const normalizedRoutePath = route.path.endsWith('/') && route.path !== '/' ? route.path.slice(0, -1) : route.path
    return normalizedRoutePath === normalizedCurrentPath
  })

  const prevRoute: RouteConfig | undefined = currentIndex > 0 ? routes[currentIndex - 1] : undefined
  const nextRoute: RouteConfig | undefined =
    currentIndex >= 0 && currentIndex < routes.length - 1 ? routes[currentIndex + 1] : undefined

  const handleClick = (path: string) => {
    onNavigate?.(path)
  }

  const hasNavigation = prevRoute || nextRoute

  return (
    <>
      {hasNavigation && (
        <nav className="mt-12 flex gap-4 border-t border-zinc-200 pt-8 lg:mt-16 dark:border-zinc-800">
          <div className="w-1/2">
            {prevRoute ? (
              <button
                onClick={() => handleClick(prevRoute.path)}
                className="group flex w-full items-center gap-3 rounded-lg border border-zinc-200 bg-white p-4 text-left transition-all hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/50 dark:hover:border-zinc-700 dark:hover:bg-zinc-800/50"
                type="button"
              >
                <ChevronLeft className="h-4 w-4 shrink-0 text-zinc-400 transition-colors group-hover:text-zinc-600 dark:text-zinc-500 dark:group-hover:text-zinc-300" />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Previous</div>
                  <div className="mt-0.5 truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    {prevRoute.title}
                  </div>
                </div>
              </button>
            ) : null}
          </div>

          <div className="w-1/2">
            {nextRoute ? (
              <button
                onClick={() => handleClick(nextRoute.path)}
                className="group flex w-full items-center gap-3 rounded-lg border border-zinc-200 bg-white p-4 text-right transition-all hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/50 dark:hover:border-zinc-700 dark:hover:bg-zinc-800/50"
                type="button"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Next</div>
                  <div className="mt-0.5 truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    {nextRoute.title}
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400 transition-colors group-hover:text-zinc-600 dark:text-zinc-500 dark:group-hover:text-zinc-300" />
              </button>
            ) : null}
          </div>
        </nav>
      )}
      <ContentFooter />
    </>
  )
}
