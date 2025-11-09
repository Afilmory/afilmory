import { photoLoader } from '@afilmory/data'
import { Button, ScrollArea } from '@afilmory/ui'
import { useMemo, useState } from 'react'

// JSON 语法高亮组件
const JsonHighlight = ({ data }: { data: any }) => {
  const jsonString = JSON.stringify(data, null, 2)

  const highlightJson = (str: string) => {
    return str.replaceAll(
      /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
      (match) => {
        let cls = 'text-zinc-500'
        if (match.startsWith('"')) {
          if (match.endsWith(':')) {
            cls = 'text-blue-400' // 键名
          } else {
            cls = 'text-emerald-400' // 字符串值
          }
        } else if (/true|false/.test(match)) {
          cls = 'text-purple-400' // 布尔值
        } else if (/null/.test(match)) {
          cls = 'text-red-400' // null
        } else {
          cls = 'text-orange-400' // 数字
        }
        return `<span class="${cls}">${match}</span>`
      },
    )
  }

  return (
    <pre className="text-sm leading-6 text-zinc-300">
      <code
        dangerouslySetInnerHTML={{
          __html: highlightJson(jsonString),
        }}
      />
    </pre>
  )
}

// 统计卡片组件
const StatCard = ({ label, value, icon }: { label: string; value: string | number; icon: string }) => (
  <div className="group relative overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 backdrop-blur-sm transition-all hover:border-zinc-700 hover:bg-zinc-900/80">
    <div className="absolute inset-0 bg-gradient-to-br from-zinc-800/0 via-zinc-800/5 to-zinc-800/10" />
    <div className="relative">
      <div className="flex items-center justify-between">
        <div className="text-3xl">{icon}</div>
        <div className="text-right">
          <div className="text-2xl font-bold text-zinc-100">{value}</div>
          <div className="text-sm text-zinc-400">{label}</div>
        </div>
      </div>
    </div>
  </div>
)

// 统计信息组件
const ManifestStats = ({ data }: { data: any[] }) => {
  const stats = useMemo(() => {
    const totalPhotos = data.length
    const totalSize = data.reduce((sum, photo) => sum + (photo.size || 0), 0)

    const uniqueTags = new Set()
    data.forEach((photo) => {
      photo.tags?.forEach((tag: string) => uniqueTags.add(tag))
    })

    const cameras = new Set()
    data.forEach((photo) => {
      if (photo.exif?.Make && photo.exif?.Model) {
        cameras.add(`${photo.exif.Make} ${photo.exif.Model}`)
      }
    })

    return {
      totalPhotos,
      totalSize: (totalSize / (1024 * 1024 * 1024)).toFixed(2), // GB

      uniqueTags: uniqueTags.size,
      uniqueCameras: cameras.size,
    }
  }, [data])

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <StatCard label="Photos" value={stats.totalPhotos} icon="📸" />
      <StatCard label="Storage" value={`${stats.totalSize} GB`} icon="💾" />

      <StatCard label="Tags" value={stats.uniqueTags} icon="🏷️" />
      <StatCard label="Cameras" value={stats.uniqueCameras} icon="📷" />
    </div>
  )
}

