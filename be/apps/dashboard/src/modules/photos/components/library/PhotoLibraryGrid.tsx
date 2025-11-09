import { Button, Prompt, Thumbhash } from '@afilmory/ui'
import { clsxm } from '@afilmory/utils'
import { DynamicIcon } from 'lucide-react/dynamic'

import type { PhotoAssetListItem } from '../../types'
import { Masonry } from './Masonry'

type PhotoLibraryGridProps = {
  assets: PhotoAssetListItem[] | undefined
  isLoading: boolean
  selectedIds: Set<string>
  onToggleSelect: (id: string) => void
  onOpenAsset: (asset: PhotoAssetListItem) => void
  onDeleteAsset: (asset: PhotoAssetListItem) => Promise<void> | void
  isDeleting?: boolean
}

function PhotoGridItem({
  asset,
  isSelected,
  onToggleSelect,
  onOpenAsset,
  onDeleteAsset,
  isDeleting,
}: {
  asset: PhotoAssetListItem
  isSelected: boolean
  onToggleSelect: (id: string) => void
  onOpenAsset: (asset: PhotoAssetListItem) => void
  onDeleteAsset: (asset: PhotoAssetListItem) => Promise<void> | void
  isDeleting?: boolean
}) {
  const manifest = asset.manifest?.data
  const previewUrl = manifest?.thumbnailUrl ?? manifest?.originalUrl ?? asset.publicUrl
  const deviceLabel = manifest?.exif?.Model || manifest?.exif?.Make || '未知设备'
  const updatedAtLabel = new Date(asset.updatedAt).toLocaleString()
  const fileSizeLabel =
    asset.size !== null && asset.size !== undefined
      ? `${(asset.size / (1024 * 1024)).toFixed(2)} MB`
      : manifest?.size
        ? `${(manifest.size / (1024 * 1024)).toFixed(2)} MB`
        : '未知大小'
  const assetLabel = manifest?.title ?? manifest?.id ?? asset.photoId

  const handleDelete = () => {
    Prompt.prompt({
      title: '确认删除该资源？',
      description: `删除后将无法恢复，是否继续删除「${assetLabel}」？`,
      variant: 'danger',
      onConfirmText: '删除',
      onCancelText: '取消',
      onConfirm: () => Promise.resolve(onDeleteAsset(asset)),
    })
  }

  return (
    <div
      className={clsxm(
        'relative group overflow-hidden rounded-xl border border-border/10 bg-background-secondary/40 shadow-sm transition-all duration-200',
        isSelected && 'ring-2 ring-accent/80',
      )}
    >
      {previewUrl ? (
        <div
          className="relative w-full"
          style={manifest?.aspectRatio ? { aspectRatio: manifest.aspectRatio } : undefined}
        >
          {manifest?.thumbHash && <Thumbhash thumbHash={manifest.thumbHash} className="absolute inset-0" />}
          <img
            src={previewUrl}
            alt={manifest?.id ?? asset.photoId}
            className="absolute inset-0 h-full w-full object-cover"
            loading="lazy"
            onError={(e) => {
              e.currentTarget.style.display = 'none'
            }}
          />
        </div>
      ) : (
        <div
          className="relative w-full"
          style={manifest?.aspectRatio ? { aspectRatio: manifest.aspectRatio } : undefined}
        >
          {manifest?.thumbHash ? (
            <Thumbhash thumbHash={manifest.thumbHash} className="absolute inset-0" />
          ) : (
            <div className="bg-background-secondary/80 text-text-tertiary flex h-48 w-full items-center justify-center">
              无法预览
            </div>
          )}
        </div>
      )}

      <div className="bg-background/5 absolute inset-0 flex flex-col justify-between opacity-0 backdrop-blur-sm transition-opacity duration-200 group-hover:opacity-100">
        <div className="flex items-start justify-between p-3 text-xs text-white">
          <div className="max-w-[70%] truncate font-medium">{manifest?.title ?? manifest?.id ?? asset.photoId}</div>
          <button
            type="button"
            className={clsxm(
              'inline-flex items-center rounded-full border border-white/30 bg-black/40 px-2 py-1 text-[10px] uppercase tracking-wide text-white transition-colors',
              isSelected ? 'bg-accent text-white' : 'hover:bg-white/10',
            )}
            onClick={() => onToggleSelect(asset.id)}
          >
            <DynamicIcon name={isSelected ? 'check' : 'square'} className="mr-1 h-3 w-3" />
            <span>{isSelected ? '已选择' : '选择'}</span>
          </button>
        </div>

        <div className="flex items-center justify-between gap-2 p-3">
          <div className="flex flex-col text-[10px] text-white/80">
            <span>{deviceLabel}</span>
            <span>{updatedAtLabel}</span>
            <span>{fileSizeLabel}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="bg-black/40 text-white hover:bg-black/60"
              onClick={() => onOpenAsset(asset)}
            >
              <DynamicIcon name="external-link" className="mr-1 h-3.5 w-3.5" />
              <span>查看</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="bg-rose-500/20 text-rose-50 hover:bg-rose-500/30"
              disabled={isDeleting}
              onClick={handleDelete}
            >
              <DynamicIcon name="trash-2" className="mr-1 h-3.5 w-3.5" />
              <span>删除</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

export function PhotoLibraryGrid({
  assets,
  isLoading,
  selectedIds,
  onToggleSelect,
  onOpenAsset,
  onDeleteAsset,
  isDeleting,
}: PhotoLibraryGridProps) {
  if (isLoading) {
    const skeletonKeys = [
      'photo-skeleton-1',
      'photo-skeleton-2',
      'photo-skeleton-3',
      'photo-skeleton-4',
      'photo-skeleton-5',
      'photo-skeleton-6',
    ]
    return (
      <div className="columns-1 gap-4 sm:columns-2 lg:columns-3">
        {skeletonKeys.map((key) => (
          <div key={key} className="mb-4 break-inside-avoid">
            <div className="bg-fill/30 h-48 w-full animate-pulse rounded-xl" />
          </div>
        ))}
      </div>
    )
  }

  if (!assets || assets.length === 0) {
    return (
      <div className="bg-background-tertiary relative overflow-hidden rounded-xl p-8 text-center">
        <p className="text-text text-base font-semibold">当前没有图片资源</p>
        <p className="text-text-tertiary mt-2 text-sm">使用右上角的“上传图片”按钮可以为图库添加新的照片。</p>
      </div>
    )
  }

  return (
    <div className="mx-[calc(calc((3rem+100vw)-(var(--container-7xl)))*-1/2)] p-2">
      <Masonry
        items={assets}
        columnGutter={8}
        columnWidth={320}
        itemKey={(asset) => asset.id}
        render={({ data }) => (
          <PhotoGridItem
            asset={data}
            isSelected={selectedIds.has(data.id)}
            onToggleSelect={onToggleSelect}
            onOpenAsset={onOpenAsset}
            onDeleteAsset={onDeleteAsset}
            isDeleting={isDeleting}
          />
        )}
      />
    </div>
  )
}
