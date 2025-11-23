import { Spring } from '@afilmory/utils'
import { m } from 'motion/react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { PageTabs } from '~/components/navigation/PageTabs'
import { ManagedStorageSettings, SuperAdminSettingsForm } from '~/modules/super-admin'

export function Component() {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<'general' | 'managed-storage'>('general')

  return (
    <m.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={Spring.presets.smooth}
      className="space-y-6"
    >
      <header className="space-y-2">
        <h1 className="text-text text-2xl font-semibold">{t('superadmin.settings.title')}</h1>
        <p className="text-text-secondary text-sm">{t('superadmin.settings.description')}</p>
      </header>

      <PageTabs
        activeId={activeTab}
        onSelect={(id) => setActiveTab(id as typeof activeTab)}
        items={[
          { id: 'general', labelKey: 'superadmin.settings.tabs.general' },
          { id: 'managed-storage', labelKey: 'superadmin.settings.tabs.managed-storage' },
        ]}
      />

      {activeTab === 'general' ? (
        <SuperAdminSettingsForm visibleSectionIds={['registration-control', 'oauth-providers']} />
      ) : (
        <ManagedStorageSettings />
      )}
    </m.div>
  )
}
