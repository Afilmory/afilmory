import { Button } from '@afilmory/ui'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { useCancelCleanupPendingMutation, useCleanupPendingQuery } from '../hooks'

export function CleanupPendingList({ enabled }: { enabled: boolean }) {
  const { t } = useTranslation()
  const query = useCleanupPendingQuery(enabled)
  const cancel = useCancelCleanupPendingMutation()
  const items = query.data?.items ?? []

  if (query.isLoading) {
    return <p className="text-text-secondary text-sm">{t('superadmin.cleanup.loading')}</p>
  }

  if (items.length === 0) {
    return <p className="text-text-secondary py-10 text-center text-sm">{t('superadmin.cleanup.pending-empty')}</p>
  }

  return (
    <div className="border-border/40 min-h-0 flex-1 overflow-auto border">
      <table className="divide-border/40 min-w-full divide-y text-sm">
        <thead className="bg-background-secondary sticky top-0">
          <tr>
            <th className="px-3 py-2 text-left">{t('superadmin.cleanup.subject')}</th>
            <th className="px-3 py-2 text-left">{t('superadmin.cleanup.suspended-at')}</th>
            <th className="px-3 py-2 text-left">{t('superadmin.cleanup.due-at')}</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody className="divide-border/20 divide-y">
          {items.map((item) => {
            const overdue = new Date(item.dueAt).getTime() <= Date.now()
            return (
              <tr key={item.id}>
                <td className="px-3 py-3">
                  <div className="font-medium">{item.subjectLabel ?? item.tenantId ?? item.userId}</div>
                  <div className="text-text-tertiary text-xs">
                    {item.subjectType === 'tenant'
                      ? t('superadmin.cleanup.subject-tenant')
                      : t('superadmin.cleanup.subject-user')}
                  </div>
                </td>
                <td className="px-3 py-3">{new Date(item.suspendedAt).toLocaleDateString()}</td>
                <td className={`px-3 py-3 ${overdue ? 'text-red' : ''}`}>
                  {new Date(item.dueAt).toLocaleDateString()}
                  {overdue ? ` · ${t('superadmin.cleanup.due-now')}` : ''}
                </td>
                <td className="px-3 py-3 text-right">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={cancel.isPending}
                    onClick={async () => {
                      await cancel.mutateAsync(item.id)
                      toast.success(t('superadmin.cleanup.cancel-done'))
                    }}
                  >
                    {t('superadmin.cleanup.cancel-pending')}
                  </Button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
