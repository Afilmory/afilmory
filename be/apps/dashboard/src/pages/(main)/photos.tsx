import { Button, LazyImage, ScrollArea } from '@afilmory/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { ofetch } from 'ofetch'
import type { CSSProperties, ReactNode } from 'react'
import { useState } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'

const PAGE_SIZE = 24

const SKELETON_KEYS = Array.from(
  { length: PAGE_SIZE },
  (_, index) => `skeleton-${index}`,
)

const apiClient = ofetch.create({
  baseURL: '/api',
  credentials: 'include',
})

const cameraInfoSchema = z.object({
  make: z.string().optional(),
  model: z.string(),
  displayName: z.string(),
})

const photoManifestSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  dateTaken: z.string(),
  tags: z.array(z.string()),
  originalUrl: z.string(),
  thumbnailUrl: z.string(),
  thumbHash: z.string().nullable().optional(),
  width: z.number(),
  height: z.number(),
  aspectRatio: z.number(),
  s3Key: z.string(),
  lastModified: z.string(),
  size: z.number(),
  exif: z.record(z.any()).nullable().optional(),
  toneAnalysis: z
    .object({
      toneType: z.string(),
      brightness: z.number(),
      contrast: z.number(),
      shadowRatio: z.number(),
      highlightRatio: z.number(),
    })
    .partial()
    .nullable()
    .optional(),
  isLivePhoto: z.boolean().optional(),
  isHDR: z.boolean().optional(),
  livePhotoVideoUrl: z.string().nullable().optional(),
  livePhotoVideoS3Key: z.string().nullable().optional(),
})

const photoRecordSchema = z.object({
  id: z.string(),
  storageKey: z.string(),
  title: z.string(),
  description: z.string(),
  dateTaken: z.string(),
  tags: z.array(z.string()),
  originalUrl: z.string(),
  thumbnailUrl: z.string(),
  thumbHash: z.string().nullable(),
  width: z.number(),
  height: z.number(),
  aspectRatio: z.number(),
  size: z.number(),
  lastModified: z.string(),
  isLivePhoto: z.boolean(),
  isHdr: z.boolean(),
  livePhotoVideoUrl: z.string().nullable(),
  livePhotoVideoKey: z.string().nullable(),
  toneAnalysis: z.record(z.any()).nullable(),
  exif: z.record(z.any()).nullable(),
  syncedAt: z.string(),
  updatedAt: z.string(),
  manifest: photoManifestSchema,
})

const listPhotosResponseSchema = z.object({
  data: z.array(photoRecordSchema),
  meta: z.object({
    page: z.number(),
    limit: z.number(),
    total: z.number(),
    totalPages: z.number(),
  }),
})

const manifestSummarySchema = z.object({
  provider: z.string().nullable(),
  manifest: z
    .object({
      version: z.string(),
      totalPhotos: z.number(),
      cameras: z.array(cameraInfoSchema),
      lenses: z.array(cameraInfoSchema),
      syncedAt: z.string(),
    })
    .nullable(),
})

const syncResponseSchema = z.object({
  provider: z.string(),
  summary: z.object({
    inserted: z.number(),
    updated: z.number(),
    skipped: z.number(),
    deleted: z.number(),
    failed: z.number(),
    total: z.number(),
    durationMs: z.number(),
  }),
  manifest: manifestSummarySchema.shape.manifest,
})

type PhotoRecord = z.infer<typeof photoRecordSchema>
type ListPhotosResponse = z.infer<typeof listPhotosResponseSchema>
type ManifestSummary = z.infer<typeof manifestSummarySchema>
type SyncResponse = z.infer<typeof syncResponseSchema>

type PhotoManifestItem = z.infer<typeof photoManifestSchema>

const PROVIDER_LABELS: Record<string, string> = {
  s3: 'Amazon S3',
  github: 'GitHub 仓库',
  local: '本地存储',
  eagle: 'Eagle 资料库',
}

const ACCENT_GRADIENT_STYLE: CSSProperties = {
  background:
    'linear-gradient(135deg, color-mix(in srgb, var(--color-accent) 12%, transparent) 0%, transparent 55%)',
}

