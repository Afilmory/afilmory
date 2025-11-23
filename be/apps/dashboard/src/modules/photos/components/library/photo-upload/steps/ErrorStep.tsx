import { Button } from '@afilmory/ui'
import { useShallow } from 'zustand/shallow'

import { LinearBorderPanel } from '~/components/common/LinearBorderPanel'

import { ProcessingPanel } from '../ProcessingPanel'
import { usePhotoUploadStore } from '../store'

export function ErrorStep() {
  const { processingState, processingLogs, errorMessage } = usePhotoUploadStore(
    useShallow((state) => ({
      processingState: state.processingState,
      processingLogs: state.processingLogs,
      errorMessage: state.uploadError ?? state.processingError ?? '上传过程中发生错误，请稍后再试。',
    })),
  )
  const reset = usePhotoUploadStore((state) => state.reset)
  const closeModal = usePhotoUploadStore((state) => state.closeModal)

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <h2 className="text-text text-lg font-semibold">上传失败</h2>
        <p className="text-text-tertiary text-sm">请查看错误信息后重试，或稍后再尝试上传。</p>
      </div>

      <LinearBorderPanel className="border border-rose-400/40 bg-rose-500/5 px-3 py-2 text-xs text-rose-200 min-w-0 overflow-auto max-h-64">
        {errorMessage}
      </LinearBorderPanel>

      <ProcessingPanel state={processingState} logs={processingLogs} />

      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={closeModal}
          className="text-text-secondary hover:text-text"
        >
          关闭
        </Button>
        <Button type="button" variant="primary" size="sm" onClick={reset}>
          重新上传
        </Button>
      </div>
    </div>
  )
}