// 照片卡片组件
const PhotoCard = ({ photo, index }: { photo: any; index: number }) => (
  <div className="group relative overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/30 backdrop-blur-sm transition-all hover:border-zinc-700 hover:bg-zinc-900/50">
    <div className="absolute inset-0 bg-gradient-to-br from-zinc-800/0 via-zinc-800/5 to-zinc-800/10 opacity-0 transition-opacity group-hover:opacity-100" />

    <div className="relative p-6">
      <div className="flex items-start gap-4">
        {/* 缩略图 */}
        <div className="flex-shrink-0">
          {photo.thumbnailUrl ? (
            <div className="relative overflow-hidden rounded-lg">
              <img
                src={photo.thumbnailUrl}
                alt={photo.title}
                className="h-16 w-16 object-cover transition-transform group-hover:scale-110"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
            </div>
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-zinc-800 text-zinc-600">
              <span className="text-xl">📷</span>
            </div>
          )}
        </div>

        {/* 内容 */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-6 w-8 items-center justify-center rounded bg-zinc-800 font-mono text-xs text-zinc-400">
              {index + 1}
            </span>
            <h3 className="truncate font-medium text-zinc-100">{photo.title}</h3>
          </div>

          {/* 元数据网格 */}
          <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm lg:grid-cols-3">
            <div className="flex items-center gap-2">
              <span className="text-zinc-500">📐</span>
              <span className="text-zinc-300">
                {photo.width} × {photo.height}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-zinc-500">📦</span>
              <span className="text-zinc-300">{(photo.size / (1024 * 1024)).toFixed(1)} MB</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-zinc-500">📷</span>
              <span className="truncate text-zinc-300">
                {photo.exif?.Make} {photo.exif?.Model}
              </span>
            </div>
          </div>

          {/* 标签 */}
          {photo.tags && photo.tags.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {photo.tags.slice(0, 3).map((tag: string, tagIndex: number) => (
                <span
                  key={tagIndex}
                  className="inline-flex items-center rounded-full bg-blue-500/10 px-2.5 py-1 text-xs font-medium text-blue-400 ring-1 ring-blue-500/20"
                >
                  {tag}
                </span>
              ))}
              {photo.tags.length > 3 && (
                <span className="inline-flex items-center rounded-full bg-zinc-800 px-2.5 py-1 text-xs text-zinc-400">
                  +{photo.tags.length - 3} more
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  </div>
)

export const Component = () => {
  const [searchTerm, setSearchTerm] = useState('')
  const [viewMode, setViewMode] = useState<'stats' | 'raw'>('stats')

  const photos = photoLoader.getPhotos()
  const manifestData = {
    version: 'v6',
    data: photos,
  }

  // 搜索过滤
  const filteredPhotos = useMemo(() => {
    if (!searchTerm) return photos

    const term = searchTerm.toLowerCase()
    return photos.filter(
      (photo) =>
        photo.title?.toLowerCase().includes(term) ||
        photo.description?.toLowerCase().includes(term) ||
        photo.tags?.some((tag) => tag.toLowerCase().includes(term)) ||
        photo.exif?.Make?.toLowerCase().includes(term) ||
        photo.exif?.Model?.toLowerCase().includes(term),
    )
  }, [photos, searchTerm])

  const handleExport = () => {
    const dataStr = JSON.stringify(manifestData, null, 2)
    const dataBlob = new Blob([dataStr], { type: 'application/json' })
    const url = URL.createObjectURL(dataBlob)

    const link = document.createElement('a')
    link.href = url
    link.download = 'photos-manifest.json'
    document.body.append(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="min-h-screen bg-black">
      {/* 背景渐变 */}
      <div className="fixed inset-0 bg-gradient-to-br from-zinc-900 via-black to-zinc-900" />
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900/20 via-transparent to-transparent" />

      {/* Header */}
      <div className="relative">
        <div className="sticky top-0 z-50 border-b border-zinc-800/50 bg-black/80 backdrop-blur-xl">
          <div className="mx-auto max-w-7xl px-6">
            <div className="flex h-16 items-center justify-between">
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-3">
                  <h1 className="text-xl font-semibold text-zinc-100">Afilmory Manifest</h1>
                </div>

                <div className="flex items-center rounded-lg bg-zinc-900/50 p-1">
                  <Button
                    variant={viewMode === 'stats' ? 'primary' : 'ghost'}
                    size="sm"
                    onClick={() => setViewMode('stats')}
                    className="h-8 text-xs"
                  >
                    Overview
                  </Button>
                  <Button
                    variant={viewMode === 'raw' ? 'primary' : 'ghost'}
                    size="sm"
                    onClick={() => setViewMode('raw')}
                    className="h-8 text-xs"
                  >
                    Raw Data
                  </Button>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search photos, tags, cameras..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-64 rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-2 text-sm text-zinc-100 placeholder-zinc-500 backdrop-blur-sm transition-colors focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  />
                  <div className="absolute top-1/2 right-3 -translate-y-1/2 text-zinc-500">🔍</div>
                </div>

                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleExport}
                  className="h-9 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400"
                >
                  Export JSON
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="relative mx-auto max-w-7xl px-6 py-8">
          {viewMode === 'stats' ? (
            <div className="space-y-8">
              {/* 统计信息 */}
              <div>
                <h2 className="mb-6 text-lg font-medium text-zinc-300">Overview</h2>
                <ManifestStats data={filteredPhotos} />
              </div>

              {/* 照片列表 */}
              <div>
                <div className="mb-6 flex items-center justify-between">
                  <h2 className="text-lg font-medium text-zinc-300">
                    Photos ({filteredPhotos.length.toLocaleString()})
                  </h2>
                  {searchTerm && (
                    <div className="text-sm text-zinc-400">Filtered from {photos.length.toLocaleString()} total</div>
                  )}
                </div>

                <ScrollArea rootClassName="h-[600px]">
                  <div className="space-y-4 pr-4">
                    {filteredPhotos.map((photo, index) => (
                      <PhotoCard key={photo.id} photo={photo} index={index} />
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </div>
          ) : (
            /* 原始 JSON 数据视图 */
            <div>
              <div className="mb-6">
                <h2 className="text-lg font-medium text-zinc-300">Raw Manifest Data</h2>
                <p className="mt-1 text-sm text-zinc-500">Complete JSON manifest in structured format</p>
              </div>

              <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/30 backdrop-blur-sm">
                <div className="border-b border-zinc-800 bg-zinc-900/50 px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="flex gap-1.5">
                      <div className="h-3 w-3 rounded-full bg-red-500" />
                      <div className="h-3 w-3 rounded-full bg-yellow-500" />
                      <div className="h-3 w-3 rounded-full bg-green-500" />
                    </div>
                    <span className="font-mono text-sm text-zinc-400">photos-manifest.json</span>
                  </div>
                </div>

                <ScrollArea rootClassName="h-[700px]">
                  <div className="p-6">
                    <JsonHighlight data={searchTerm ? { version: 'v6', data: filteredPhotos } : manifestData} />
                  </div>
                </ScrollArea>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
