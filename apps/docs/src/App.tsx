import { AlignLeftIcon, ArrowRight } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { DocumentNavigation, MDX } from './components'
import { DocumentFooter } from './components/DocumentFooter'
import { MobileTableOfContents } from './components/MobileTableOfContents'
import { Sidebar } from './components/Sidebar'
import { TableOfContents } from './components/TableOfContents'
import { NavigationProvider } from './contexts/NavigationContext'
import { getRandomKaomoji } from './utils/kaomoji'
import { getMatchedRoute } from './utils/routes'
import { springScrollTo } from './utils/scroller'

function App({ url }: { url?: string }) {
  const [currentPath, setCurrentPath] = useState(url || '/')
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const matchedRoute = getMatchedRoute(currentPath)
  const mainContentRef = useRef<HTMLDivElement>(null)

  const handleScrollMainContent = (top: number) => {
    if (mainContentRef.current) {
      springScrollTo(top, mainContentRef.current, 'y')
    }
  }

  const handleNavigate = useCallback(
    (path: string) => {
      setCurrentPath(path)
      setIsSidebarOpen(false) // 导航后关闭侧边栏
      // 在实际应用中，这里会更新浏览器历史记录

      window.history.pushState({}, '', path)
    },
    [setCurrentPath, setIsSidebarOpen],
  )

  const toggleSidebar = useCallback(() => {
    setIsSidebarOpen(!isSidebarOpen)
  }, [isSidebarOpen])

  useEffect(() => {
    if (matchedRoute) {
      document.title = `${matchedRoute.title || 'Docs'} | Afilmory Docs`
    } else {
      document.title = '404 Page Not Found | Afilmory Docs'
    }
  }, [matchedRoute])

  // 页面切换时滚动到顶部
  useEffect(() => {
    if (mainContentRef.current) {
      springScrollTo(0, mainContentRef.current, 'y')
    }
  }, [currentPath])

  if (!matchedRoute) {
    return (
      <NavigationProvider navigate={handleNavigate}>
        <div className="bg-background flex h-screen">
          {/* 桌面端侧边栏 */}
          <div className="hidden lg:block">
            <Sidebar currentPath={currentPath} onNavigate={handleNavigate} />
          </div>

          {/* 移动端侧边栏 */}
          {isSidebarOpen && (
            <>
              <div
                className="bg-opacity-50 fixed inset-0 z-40 bg-black lg:hidden"
                onClick={() => setIsSidebarOpen(false)}
              />
              <div className="fixed top-0 left-0 z-50 h-full lg:hidden">
                <Sidebar currentPath={currentPath} onNavigate={handleNavigate} />
              </div>
            </>
          )}

          <main className="bg-background flex flex-1 items-center justify-center">
            {/* 移动端顶部栏 */}
            <div className="fixed top-0 right-0 left-0 z-30 h-16 border-b border-zinc-200 bg-white/80 backdrop-blur-xl lg:hidden dark:border-zinc-800 dark:bg-zinc-950/80">
              <div className="flex h-full items-center px-4">
                <button
                  onClick={toggleSidebar}
                  className="rounded-lg p-2 text-zinc-700 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  type="button"
                >
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </button>
                <div className="flex-1 text-center">
                  <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Afilmory Docs</h1>
                </div>
                <div className="w-10" /> {/* 平衡按钮 */}
              </div>
            </div>

            <div className="mx-4 mt-16 rounded-xl p-8 text-center lg:mt-0">
              <div className="mb-6 flex items-center justify-center text-4xl">{getRandomKaomoji()}</div>
              <h1 className="mb-1 text-3xl font-semibold">404</h1>
              <p className="text-text-secondary text-lg">Page not found</p>
              <button
                onClick={() => handleNavigate('/')}
                className="bg-accent mt-6 rounded-full px-4 py-2 text-white transition-opacity hover:opacity-90 dark:text-zinc-900"
                type="button"
              >
                Return Home <ArrowRight className="inline-block h-4 w-4" />
              </button>
            </div>

            {/* 移动端 TOC (404页面不需要，但为了一致性保留结构) */}
            <MobileTableOfContents currentPath={currentPath} />
          </main>
        </div>
      </NavigationProvider>
    )
  }

  const Component = matchedRoute.component
  const meta = matchedRoute.meta as {
    createdAt?: string
    lastModified?: string
  }

  return (
    <NavigationProvider navigate={handleNavigate}>
      <div className="bg-background flex h-screen">
        {/* 桌面端侧边栏 */}
        <div className="hidden lg:block">
          <Sidebar currentPath={currentPath} onNavigate={handleNavigate} />
        </div>

        <>
          <div
            className="bg-opacity-50 fixed inset-0 z-40 bg-black/10 lg:hidden"
            style={{ display: isSidebarOpen ? 'block' : 'none' }}
            onClick={() => setIsSidebarOpen(false)}
          />
          <div
            className="fixed top-0 left-0 z-50 h-full lg:hidden"
            style={{
              transform: isSidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
              transition: 'transform 0.3s ease-in-out',
            }}
          >
            <Sidebar currentPath={currentPath} onNavigate={handleNavigate} />
          </div>
        </>

        {/* 主内容区域 */}
        <main className="bg-background relative flex-1 overflow-y-auto" ref={mainContentRef}>
          <div className="sticky top-0 z-30 h-16 border-b border-zinc-200 bg-white/80 backdrop-blur-xl lg:hidden dark:border-zinc-800 dark:bg-zinc-950/80">
            <div className="flex h-full items-center px-4">
              <button
                onClick={toggleSidebar}
                className="rounded-lg p-2 text-zinc-700 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                type="button"
              >
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <div className="flex-1 text-center">
                <a href="/" className="select-none">
                  <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Afilmory Docs</h1>
                </a>
              </div>
              <div className="w-10" /> {/* 平衡按钮 */}
            </div>
          </div>

          <div className="mx-auto flex max-w-7xl">
            {/* 文档内容 */}
            <div className="w-full flex-1 px-4 py-6 lg:px-8 lg:py-12">
              <article className="prose dark:prose-invert prose-neutral bg-background max-w-none rounded-xl p-4 lg:p-8">
                <MDX content={<Component />} />
                <DocumentFooter currentPath={currentPath} createdAt={meta.createdAt} lastModified={meta.lastModified} />
                <DocumentNavigation currentPath={currentPath} onNavigate={handleNavigate} />
              </article>
            </div>

            {/* 桌面端目录 */}
            <div className="hidden w-64 px-4 pt-6 lg:pt-12 xl:block">
              <h4 className="mb-3 flex items-center gap-2 text-sm font-normal text-zinc-600 dark:text-zinc-500">
                <AlignLeftIcon className="mr-1 inline-block h-4 w-4" />
                On this page
              </h4>
              <div className="scrollbar-hide sticky top-6 max-h-[calc(100vh-2rem)] overflow-y-auto">
                <TableOfContents
                  currentPath={currentPath}
                  handleScroll={handleScrollMainContent}
                  scrollerElement={mainContentRef.current || undefined}
                />
              </div>
            </div>
          </div>

          {/* 移动端 TOC */}
          <MobileTableOfContents
            currentPath={currentPath}
            handleScroll={handleScrollMainContent}
            scrollerElement={mainContentRef.current || undefined}
          />
        </main>
      </div>
    </NavigationProvider>
  )
}

export default App
