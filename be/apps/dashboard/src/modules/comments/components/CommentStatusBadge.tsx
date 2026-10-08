import { CheckCircle2, CircleDashed, EyeOff, XCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { CommentStatus } from '../types'

const STATUS_ICON_MAP: Record<CommentStatus, React.JSX.Element> = {
  approved: <CheckCircle2 className="h-3.5 w-3.5" />,
  pending: <CircleDashed className="h-3.5 w-3.5" />,
  hidden: <EyeOff className="h-3.5 w-3.5" />,
  rejected: <XCircle className="h-3.5 w-3.5" />,
}

const STATUS_CLASS_MAP: Record<CommentStatus, string> = {
  approved: 'text-green',
  pending: 'text-yellow',
  hidden: 'text-text-tertiary',
  rejected: 'text-red',
}

const STATUS_LABEL_KEY: Record<CommentStatus, I18nKeys> = {
  approved: 'comments.status.approved',
  pending: 'comments.status.pending',
  hidden: 'comments.status.hidden',
  rejected: 'comments.status.rejected',
}

interface CommentStatusBadgeProps {
  status: CommentStatus
}

export function CommentStatusBadge({ status }: CommentStatusBadgeProps) {
  const { t } = useTranslation()
  const icon = STATUS_ICON_MAP[status]
  const className = STATUS_CLASS_MAP[status]
  const label = t(STATUS_LABEL_KEY[status])

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs ${className}`}>
      {icon}
      <span>{label}</span>
    </span>
  )
}
