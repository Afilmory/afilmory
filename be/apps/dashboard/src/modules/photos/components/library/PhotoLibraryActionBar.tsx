import { Button, Modal } from '@afilmory/ui'
import { clsxm } from '@afilmory/utils'
import { DynamicIcon } from 'lucide-react/dynamic'
import type { ChangeEventHandler } from 'react'
import { useRef } from 'react'

import { PhotoUploadConfirmModal } from './PhotoUploadConfirmModal'

type PhotoLibraryActionBarProps = {
  selectionCount: number
  isUploading: boolean
  isDeleting: boolean
  onUpload: (files: FileList) => void | Promise<void>
  onDeleteSelected: () => void
  onClearSelection: () => void
}

export function PhotoLibraryActionBar({
  selectionCount,
  isUploading,
  isDeleting,
  onUpload,
  onDeleteSelected,
  onClearSelection,
}: PhotoLibraryActionBarProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const handleUploadClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange: ChangeEventHandler<HTMLInputElement> = (event) => {
    const { files } = event.currentTarget
    if (!files || files.length === 0) return

    const selectedFiles = Array.from(files)

    Modal.present(PhotoUploadConfirmModal, {
      files: selectedFiles,
      onConfirm: (confirmedFiles) => {
        void onUpload(confirmedFiles)
      },
    })

    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  return (
    <div className="flex items-center gap-3">
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        multiple
        accept="image/*,.heic,.HEIC,.heif,.HEIF,.hif,.HIF,.mov,.MOV"
        onChange={handleFileChange}
      />
      <Button
        type="button"
        variant="primary"
        size="sm"
        disabled={isUploading}
        onClick={handleUploadClick}
        className="flex items-center gap-1"
      >
        <DynamicIcon name="upload" className="h-3.5 w-3.5" />
        上传文件
      </Button>

      {selectionCount > 0 ? (
        <div className="flex items-center gap-2">
          <span
            className={clsxm(
              'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium',
              'bg-accent/10 text-accent',
            )}
          >
            已选 {selectionCount} 项
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={isDeleting}
            onClick={onDeleteSelected}
            className="flex items-center gap-1 text-rose-400 hover:text-rose-300"
          >
            <DynamicIcon name="trash-2" className="h-3.5 w-3.5" />
            删除
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onClearSelection}>
            <DynamicIcon name="x" className="h-3.5 w-3.5" />
            清除选择
          </Button>
        </div>
      ) : null}
    </div>
  )
}
