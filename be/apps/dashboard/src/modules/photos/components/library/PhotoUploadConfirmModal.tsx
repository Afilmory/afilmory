import type { ModalComponent } from '@afilmory/ui'
import { Button, LinearDivider } from '@afilmory/ui'
import { clsxm, Spring } from '@afilmory/utils'
import { m } from 'motion/react'
import { useMemo } from 'react'

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '未知大小'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const size = bytes / 1024 ** exponent
  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[exponent]}`
}

const IMAGE_EXTENSIONS = new Set([
  'jpg',
  'jpeg',
  'png',
  'gif',
  'webp',
  'bmp',
  'tiff',
  'tif',
  'heic',
  'heif',
  'hif',
  'avif',
  'raw',
  'dng',
])

function getFileExtension(name: string) {
  const normalized = name.toLowerCase()
  const lastDotIndex = normalized.lastIndexOf('.')
  return lastDotIndex === -1 ? '' : normalized.slice(lastDotIndex + 1)
}

function getBaseName(name: string) {
  const normalized = name.toLowerCase()
  const lastDotIndex = normalized.lastIndexOf('.')
  return lastDotIndex === -1 ? normalized : normalized.slice(0, lastDotIndex)
}

const isMovFile = (name: string) => name.toLowerCase().endsWith('.mov')

type PhotoUploadConfirmModalProps = {
  files: File[]
  onConfirm: (files: FileList) => void | Promise<void>
}

export const PhotoUploadConfirmModal: ModalComponent<PhotoUploadConfirmModalProps> = ({
  files,
  onConfirm,
  dismiss,
}) => {
  const fileItems = useMemo(() => files, [files])
  const totalSize = useMemo(() => fileItems.reduce((sum, file) => sum + file.size, 0), [fileItems])

  const imageBaseNames = useMemo(() => {
    return new Set(
      fileItems
        .filter((file) => IMAGE_EXTENSIONS.has(getFileExtension(file.name)))
        .map((file) => getBaseName(file.name)),
    )
  }, [fileItems])

  const unmatchedMovFiles = useMemo(() => {
    return fileItems.filter((file) => {
      if (!isMovFile(file.name)) return false
      return !imageBaseNames.has(getBaseName(file.name))
    })
  }, [fileItems, imageBaseNames])

  const hasUnmatchedMov = unmatchedMovFiles.length > 0
  const hasMovFile = useMemo(() => fileItems.some((file) => isMovFile(file.name)), [fileItems])

  const createFileList = (fileArray: File[]): FileList => {
    if (typeof DataTransfer !== 'undefined') {
      const transfer = new DataTransfer()
      fileArray.forEach((file) => transfer.items.add(file))
      return transfer.files
    }

    const fallback: Record<number, File> & { length: number; item: (index: number) => File | null } = {
      length: fileArray.length,
      item: (index: number) => fileArray[index] ?? null,
    }

    fileArray.forEach((file, index) => {
      fallback[index] = file
    })

    return fallback as unknown as FileList
  }

  const handleConfirm = () => {
    if (hasUnmatchedMov) return
    const fileList = createFileList(fileItems)
    void onConfirm(fileList)
    dismiss()
  }

  return (
    <div className="flex max-h-[80vh] w-full flex-col gap-5">
      <div className="space-y-2">
        <h2 className="text-text text-lg font-semibold">确认上传这些文件？</h2>
        <p className="text-text-tertiary text-sm">
          共选择 {fileItems.length} 项，预计占用 {formatBytes(totalSize)}。确认后将立即开始上传。
        </p>
        {hasUnmatchedMov ? (
          <div className="rounded-lg border border-rose-400/40 bg-rose-500/5 px-3 py-2 text-xs text-rose-300">
            <p>以下 MOV 文件缺少同名的图像文件，请补齐后再尝试上传：</p>
            <ul className="mt-1 space-y-1">
              {unmatchedMovFiles.map((file) => (
                <li key={`${file.name}-${file.lastModified}`}>{file.name}</li>
              ))}
            </ul>
          </div>
        ) : (
          hasMovFile && (
            <p className="text-text-tertiary text-xs">已检测到 MOV 文件，将与同名图片一起作为 Live Photo 处理。</p>
          )
        )}
      </div>

      <LinearDivider />

      <div className="overflow-hidden">
        <div className="border-fill-tertiary/40 bg-background/30 rounded-lg border">
          <m.ul
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={Spring.presets.smooth}
            className="divide-fill-tertiary/40 max-h-60 divide-y overflow-auto"
          >
            {fileItems.map((file) => {
              const isUnmatchedMov = unmatchedMovFiles.includes(file)
              return (
                <li
                  key={`${file.name}-${file.lastModified}`}
                  className={clsxm(
                    'text-text-secondary flex items-center justify-between gap-3 px-4 py-2 text-sm',
                    isUnmatchedMov && 'text-rose-300',
                  )}
                >
                  <span className="truncate" title={file.name}>
                    {file.name}
                  </span>
                  <div className="flex shrink-0 items-center gap-3">
                    {isUnmatchedMov ? <span className="text-[11px]">缺少同名图片</span> : null}
                    <span className="text-text-tertiary text-xs">{formatBytes(file.size)}</span>
                  </div>
                </li>
              )
            })}
          </m.ul>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={dismiss}
          className="text-text-secondary hover:text-text"
        >
          取消
        </Button>
        <Button type="button" variant="primary" size="sm" onClick={handleConfirm} disabled={hasUnmatchedMov}>
          确认上传
        </Button>
      </div>
    </div>
  )
}

PhotoUploadConfirmModal.contentClassName = 'w-[min(420px,90vw)] p-6'