function formatDateTime(iso: string, options?: Intl.DateTimeFormatOptions) {
  if (!iso) {
    return '—'
  }
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      dateStyle: 'medium',
      timeStyle: 'short',
      ...options,
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B'
  }
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  )
  const value = bytes / 1024 ** exponent
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[exponent]}`
}

function deriveCameraName(manifest: PhotoManifestItem) {
  const make = manifest.exif?.Make?.toString().trim()
  const model = manifest.exif?.Model?.toString().trim()
  if (!make || !model) {
    return null
  }
  return `${make} ${model}`
}

function deriveLensName(manifest: PhotoManifestItem) {
  const model = manifest.exif?.LensModel?.toString().trim()
  if (!model) {
    return null
  }
  const make = manifest.exif?.LensMake?.toString().trim()
  return make ? `${make} ${model}` : model
}

const PhotoSkeletonCard = () => (
  <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl">
    <div className="aspect-[3/2] animate-pulse rounded-xl bg-white/10" />
    <div className="mt-4 space-y-3">
      <div className="h-3 w-32 animate-pulse rounded-full bg-white/10" />
      <div className="h-3 w-48 animate-pulse rounded-full bg-white/5" />
      <div className="h-3 w-40 animate-pulse rounded-full bg-white/5" />
    </div>
  </div>
)

const providerLabel = (value: string | null | undefined) => {
  if (!value) return '未配置存储提供商'
  return PROVIDER_LABELS[value] ?? value
}

export const Component = () => {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [selectedCamera, setSelectedCamera] = useState<string | null>(null)
  const [selectedLens, setSelectedLens] = useState<string | null>(null)
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null)

  const photosQuery = useQuery<ListPhotosResponse, Error>({
    queryKey: ['photos', page],
    queryFn: async () => {
      const response = await apiClient('/photos', {
        query: { page, limit: PAGE_SIZE },
      })
      return listPhotosResponseSchema.parse(response)
    },
    keepPreviousData: true,
  })

  const manifestQuery = useQuery<ManifestSummary, Error>({
    queryKey: ['photos-manifest'],
    queryFn: async () =>
      manifestSummarySchema.parse(await apiClient('/photos/manifest')),
  })

  const syncMutation = useMutation<SyncResponse, Error>({
    mutationFn: async () =>
      syncResponseSchema.parse(
        await apiClient('/photos/sync', { method: 'POST' }),
      ),
    onSuccess: (result) => {
      toast.success('同步完成', {
        description: `新增 ${result.summary.inserted} · 更新 ${result.summary.updated} · 删除 ${result.summary.deleted}`,
      })
      void queryClient.invalidateQueries({ queryKey: ['photos'] })
      void queryClient.invalidateQueries({ queryKey: ['photos-manifest'] })
    },
    onError: (error) => {
      toast.error('同步失败', {
        description: error.message ?? '无法同步照片，请稍后再试。',
      })
    },
  })

  const filteredPhotos = photosQuery.data
    ? photosQuery.data.data.filter((item) => {
        const cameraName = deriveCameraName(item.manifest)
        const lensName = deriveLensName(item.manifest)
        const cameraMatches = selectedCamera
          ? cameraName === selectedCamera
          : true
        const lensMatches = selectedLens ? lensName === selectedLens : true
        return cameraMatches && lensMatches
      })
    : []

  const totalSelectedSize = filteredPhotos.reduce(
    (acc, item) =>
      acc + (Number.isFinite(item.manifest.size) ? item.manifest.size : 0),
    0,
  )

  const manifest = manifestQuery.data?.manifest ?? null
  const provider = manifestQuery.data?.provider ?? null

  const selectedPhoto = selectedPhotoId
    ? (filteredPhotos.find((item) => item.id === selectedPhotoId) ?? null)
    : null

  const handleSelectCamera = (name: string) => {
    setSelectedCamera((prev) => {
      const next = prev === name ? null : name
      if (next !== prev) {
        setPage(1)
      }
      return next
    })
  }

  const handleSelectLens = (name: string) => {
    setSelectedLens((prev) => {
      const next = prev === name ? null : name
      if (next !== prev) {
        setPage(1)
      }
      return next
    })
  }

  const handleSelectPhoto = (photoId: string) => {
    setSelectedPhotoId((prev) => (prev === photoId ? null : photoId))
  }

  const clearFilters = () => {
    setSelectedCamera(null)
    setSelectedLens(null)
    setPage(1)
  }

  const isSyncing = syncMutation.isPending
  const isLoadingPhotos = photosQuery.isLoading
  const isFetchingPhotos = photosQuery.isFetching && !photosQuery.isLoading
  const isLoadingManifest = manifestQuery.isLoading

  const totalPages = Math.max(photosQuery.data?.meta.totalPages ?? 1, 1)

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 pt-12 pb-16">
      <section className="bg-material-thin/80 relative overflow-hidden rounded-3xl border border-white/10 p-8 shadow-[0_40px_90px_-60px_rgba(15,23,42,0.65)] backdrop-blur-3xl">
        <div
          className="pointer-events-none absolute inset-0 -z-10 opacity-90"
          style={ACCENT_GRADIENT_STYLE}
        />
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div className="max-w-2xl space-y-3">
            <h1 className="text-text text-3xl font-semibold md:text-4xl">
              照片同步面板
            </h1>
            <p className="text-text-secondary text-sm">
              根据当前租户配置的存储提供商，拉取照片并更新数据库记录。支持查看
              manifest 概要、设备分布并对照片进行精细管理。
            </p>
            <div className="text-text-tertiary flex flex-wrap items-center gap-2 text-xs">
              <span className="border-accent/40 bg-accent/15 text-accent rounded-full border px-3 py-1 font-medium">
                {providerLabel(provider)}
              </span>
              {manifest?.version ? (
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                  Manifest {manifest.version}
                </span>
              ) : null}
              {manifest?.syncedAt ? (
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                  上次同步 {formatDateTime(manifest.syncedAt)}
                </span>
              ) : null}
            </div>
          </div>
          <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
            <div className="text-text-secondary text-right text-sm sm:text-left">
              <div className="text-text font-medium">
                {`${manifest?.totalPhotos ?? 0} 张照片`}
              </div>
              <div>{`当前页展示 ${filteredPhotos.length} 张`}</div>
            </div>
            <Button
              variant="primary"
              size="lg"
              className="relative overflow-hidden rounded-full px-5 py-2 text-sm font-medium"
              isLoading={isSyncing}
              onClick={() => syncMutation.mutate()}
            >
              <span className="inline-flex items-center gap-2">
                <i
                  className="i-mingcute-refresh-2-fill text-base"
                  aria-hidden="true"
                />
                <span>{isSyncing ? '同步中…' : '立即同步'}</span>
              </span>
            </Button>
          </div>
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <StatBlock
            label="数据库照片总量"
            value={`${manifest?.totalPhotos ?? 0} 张`}
            loading={isLoadingManifest}
          />
          <StatBlock
            label="当前筛选"
            value={`${filteredPhotos.length} 张`}
            loading={isLoadingPhotos}
          />
          <StatBlock
            label="筛选总容量"
            value={formatBytes(totalSelectedSize)}
            loading={isLoadingPhotos}
          />
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
        <div className="bg-material-thin/70 relative overflow-hidden rounded-3xl border border-white/10 p-6 shadow-[0_32px_80px_-60px_rgba(15,23,42,0.6)] backdrop-blur-2xl">
          <div
            className="pointer-events-none absolute inset-0 -z-10 opacity-80"
            style={ACCENT_GRADIENT_STYLE}
          />
          <header className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-text text-lg font-medium">相机分布</h2>
              <p className="text-text-secondary text-xs">
                点击相机型号以筛选下方照片，支持组合筛选。
              </p>
            </div>
            {selectedCamera ? (
              <button
                type="button"
                onClick={() => setSelectedCamera(null)}
                className="text-text-secondary hover:border-accent/40 hover:text-text rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs transition-colors duration-200"
              >
                清除筛选
              </button>
            ) : null}
          </header>
          <ScrollArea orientation="vertical" rootClassName="h-48">
            <div className="flex flex-col gap-2 pr-3">
              {manifest?.cameras?.length ? (
                manifest.cameras.map((camera) => (
                  <Chip
                    key={camera.displayName}
                    active={selectedCamera === camera.displayName}
                    onClick={() => handleSelectCamera(camera.displayName)}
                    label={camera.displayName}
                    hint={camera.make ? `${camera.make}` : undefined}
                  />
                ))
              ) : (
                <p className="text-text-tertiary text-xs">暂无相机信息。</p>
              )}
            </div>
          </ScrollArea>
        </div>
        <div className="bg-material-thin/70 relative overflow-hidden rounded-3xl border border-white/10 p-6 shadow-[0_32px_80px_-60px_rgba(15,23,42,0.6)] backdrop-blur-2xl">
          <div
            className="pointer-events-none absolute inset-0 -z-10 opacity-80"
            style={ACCENT_GRADIENT_STYLE}
          />
          <header className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-text text-lg font-medium">镜头分布</h2>
              <p className="text-text-secondary text-xs">
                挑选常用镜头快速定位素材。
              </p>
            </div>
            {selectedLens ? (
              <button
                type="button"
                onClick={() => setSelectedLens(null)}
                className="text-text-secondary hover:border-accent/40 hover:text-text rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs transition-colors duration-200"
              >
                清除筛选
              </button>
            ) : null}
          </header>
          <ScrollArea orientation="vertical" rootClassName="h-48">
            <div className="flex flex-col gap-2 pr-3">
              {manifest?.lenses?.length ? (
                manifest.lenses.map((lens) => (
                  <Chip
                    key={lens.displayName}
                    active={selectedLens === lens.displayName}
                    onClick={() => handleSelectLens(lens.displayName)}
                    label={lens.displayName}
                    hint={lens.make ?? undefined}
                  />
                ))
              ) : (
                <p className="text-text-tertiary text-xs">暂无镜头信息。</p>
              )}
            </div>
          </ScrollArea>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <div className="bg-material-thin/80 relative overflow-hidden rounded-3xl border border-white/10 p-6 shadow-[0_36px_100px_-60px_rgba(15,23,42,0.68)] backdrop-blur-3xl">
          <div
            className="pointer-events-none absolute inset-0 -z-10 opacity-75"
            style={ACCENT_GRADIENT_STYLE}
          />
          <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-text text-lg font-medium">照片清单</h2>
              <p className="text-text-secondary text-xs">
                点击照片可查看详细 manifest 信息，支持按相机和镜头筛选。
              </p>
            </div>
            <div className="text-text-tertiary flex items-center gap-3 text-xs">
              <span>
                第 {page} 页 / 共 {totalPages} 页
              </span>
              <span>当前筛选 {filteredPhotos.length} 张</span>
            </div>
          </header>

          {isLoadingPhotos ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {SKELETON_KEYS.map((key) => (
                <PhotoSkeletonCard key={key} />
              ))}
            </div>
          ) : filteredPhotos.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {filteredPhotos.map((photo) => (
                <PhotoCard
                  key={photo.id}
                  photo={photo}
                  active={selectedPhotoId === photo.id}
                  onSelect={() => handleSelectPhoto(photo.id)}
                />
              ))}
            </div>
          ) : (
            <div className="flex min-h-[240px] flex-col items-center justify-center gap-2 text-center">
              <i
                className="i-mingcute-image-line text-text-tertiary text-3xl"
                aria-hidden="true"
              />
              <p className="text-text-secondary text-sm">
                暂无符合筛选条件的照片。
              </p>
              {selectedCamera || selectedLens ? (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="text-text-secondary hover:border-accent/40 hover:text-text rounded-full border border-white/10 bg-white/5 px-4 py-1 text-xs transition-colors duration-200"
                >
                  清除筛选条件
                </button>
              ) : null}
            </div>
          )}

          <div className="text-text-secondary mt-6 flex flex-col items-center justify-between gap-4 border-t border-white/5 pt-4 text-sm sm:flex-row">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                disabled={page === 1 || isFetchingPhotos}
                className={clsx(
                  'inline-flex items-center gap-1 rounded-full border px-4 py-1 transition-colors duration-200',
                  page === 1 || isFetchingPhotos
                    ? 'text-text-tertiary border-white/5'
                    : 'hover:border-accent/40 hover:text-text border-white/10 bg-white/5',
                )}
              >
                <i className="i-mingcute-arrow-left-line" aria-hidden="true" />
                上一页
              </button>
              <button
                type="button"
                onClick={() =>
                  setPage((prev) => Math.min(totalPages, prev + 1))
                }
                disabled={page >= totalPages || isFetchingPhotos}
                className={clsx(
                  'inline-flex items-center gap-1 rounded-full border px-4 py-1 transition-colors duration-200',
                  page >= totalPages || isFetchingPhotos
                    ? 'text-text-tertiary border-white/5'
                    : 'hover:border-accent/40 hover:text-text border-white/10 bg-white/5',
                )}
              >
                下一页
                <i className="i-mingcute-arrow-right-line" aria-hidden="true" />
              </button>
            </div>
            {isFetchingPhotos ? (
              <span className="inline-flex items-center gap-2 text-xs">
                <i
                  className="i-mingcute-loading-line animate-spin"
                  aria-hidden="true"
                />{' '}
                正在加载最新数据…
              </span>
            ) : filteredPhotos.length > 0 ? (
              <span className="text-text-tertiary text-xs">
                显示第 {(page - 1) * PAGE_SIZE + 1} 至{' '}
                {(page - 1) * PAGE_SIZE + filteredPhotos.length} 项
              </span>
            ) : (
              <span className="text-text-tertiary text-xs">暂无数据</span>
            )}
          </div>
        </div>

        <div className="bg-material-thin/70 relative flex flex-col overflow-hidden rounded-3xl border border-white/10 shadow-[0_32px_90px_-60px_rgba(15,23,42,0.62)] backdrop-blur-2xl">
          <div
            className="pointer-events-none absolute inset-0 -z-10 opacity-70"
            style={ACCENT_GRADIENT_STYLE}
          />
          <header className="flex items-center justify-between border-b border-white/5 px-6 py-4">
            <div>
              <h2 className="text-text text-lg font-medium">Manifest 详情</h2>
              <p className="text-text-secondary text-xs">
                展示所选照片的元数据与 EXIF 信息。
              </p>
            </div>
            {selectedPhoto ? (
              <button
                type="button"
                onClick={() => setSelectedPhotoId(null)}
                className="text-text-secondary hover:border-accent/40 hover:text-text rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs transition-colors duration-200"
              >
                取消选中
              </button>
            ) : null}
          </header>
          <ScrollArea orientation="vertical" rootClassName="h-[28rem]">
            <div className="space-y-6 px-6 py-5">
              {selectedPhoto ? (
                <>
                  <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
                    <LazyImage
                      src={selectedPhoto.thumbnailUrl}
                      alt={selectedPhoto.title}
                      className="aspect-[3/2] w-full object-cover"
                    />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-text text-base font-medium">
                      {selectedPhoto.title}
                    </h3>
                    <p className="text-text-secondary text-sm">
                      {selectedPhoto.description || '暂无描述。'}
                    </p>
                    <div className="text-text-tertiary flex flex-wrap gap-2 text-xs">
                      <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5">
                        拍摄于{' '}
                        {formatDateTime(selectedPhoto.dateTaken, {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                      </span>
                      <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5">
                        {formatBytes(selectedPhoto.size)}
                      </span>
                      {selectedPhoto.isLivePhoto ? (
                        <span className="border-accent/40 bg-accent/15 text-accent rounded-full border px-2 py-0.5">
                          Live Photo
                        </span>
                      ) : null}
                      {selectedPhoto.isHdr ? (
                        <span className="border-purple/40 bg-purple/15 rounded-full border px-2 py-0.5 text-purple-300">
                          HDR
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <DetailSection title="基础信息">
                    <DetailItem
                      label="存储 Key"
                      value={selectedPhoto.storageKey}
                      copyable
                    />
                    <DetailItem
                      label="原图链接"
                      value={selectedPhoto.originalUrl}
                      copyable
                      isExternalLink
                    />
                    <DetailItem
                      label="缩略图链接"
                      value={selectedPhoto.thumbnailUrl}
                      copyable
                      isExternalLink
                    />
                    <DetailItem
                      label="同步时间"
                      value={formatDateTime(selectedPhoto.syncedAt)}
                    />
                    <DetailItem
                      label="最后更新"
                      value={formatDateTime(selectedPhoto.updatedAt)}
                    />
                  </DetailSection>

                  <DetailSection title="画面信息">
                    <DetailItem
                      label="分辨率"
                      value={`${selectedPhoto.width} × ${selectedPhoto.height}`}
                    />
                    <DetailItem
                      label="宽高比"
                      value={selectedPhoto.aspectRatio.toFixed(2)}
                    />
                    <DetailItem
                      label="相机"
                      value={deriveCameraName(selectedPhoto.manifest) ?? '—'}
                    />
                    <DetailItem
                      label="镜头"
                      value={deriveLensName(selectedPhoto.manifest) ?? '—'}
                    />
                    <DetailItem
                      label="标签"
                      value={
                        selectedPhoto.tags.length > 0
                          ? selectedPhoto.tags.join('、')
                          : '暂无标签'
                      }
                    />
                  </DetailSection>

                  <DetailSection title="EXIF 元数据">
                    {selectedPhoto.exif ? (
                      <div className="text-text-secondary space-y-1 text-xs">
                        {Object.entries(selectedPhoto.exif).map(
                          ([key, value]) => (
                            <div
                              key={key}
                              className="flex justify-between gap-4 rounded-lg border border-white/5 bg-white/5 px-3 py-2"
                            >
                              <span className="text-text font-medium">
                                {key}
                              </span>
                              <span className="text-text-secondary max-w-[60%] text-right">
                                {typeof value === 'string'
                                  ? value
                                  : JSON.stringify(value)}
                              </span>
                            </div>
                          ),
                        )}
                      </div>
                    ) : (
                      <p className="text-text-tertiary text-xs">
                        暂无 EXIF 信息。
                      </p>
                    )}
                  </DetailSection>

                  <DetailSection title="Tone 分析">
                    {selectedPhoto.toneAnalysis ? (
                      <div className="text-text-secondary grid grid-cols-2 gap-3 text-xs">
                        {Object.entries(selectedPhoto.toneAnalysis).map(
                          ([key, value]) => (
                            <div
                              key={key}
                              className="rounded-lg border border-white/5 bg-white/5 px-3 py-2"
                            >
                              <div className="text-text capitalize">{key}</div>
                              <div className="text-text-secondary text-sm">
                                {typeof value === 'number'
                                  ? value.toFixed(2)
                                  : value}
                              </div>
                            </div>
                          ),
                        )}
                      </div>
                    ) : (
                      <p className="text-text-tertiary text-xs">
                        暂无 tone 分析数据。
                      </p>
                    )}
                  </DetailSection>
                </>
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                  <i
                    className="i-mingcute-focus-line text-text-tertiary text-3xl"
                    aria-hidden="true"
                  />
                  <p className="text-text-secondary text-sm">
                    选择左侧照片以查看 manifest 详情。
                  </p>
                  <p className="text-text-tertiary max-w-xs text-xs">
                    您也可以点击上方的同步按钮以刷新最新数据，随后选择任意照片进行深入分析。
                  </p>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </section>
    </div>
  )
}

type ChipProps = {
  label: string
  hint?: string
  active?: boolean
  onClick?: () => void
}

const Chip = ({ label, hint, active, onClick }: ChipProps) => (
  <button
    type="button"
    onClick={onClick}
    className={clsx(
      'flex flex-col items-start gap-0.5 rounded-2xl border px-3 py-2 text-left transition-colors duration-200',
      active
        ? 'border-accent/50 bg-accent/15 text-accent shadow-[0_10px_30px_-15px_rgba(56,189,248,0.8)]'
        : 'text-text-secondary hover:border-accent/40 hover:text-text border-white/10 bg-white/5',
    )}
  >
    <span className="text-sm font-medium">{label}</span>
    {hint ? (
      <span className="text-text-tertiary text-[11px]">{hint}</span>
    ) : null}
  </button>
)

type PhotoCardProps = {
  photo: PhotoRecord
  active?: boolean
  onSelect?: () => void
}

const PhotoCard = ({ photo, active, onSelect }: PhotoCardProps) => (
  <button
    type="button"
    onClick={onSelect}
    className={clsx(
      'group relative flex flex-col overflow-hidden rounded-3xl border p-3 text-left transition-all duration-200',
      active
        ? 'border-accent/60 bg-accent/10 shadow-[0_20px_60px_-30px_rgba(56,189,248,0.9)]'
        : 'hover:border-accent/40 hover:bg-accent/10 border-white/10 bg-white/5',
    )}
  >
    <div className="relative overflow-hidden rounded-2xl">
      <LazyImage
        src={photo.thumbnailUrl}
        alt={photo.title}
        className="aspect-[3/2] w-full rounded-2xl object-cover transition-transform duration-500 group-hover:scale-[1.02]"
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/50 via-black/10 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 p-3 text-left text-xs text-white opacity-0 transition-opacity duration-300 group-hover:opacity-100">
        <div className="line-clamp-1 font-medium">{photo.title}</div>
        <div className="line-clamp-1 text-white/80">
          {formatDateTime(photo.dateTaken, { dateStyle: 'medium' })}
        </div>
      </div>
    </div>
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <span className="text-text-tertiary rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px]">
        {formatBytes(photo.size)}
      </span>
      {photo.isLivePhoto ? (
        <span className="border-accent/40 bg-accent/15 text-accent rounded-full border px-2 py-0.5 text-[11px]">
          Live
        </span>
      ) : null}
      {photo.isHdr ? (
        <span className="border-purple/40 bg-purple/15 rounded-full border px-2 py-0.5 text-[11px] text-purple-300">
          HDR
        </span>
      ) : null}
      <span className="text-text-tertiary rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px]">
        {photo.width}×{photo.height}
      </span>
    </div>
  </button>
)

type StatBlockProps = {
  label: string
  value: string
  loading?: boolean
}

const StatBlock = ({ label, value, loading }: StatBlockProps) => (
  <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-5">
    <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent" />
    <div className="text-text-tertiary text-xs">{label}</div>
    <div className="text-text mt-2 text-2xl font-semibold">
      {loading ? (
        <span className="text-text-secondary inline-flex items-center gap-2 text-sm">
          <i
            className="i-mingcute-loading-line animate-spin"
            aria-hidden="true"
          />{' '}
          加载中…
        </span>
      ) : (
        value
      )}
    </div>
  </div>
)

type DetailSectionProps = {
  title: string
  children: ReactNode
}

const DetailSection = ({ title, children }: DetailSectionProps) => (
  <section className="space-y-3">
    <h3 className="text-text text-sm font-medium">{title}</h3>
    <div className="space-y-2">{children}</div>
  </section>
)

type DetailItemProps = {
  label: string
  value: string
  copyable?: boolean
  isExternalLink?: boolean
}

const DetailItem = ({
  label,
  value,
  copyable,
  isExternalLink,
}: DetailItemProps) => {
  const handleCopy = async () => {
    if (
      !copyable ||
      !value ||
      typeof navigator === 'undefined' ||
      !navigator.clipboard
    ) {
      return
    }
    try {
      await navigator.clipboard.writeText(value)
      toast.success('已复制到剪贴板')
    } catch (error) {
      console.error(error)
      toast.error('复制失败')
    }
  }

  const content = isExternalLink ? (
    <a
      href={value}
      target="_blank"
      rel="noreferrer"
      className="text-accent truncate text-xs underline-offset-2 hover:underline"
    >
      {value}
    </a>
  ) : (
    <span className="text-text-secondary truncate text-xs">{value || '—'}</span>
  )

  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-white/5 bg-white/5 px-4 py-2">
      <span className="text-text text-xs font-medium">{label}</span>
      <div className="flex flex-1 items-center justify-end gap-2 overflow-hidden">
        <div className="max-w-[75%] truncate">{content}</div>
        {copyable ? (
          <button
            type="button"
            onClick={handleCopy}
            className="text-text-tertiary hover:border-accent/40 hover:text-text inline-flex items-center justify-center rounded-full border border-white/10 bg-white/5 p-1 transition-colors duration-200"
          >
            <i className="i-mingcute-copy-2-line text-sm" aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </div>
  )
}

export default Component
