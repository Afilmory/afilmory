import { Button, Modal } from '@afilmory/ui'
import { clsxm } from '@afilmory/utils'
import { DynamicIcon } from 'lucide-react/dynamic'
import type { ChangeEventHandler } from 'react'
import { useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useShallow } from 'zustand/shallow'

import { usePhotoLibraryStore } from './PhotoLibraryProvider'
import { PhotoTagEditorModal } from './PhotoTagEditorModal'
import { PhotoUploadConfirmModal } from './PhotoUploadConfirmModal'

const photoLibraryActionKeys = {
  upload: 'photos.library.actions.upload',
  uploadShort: 'photos.library.actions.upload-short',
  selectedCount: 'photos.library.actions.selected-count',
  editTags: 'photos.library.actions.edit-tags',
  delete: 'photos.library.actions.delete',
  clear: 'photos.library.actions.clear-selection',
  selectAll: 'photos.library.actions.select-all',
  allSelected: 'photos.library.actions.all-selected',
} as const satisfies Record<string, I18nKeys>

const emptyArray = []
export function PhotoLibraryActionBar() {
  const { t } = useTranslation()
  const {
    selectionCount,
    totalCount,
    isUploading,
    isDeleting,
    availableTags,
    uploadAssets,
    deleteSelected,
    clearSelection,
    selectAll,
    selectedIds,
    assets,
  } = usePhotoLibraryStore(
    useShallow((state) => ({
      selectionCount: state.selectedIds.length,
      totalCount: state.libraryTotalCount,
      isUploading: state.isUploading,
      isDeleting: state.isDeleting,
      availableTags: state.availableTags,
      uploadAssets: state.uploadAssets,
      deleteSelected: state.deleteSelected,
      clearSelection: state.clearSelection,
      selectAll: state.selectAll,
      selectedIds: state.selectedIds,
      assets: state.assets ?? emptyArray,
    })),
  )
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const hasSelection = selectionCount > 0
  const hasAssets = totalCount > 0
  const canSelectAll = hasAssets && selectionCount < totalCount
  const selectAllLabel = hasAssets
    ? canSelectAll
      ? t(photoLibraryActionKeys.selectAll)
      : t(photoLibraryActionKeys.allSelected)
    : t(photoLibraryActionKeys.selectAll)
  const selectedAssets = useMemo(() => {
    if (!assets || assets.length === 0 || selectedIds.length === 0) {
      return emptyArray
    }
    const idSet = new Set(selectedIds)
    return assets.filter((asset) => idSet.has(asset.id))
  }, [assets, selectedIds])

  const handleUploadClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange: ChangeEventHandler<HTMLInputElement> = (event) => {
    const { files } = event.currentTarget
    if (!files || files.length === 0) return

    const selectedFiles = Array.from(files)

    Modal.present(
      PhotoUploadConfirmModal,
      {
        files: selectedFiles,
        availableTags,
        onUpload: uploadAssets,
      },
      {
        dismissOnOutsideClick: false,
      },
    )

    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleEditSelectedTags = () => {
    if (selectedAssets.length === 0) {
      return
    }
    Modal.present(PhotoTagEditorModal, {
      assets: selectedAssets,
      availableTags,
    })
  }

  return (
    <div className="flex w-full relative flex-col gap-2 sm:gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2 sm:gap-3">
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
          className="flex items-center gap-1 text-xs sm:text-sm"
        >
          <span className="hidden sm:inline">{t(photoLibraryActionKeys.upload)}</span>
          <span className="sm:hidden">{t(photoLibraryActionKeys.uploadShort)}</span>
        </Button>
      </div>

      <div className="flex min-h-10 absolute right-0 translate-y-25 lg:translate-y-16 items-center justify-end gap-1.5 sm:gap-2 lg:flex-wrap w-full flex-nowrap">
        <div
          className={clsxm(
            'flex items-center gap-2 transition-opacity duration-200',
            hasSelection ? 'opacity-100' : 'pointer-events-none opacity-0',
          )}
        >
          <span
            className={clsxm(
              'inline-flex items-center shape-squircle whitespace-nowrap px-2.5 py-1 text-xs font-medium',
              'bg-accent/10 text-accent',
            )}
          >
            {t(photoLibraryActionKeys.selectedCount, { count: selectionCount })}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={selectedAssets.length === 0}
            onClick={handleEditSelectedTags}
            className="flex items-center gap-1 text-text-secondary hover:text-text"
          >
            <DynamicIcon name="tags" className="h-3.5 w-3.5" />
            {t(photoLibraryActionKeys.editTags)}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={isDeleting}
            onClick={deleteSelected}
            className="flex items-center gap-1 text-rose-400 hover:text-rose-300"
          >
            <DynamicIcon name="trash-2" className="h-3.5 w-3.5" />
            {t(photoLibraryActionKeys.delete)}
          </Button>
          <Button type="button" className="gap-1" variant="ghost" size="sm" onClick={clearSelection}>
            <DynamicIcon name="x" className="h-3.5 w-3.5" />
            {t(photoLibraryActionKeys.clear)}
          </Button>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={!canSelectAll}
          onClick={selectAll}
          className="flex items-center gap-1 text-text-secondary hover:text-text"
        >
          <DynamicIcon name={canSelectAll ? 'square' : 'check-square'} className="size-4" />
          {selectAllLabel}
        </Button>
      </div>
    </div>
  )
}
