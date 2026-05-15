import { Command } from 'cmdk'
import { Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { GITHUB_REPO } from '../constants'
import { useNavigation } from '../contexts/NavigationContext'
import routesIndex from '../routes.json'

function GithubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden className={className}>
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  )
}

type DocsIndexEntry = {
  path: string
  title: string
  meta?: {
    title?: string
    description?: string
    order?: string | number
  }
}

const docsIndex = routesIndex as DocsIndexEntry[]

const WHITESPACE = /\s+/

function rankRoute(item: DocsIndexEntry, query: string) {
  if (!query) {
    return 0
  }

  const q = query.toLowerCase()
  const title = item.title?.toLowerCase() ?? ''
  const description = item.meta?.description?.toLowerCase() ?? ''
  const path = item.path.toLowerCase()

  let score = 0
  if (title === q) {
    score += 6
  }
  if (title.includes(q)) {
    score += 4
  }
  if (description.includes(q)) {
    score += 2
  }
  if (path.includes(q)) {
    score += 1
  }

  // Reward matches on individual words to improve partial hits
  const parts = q.split(WHITESPACE).filter(Boolean)
  for (const part of parts) {
    if (title.includes(part)) {
      score += 1
    }
    if (description.includes(part)) {
      score += 0.5
    }
  }

  return score
}

function sortByOrder(a: DocsIndexEntry, b: DocsIndexEntry) {
  const orderA = Number(a.meta?.order)
  const orderB = Number(b.meta?.order)
  const safeA = Number.isFinite(orderA) ? orderA : Number.POSITIVE_INFINITY
  const safeB = Number.isFinite(orderB) ? orderB : Number.POSITIVE_INFINITY
  if (safeA === safeB) {
    return a.path.localeCompare(b.path)
  }
  return safeA - safeB
}

export function HeaderLogoSection() {
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const { navigate } = useNavigation()

  const results = useMemo(() => {
    const trimmed = query.trim().toLowerCase()
    if (!trimmed) {
      return [...docsIndex].sort(sortByOrder).slice(0, 8)
    }

    return docsIndex
      .map(item => ({
        item,
        score: rankRoute(item, trimmed),
      }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => {
        if (b.score === a.score) {
          return sortByOrder(a.item, b.item)
        }
        return b.score - a.score
      })
      .map(({ item }) => item)
      .slice(0, 12)
  }, [query])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setIsSearchOpen(prev => !prev)
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    if (!isSearchOpen) {
      setQuery('')
    }
  }, [isSearchOpen])

  const handleSearchClick = () => {
    setIsSearchOpen(!isSearchOpen)
  }

  const handleSelect = (value: string) => {
    navigate(value)
    setIsSearchOpen(false)
  }

  return (
    <>
      <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-4 dark:border-zinc-800">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="relative shrink-0">
            <img
              src="https://github.com/Afilmory/assets/blob/main/512-mac.png?raw=true"
              alt="Afilmory"
              className="h-10 w-10 rounded-lg"
            />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-semibold text-zinc-900 dark:text-zinc-100">Afilmory</h2>
            <p className="truncate text-xs text-zinc-500 dark:text-zinc-500">Documentation</p>
          </div>
        </div>
        <div className="ml-2 flex shrink-0 items-center gap-1.5">
          <button
            onClick={handleSearchClick}
            className="flex h-8 w-8 items-center justify-center rounded-md bg-zinc-100 text-zinc-600 transition-colors hover:bg-zinc-200 hover:text-zinc-900 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-zinc-100"
            aria-label="Search"
            type="button"
          >
            <Search className="h-4 w-4" />
          </button>
          <a
            href={GITHUB_REPO}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-8 w-8 items-center justify-center rounded-md bg-zinc-100 text-zinc-600 transition-colors hover:bg-zinc-200 hover:text-zinc-900 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-zinc-100"
            aria-label="View on GitHub"
          >
            <GithubIcon className="h-4 w-4" />
          </a>
        </div>
      </div>

      <Command.Dialog
        open={isSearchOpen}
        onOpenChange={setIsSearchOpen}
        label="Search docs"
        className="fixed top-24 left-1/2 z-50 w-[min(720px,calc(100%-1.5rem))] -translate-x-1/2 overflow-hidden rounded-2xl border border-zinc-200/70 bg-white/80 text-zinc-900 shadow-2xl backdrop-blur-2xl transition-all duration-150 dark:border-zinc-800/70 dark:bg-zinc-900/85 dark:text-zinc-50"
      >
        <div className="border-b border-zinc-200/70 bg-linear-to-r from-white/70 via-white/50 to-white/60 px-4 py-3 dark:border-zinc-800/70 dark:from-zinc-900/70 dark:via-zinc-900/50 dark:to-zinc-900/60">
          <Command.Input
            autoFocus
            placeholder="Search docs by title or description..."
            value={query}
            onValueChange={setQuery}
            className="w-full bg-transparent text-sm outline-none placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
          />
        </div>

        <Command.List className="max-h-96 overflow-y-auto p-2">
          <Command.Empty className="px-3 py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
            No results found. Try a different keyword.
          </Command.Empty>

          <Command.Group heading="Docs" className="space-y-1 text-xs font-medium text-zinc-400 dark:text-zinc-500">
            {results.map(item => (
              <Command.Item
                key={item.path}
                value={item.path}
                onSelect={handleSelect}
                className="group flex cursor-pointer items-start justify-between gap-2 rounded-xl px-3 py-2 text-sm text-zinc-800 transition-all duration-150 outline-none data-[selected=true]:bg-zinc-100/90 data-[selected=true]:shadow-inner dark:text-zinc-100 dark:data-[selected=true]:bg-zinc-800/70"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium text-zinc-900 group-data-[selected=true]:text-zinc-900 dark:text-zinc-50 dark:group-data-[selected=true]:text-white">
                    {item.title}
                  </div>
                  {item.meta?.description && (
                    <p className="truncate text-xs text-zinc-500 group-data-[selected=true]:text-zinc-600 dark:text-zinc-400 dark:group-data-[selected=true]:text-zinc-300">
                      {item.meta.description}
                    </p>
                  )}
                </div>
                <span className="shrink-0 rounded-md bg-zinc-100 px-2 py-1 text-[11px] text-zinc-500 group-data-[selected=true]:bg-zinc-200 group-data-[selected=true]:text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400 dark:group-data-[selected=true]:bg-zinc-700 dark:group-data-[selected=true]:text-zinc-200">
                  {item.path}
                </span>
              </Command.Item>
            ))}
          </Command.Group>
        </Command.List>
      </Command.Dialog>

      {isSearchOpen && <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" aria-hidden />}
    </>
  )
}
