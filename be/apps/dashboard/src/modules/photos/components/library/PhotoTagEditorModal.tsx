import type { ModalComponent } from '@afilmory/ui'
import { Button, LinearDivider } from '@afilmory/ui'
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@afilmory/ui/modal/Dialog.jsx'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { getRequestErrorMessage } from '~/lib/errors'

import { useUpdatePhotoTagsMutation } from '../../hooks'
import type { PhotoAssetListItem } from '../../types'
import { AutoSelect } from './photo-upload/AutoSelect'

const photoTagsKeys = {
  modalTitle: 'photos.library.tags.modal.title',
  modalDescriptionMultiple: 'photos.library.tags.modal.description.multiple',
  modalDescriptionSingle: 'photos.library.tags.modal.description.single',
  pathSample: 'photos.library.tags.modal.path.sample',
  pathPreview: 'photos.library.tags.modal.path.preview',
  pathHint: 'photos.library.tags.modal.path.hint',
  inputPlaceholder: 'photos.library.tags.modal.input',
  toastSuccessMulti: 'photos.library.tags.toast.multi-success',
  toastSuccessSingle: 'photos.library.tags.toast.single-success',
  toastSuccessDescription: 'photos.library.tags.toast.success-description',
  toastErrorTitle: 'photos.library.tags.toast.error',
  toastErrorDescription: 'photos.library.tags.toast.error-description',
  cancel: 'photos.library.tags.modal.cancel',
  save: 'photos.library.tags.modal.save',
  saving: 'photos.library.tags.modal.saving',
  noSelection: 'photos.library.tags.modal.no-selection',
  assetCount: 'photos.library.tags.modal.asset-count',
} as const satisfies Record<
  | 'modalTitle'
  | 'modalDescriptionMultiple'
  | 'modalDescriptionSingle'
  | 'pathSample'
  | 'pathPreview'
  | 'pathHint'
  | 'inputPlaceholder'
  | 'toastSuccessMulti'
  | 'toastSuccessSingle'
  | 'toastSuccessDescription'
  | 'toastErrorTitle'
  | 'toastErrorDescription'
  | 'cancel'
  | 'save'
  | 'saving'
  | 'noSelection'
  | 'assetCount',
  I18nKeys
>

type PhotoTagEditorModalProps = {
  assets: PhotoAssetListItem[]
  availableTags: string[]
}

const arraysEqual = (a: string[], b: string[]): boolean =>
  a.length === b.length && a.every((value, index) => value === b[index])

export const PhotoTagEditorModal: ModalComponent<PhotoTagEditorModalProps> = ({ assets, availableTags, dismiss }) => {
  const { t } = useTranslation()
  const updateTagsMutation = useUpdatePhotoTagsMutation()
  const [isSaving, setIsSaving] = useState(false)
  const initialTags = useMemo(() => {
    if (assets.length === 0) {
      return []
    }
    if (assets.length === 1) {
      return assets[0].manifest?.data?.tags ?? []
    }
    const firstTags = assets[0].manifest?.data?.tags ?? []
    return firstTags.filter((tag) => assets.every((asset) => (asset.manifest?.data?.tags ?? []).includes(tag)))
  }, [assets])
  const [tags, setTags] = useState<string[]>(initialTags)
  useEffect(() => {
    setTags(initialTags)
  }, [initialTags])

  const isMultiEdit = assets.length > 1
  const tagOptions = useMemo(
    () => availableTags.map((tag) => ({ label: tag, value: tag.toLowerCase() })),
    [availableTags],
  )
  const fileName = useMemo(() => {
    const first = assets[0]
    if (!first) return ''
    const parts = first.storageKey.split('/')
    return parts.at(-1) ?? first.photoId
  }, [assets])
  const nextPathPreview = useMemo(() => {
    if (!fileName) {
      return null
    }
    if (tags.length === 0) {
      return fileName
    }
    return `${tags.join('/')} / ${fileName}`
  }, [fileName, tags])

  const hasChanges = useMemo(() => !arraysEqual(tags, initialTags), [tags, initialTags])
  const isBusy = isSaving || updateTagsMutation.isPending

  const assetTitle = useMemo(() => {
    if (assets.length === 0) return t(photoTagsKeys.noSelection)
    if (!isMultiEdit) {
      const single = assets[0]
      return single.manifest?.data?.title ?? single.photoId
    }
    return t(photoTagsKeys.assetCount, { count: assets.length })
  }, [assets, isMultiEdit])

  const handleSave = async () => {
    if (assets.length === 0) {
      dismiss?.()
      return
    }
    setIsSaving(true)
    try {
      for (const asset of assets) {
        await updateTagsMutation.mutateAsync({ id: asset.id, tags })
      }
      toast.success(
        isMultiEdit
          ? t(photoTagsKeys.toastSuccessMulti, { count: assets.length })
          : t(photoTagsKeys.toastSuccessSingle),
        {
          description: t(photoTagsKeys.toastSuccessDescription),
        },
      )
      dismiss?.()
    } catch (error) {
      toast.error(t(photoTagsKeys.toastErrorTitle), {
        description: getRequestErrorMessage(error, t(photoTagsKeys.toastErrorDescription)),
      })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <DialogHeader>
        <DialogTitle>{t(photoTagsKeys.modalTitle, { name: assetTitle })}</DialogTitle>
        <DialogDescription>
          {isMultiEdit ? t(photoTagsKeys.modalDescriptionMultiple) : t(photoTagsKeys.modalDescriptionSingle)}
        </DialogDescription>
      </DialogHeader>

      {nextPathPreview ? (
        <div className="space-y-2 rounded-md border border-border/60 bg-background/60 p-3 text-xs text-text-tertiary">
          <div className="flex items-center justify-between text-[11px] font-medium text-text">
            <span>{isMultiEdit ? t(photoTagsKeys.pathSample) : t(photoTagsKeys.pathPreview)}</span>
            <span className="text-text-secondary">{t(photoTagsKeys.pathHint)}</span>
          </div>
          <p className="text-text rounded bg-background-secondary/60 px-2 py-1 font-mono text-xs">{nextPathPreview}</p>
        </div>
      ) : null}

      <AutoSelect
        options={tagOptions}
        value={tags}
        onChange={setTags}
        placeholder={t(photoTagsKeys.inputPlaceholder)}
        disabled={isBusy}
      />

      <LinearDivider />

      <DialogFooter>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={dismiss}
          className="text-text-secondary hover:text-text"
        >
          {t(photoTagsKeys.cancel)}
        </Button>
        <Button
          type="button"
          variant="primary"
          size="sm"
          disabled={!hasChanges || isBusy}
          onClick={() => void handleSave()}
        >
          {isBusy ? t(photoTagsKeys.saving) : t(photoTagsKeys.save)}
        </Button>
      </DialogFooter>
    </div>
  )
}

PhotoTagEditorModal.contentClassName = 'w-[min(520px,92vw)]'
