import { CheckCircle2, CircleDashed, Undo2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { TenantDomain } from '../types'

const STATUS_ICON_MAP: Record<TenantDomain['status'], React.JSX.Element> = {
  verified: <CheckCircle2 className="h-4 w-4 text-green" />,
  pending: <CircleDashed className="h-4 w-4 text-yellow" />,
  disabled: <Undo2 className="h-4 w-4 text-text-tertiary" />,
}

export function DomainBadge({ status }: { status: TenantDomain['status'] }) {
  const { t } = useTranslation()
  const label = t(`settings.domain.status.${status}`)
  const icon = STATUS_ICON_MAP[status]
  return (
    <span className="inline-flex items-center gap-2 text-xs text-text-secondary">
      {icon}
      <span>{label}</span>
    </span>
  )
}
