import { ExternalLink } from 'lucide-react'

import { CONTENT_DIR, GITHUB_BRANCH, GITHUB_REPO } from '../constants'
import { tocData } from '../toc-data'

interface DocumentMetaProps {
  currentPath: string
  createdAt?: string
  lastModified?: string
}

function getFilePathFromPath(routePath: string): string | null {
  const normalizedPath = routePath.endsWith('/') && routePath !== '/' ? routePath.slice(0, -1) : routePath
  const item = tocData.find((item) => item.path === normalizedPath)
  return item?.file || null
}

function getGitHubEditUrl(currentPath: string): string | null {
  const filePath = getFilePathFromPath(currentPath)
  if (!filePath) return null
  return `${GITHUB_REPO}/edit/${GITHUB_BRANCH}/${CONTENT_DIR}/${filePath}`
}

export function DocumentFooter({ currentPath, createdAt, lastModified }: DocumentMetaProps) {
  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString)
      return new Intl.DateTimeFormat('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Shanghai',
      }).format(date)
    } catch {
      return dateString
    }
  }

  const editUrl = getGitHubEditUrl(currentPath)
  const hasMeta = createdAt || lastModified

  if (!hasMeta && !editUrl) {
    return null
  }

  return (
    <div className="mt-12 border-t border-zinc-200 pt-6 lg:mt-16 dark:border-zinc-800">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* 左侧：日期信息 */}
        {hasMeta && (
          <div className="flex flex-col flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            {lastModified && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Updated</span>
                <time dateTime={lastModified} className="font-mono text-xs text-zinc-600 dark:text-zinc-300">
                  {formatDate(lastModified)}
                </time>
              </div>
            )}
          </div>
        )}

        {/* 右侧：GitHub 编辑链接 */}
        {editUrl && (
          <a
            href={editUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-zinc-700 transition-all hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-300 dark:hover:border-zinc-700 dark:hover:bg-zinc-800/50 dark:hover:text-zinc-100"
          >
            <ExternalLink className="h-4 w-4" />
            <span>Edit on GitHub</span>
          </a>
        )}
      </div>
    </div>
  )
}
