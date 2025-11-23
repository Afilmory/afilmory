import type { ModalComponent } from '@afilmory/ui'
import { DialogDescription, DialogHeader, DialogTitle } from '@afilmory/ui'
import { useTranslation } from 'react-i18next'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs'

import { useSuperAdminTenantPhotosQuery } from '../hooks'
import type { SuperAdminTenantSummary } from '../types'
import { TenantUsageCell } from './TenantUsageCell'

interface TenantDetailModalProps {
  tenant: SuperAdminTenantSummary
}

export const TenantDetailModal: ModalComponent<TenantDetailModalProps> = ({ tenant }) => {
  const { t } = useTranslation()

  const photoCount = tenant.usageTotals?.find((u) => u.eventType === 'photo.asset.created')?.totalQuantity ?? 0

  return (
    <div className="flex flex-col gap-4 h-full">
      <DialogHeader>
        <DialogTitle>{tenant.name}</DialogTitle>
        <DialogDescription>{tenant.slug}</DialogDescription>
      </DialogHeader>

      <Tabs defaultValue="overview" className="w-full flex-1 flex flex-col min-h-0">
        <TabsList>
          <TabsTrigger value="overview">{t('superadmin.tenants.modal.tab.overview')}</TabsTrigger>
          <TabsTrigger value="photos">{t('superadmin.tenants.modal.tab.photos')}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6 px-2 mt-4 flex-1 overflow-y-auto">
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-3">{t('superadmin.tenants.table.usage')}</h3>
            <TenantUsageCell usageTotals={tenant.usageTotals} />
          </div>

          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-3">
              {t('superadmin.tenants.modal.overview.details')}
            </h3>
            <dl className="divide-y border-t border-b">
              <div className="py-3 flex justify-between text-sm">
                <dt className="text-muted-foreground">{t('superadmin.tenants.table.status')}</dt>
                <dd className="font-medium">{tenant.status}</dd>
              </div>
              <div className="py-3 flex justify-between text-sm">
                <dt className="text-muted-foreground">{t('superadmin.tenants.table.plan')}</dt>
                <dd className="font-medium">{tenant.planId}</dd>
              </div>
              <div className="py-3 flex justify-between text-sm">
                <dt className="text-muted-foreground">{t('superadmin.tenants.modal.overview.photos')}</dt>
                <dd className="font-medium">{photoCount}</dd>
              </div>
              <div className="py-3 flex justify-between text-sm">
                <dt className="text-muted-foreground">{t('superadmin.tenants.table.created')}</dt>
                <dd className="font-medium">{new Date(tenant.createdAt).toLocaleDateString()}</dd>
              </div>
              <div className="py-3 flex justify-between text-sm">
                <dt className="text-muted-foreground">{t('superadmin.tenants.table.ban')}</dt>
                <dd className="font-medium">{tenant.banned ? 'Yes' : 'No'}</dd>
              </div>
            </dl>
          </div>
        </TabsContent>

        <TabsContent value="photos" className="mt-4 flex-1 overflow-y-auto min-h-0">
          <TenantPhotosTab tenantId={tenant.id} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

TenantDetailModal.contentClassName = 'max-w-4xl h-[80vh]'

function TenantPhotosTab({ tenantId }: { tenantId: string }) {
  const { t } = useTranslation()
  const { data, isLoading, isError } = useSuperAdminTenantPhotosQuery(tenantId)

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">{t('superadmin.tenants.modal.photos.loading')}</p>
  }

  if (isError) {
    return <p className="text-sm text-red-500">{t('superadmin.tenants.modal.photos.error')}</p>
  }

  const photos = data?.photos ?? []

  if (photos.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('superadmin.tenants.modal.photos.empty')}</p>
  }

  return (
    <div className="border rounded-md overflow-hidden">
      <table className="min-w-full divide-y divide-border/40 text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground w-16">
              {t('superadmin.tenants.modal.photos.table.preview')}
            </th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">
              {t('superadmin.tenants.modal.photos.table.name')}
            </th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground w-24">
              {t('superadmin.tenants.modal.photos.table.size')}
            </th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground w-40">
              {t('superadmin.tenants.modal.photos.table.created')}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/20">
          {photos.map((photo) => (
            <tr key={photo.id}>
              <td className="px-4 py-2">
                <div className="w-10 h-10 bg-muted rounded overflow-hidden">
                  {/* We might not have a public URL if it's not synced or private, but let's try */}
                  {photo.publicUrl && (
                    <img src={photo.publicUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
                  )}
                </div>
              </td>
              <td className="px-4 py-2 font-medium truncate max-w-[200px]" title={photo.storageKey}>
                {photo.storageKey.split('/').pop()}
              </td>
              <td className="px-4 py-2 text-muted-foreground">{formatBytes(photo.size ?? 0)}</td>
              <td className="px-4 py-2 text-muted-foreground">{new Date(photo.createdAt).toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B'
  }
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`
}
