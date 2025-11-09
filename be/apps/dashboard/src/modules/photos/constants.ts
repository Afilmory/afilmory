import type { PhotoSyncAction, PhotoSyncConflictType } from './types'

export const PHOTO_CONFLICT_TYPE_CONFIG: Record<PhotoSyncConflictType, { label: string; description: string }> = {
  'missing-in-storage': {
    label: '存储缺失',
    description: '数据库存在记录，但对应的存储对象已无法访问。',
  },
  'metadata-mismatch': {
    label: '元数据不一致',
    description: '存储对象与数据库记录的元数据不一致，需要确认以哪个为准。',
  },
  'photo-id-conflict': {
    label: '照片 ID 冲突',
    description: '同一个照片 ID 检测到多个对象，请选择保留的版本。',
  },
}

export function getConflictTypeLabel(type: PhotoSyncConflictType | null | undefined): string {
  if (!type) {
    return '冲突'
  }
  return PHOTO_CONFLICT_TYPE_CONFIG[type]?.label ?? '冲突'
}

export const PHOTO_ACTION_TYPE_CONFIG: Record<PhotoSyncAction['type'], { label: string; badgeClass: string }> = {
  insert: { label: '新增', badgeClass: 'bg-emerald-500/10 text-emerald-400' },
  update: { label: '更新', badgeClass: 'bg-sky-500/10 text-sky-400' },
  delete: { label: '删除', badgeClass: 'bg-rose-500/10 text-rose-400' },
  conflict: { label: '冲突', badgeClass: 'bg-amber-500/10 text-amber-400' },
  noop: { label: '跳过', badgeClass: 'bg-slate-500/10 text-slate-400' },
}
