import { Button } from '@afilmory/ui'
import { useMemo } from 'react'
import { useShallow } from 'zustand/shallow'

import { LinearBorderPanel } from '~/components/common/LinearBorderPanel'

import { AutoSelect } from '../AutoSelect'
import { usePhotoUploadStore } from '../store'
import { UploadFileList } from '../UploadFileList'
import { formatBytes } from '../utils'

export function ReviewStep() {
  const { filesCount, totalSize, hasMovFile, unmatchedMovFiles, availableTags, selectedTags } = usePhotoUploadStore(
    useShallow((state) => ({
      filesCount: state.files.length,
      totalSize: state.totalSize,
      hasMovFile: state.hasMovFile,
      unmatchedMovFiles: state.unmatchedMovFiles,
      availableTags: state.availableTags,
      selectedTags: state.selectedTags,
    })),
  )
  const { uploadEntries, progress } = usePhotoUploadStore(
    useShallow((state) => ({
      uploadEntries: state.uploadEntries,
      progress: state.totalSize === 0 ? 0 : Math.min(1, state.uploadedBytes / state.totalSize),
    })),
  )

  const beginUpload = usePhotoUploadStore((state) => state.beginUpload)
  const closeModal = usePhotoUploadStore((state) => state.closeModal)
  const setSelectedTags = usePhotoUploadStore((state) => state.setSelectedTags)
  const removeEntry = usePhotoUploadStore((state) => state.removeEntry)

  const tagOptions = useMemo(
    () => availableTags.map((tag) => ({ label: tag, value: tag.toLowerCase() })),
    [availableTags],
  )
  const hasUnmatched = unmatchedMovFiles.length > 0

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <h2 className="text-text text-lg font-semibold">确认上传这些文件？</h2>
        <p className="text-text-tertiary text-sm">
          共选择 {filesCount} 项，预计占用 {formatBytes(totalSize)}。
        </p>
      </div>

      {hasUnmatched ? (
        <LinearBorderPanel className="border border-rose-400/40 bg-rose-500/5 px-3 py-2 text-xs text-rose-300">
          <p>以下 MOV 文件缺少同名的图像文件，请补齐后再尝试上传：</p>
          <ul className="mt-1 space-y-1">
            {unmatchedMovFiles.map((file) => (
              <li key={`${file.name}-${file.lastModified}`}>{file.name}</li>
            ))}
          </ul>
        </LinearBorderPanel>
      ) : hasMovFile ? (
        <p className="text-text-tertiary text-xs">已检测到 MOV 文件，将与同名图片一起作为 Live Photo 处理。</p>
      ) : null}

      <AutoSelect
        options={tagOptions}
        value={selectedTags}
        onChange={setSelectedTags}
        placeholder="标签：输入后按 Enter 添加，或从建议中选择"
      />

      <UploadFileList entries={uploadEntries} overallProgress={progress} onRemoveEntry={removeEntry} />

      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={closeModal}
          className="text-text-secondary hover:text-text"
        >
          取消
        </Button>
        <Button type="button" variant="primary" size="sm" onClick={() => void beginUpload()} disabled={hasUnmatched}>
          开始上传
        </Button>
      </div>
    </div>
  )
}
