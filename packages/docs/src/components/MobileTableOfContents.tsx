import { useState } from 'react'

import { TableOfContents } from './TableOfContents'

interface MobileTableOfContentsProps {
  currentPath: string
  handleScroll?: (top: number) => void
}

export function MobileTableOfContents({ currentPath, handleScroll }: MobileTableOfContentsProps) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      {/* TOC 按钮 */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="hover:bg-material-opaque text-text-primary  bg-material-opaque border-border fixed right-4 bottom-6 z-50 flex h-12 w-12 items-center justify-center rounded-full border-[1px] shadow-2xl backdrop-blur-xl transition-all duration-200 hover:shadow-xl xl:hidden"
        aria-label="Toggle TOC"
        type="button"
      >
        <svg
          className={`h-5 w-5 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          {isOpen ? (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
          )}
        </svg>
      </button>

      {/* TOC 面板 */}
      {isOpen && (
        <>
          {/* 背景遮罩 */}
          <div className="fixed inset-0 z-40 bg-black/20 xl:hidden" onClick={() => setIsOpen(false)} />

          {/* TOC 内容 */}
          <div className="animate-in slide-in-from-bottom-4 fade-in bg-background-quaternary fixed right-4 bottom-20 z-50 max-h-96 w-80 overflow-hidden rounded-2xl shadow-2xl duration-300 xl:hidden">
            <div className="flex items-center justify-between border-b border-gray-500/50 px-4 py-3">
              <h3 className="text-text-primary text-base font-semibold">目录</h3>
            </div>
            <div className="scrollbar-hide max-h-80 overflow-y-auto p-4">
              <TableOfContents
                currentPath={currentPath}
                onItemClick={() => setIsOpen(false)}
                handleScroll={handleScroll}
              />
            </div>
          </div>
        </>
      )}
    </>
  )
}
