import type { ModalComponent } from '@afilmory/ui'

import { PhotoUploadSteps } from './photo-upload/steps'
import { PhotoUploadStoreProvider } from './photo-upload/store'
import type { PhotoUploadRequestOptions } from './upload.types'

type PhotoUploadConfirmModalProps = {
  files: File[]
  availableTags: string[]
  onUpload: (files: FileList, options: PhotoUploadRequestOptions) => void | Promise<void>
}

export const PhotoUploadConfirmModal: ModalComponent<PhotoUploadConfirmModalProps> = ({
  files,
  availableTags,
  onUpload,
  dismiss,
}) => {
  return (
    <PhotoUploadStoreProvider files={files} availableTags={availableTags} onUpload={onUpload} onClose={dismiss}>
      <div className="flex max-h-[80vh] w-full flex-col gap-5 min-w-0">
        <PhotoUploadSteps />
      </div>
    </PhotoUploadStoreProvider>
  )
}

PhotoUploadConfirmModal.contentClassName = 'w-[min(520px,92vw)]'
