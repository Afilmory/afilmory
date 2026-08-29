import { Button, Modal } from '@afilmory/ui'
import { Spring } from '@afilmory/utils'
import { Trash2Icon } from 'lucide-react'
import { m } from 'motion/react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { PageTabs } from '~/components/navigation/PageTabs'

import { CleanupModal } from './CleanupModal'
import { TenantStoragePanel } from './TenantStoragePanel'
import { TenantSubscriptionsPanel } from './TenantSubscriptionsPanel'

export function SuperAdminTenantManager() {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<'subscriptions' | 'storage'>('subscriptions')

  return (
    <m.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={Spring.presets.smooth}>
      <div className="mb-4 flex justify-end">
        <Button variant="destructive" size="sm" onClick={() => Modal.present(CleanupModal, {})}>
          <Trash2Icon className="size-4" />
          {t('superadmin.cleanup.action')}
        </Button>
      </div>
      <PageTabs
        items={[
          { id: 'subscriptions', label: t('superadmin.tenants.tabs.subscriptions') },
          { id: 'storage', label: t('superadmin.tenants.tabs.storage') },
        ]}
        activeId={activeTab}
        onSelect={(tab) => {
          if (tab === 'subscriptions' || tab === 'storage') {
            setActiveTab(tab)
          }
        }}
        className="mb-4"
      />

      {activeTab === 'subscriptions' ? <TenantSubscriptionsPanel /> : <TenantStoragePanel />}
    </m.div>
  )
}
