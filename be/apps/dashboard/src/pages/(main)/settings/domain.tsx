import { useTranslation } from 'react-i18next'

import { MainPageLayout } from '~/components/layouts/MainPageLayout'
import { SettingsNavigation } from '~/modules/settings'
import { CustomDomainCard } from '~/modules/site-settings'

export function Component() {
  const { t } = useTranslation()
  return (
    <MainPageLayout title={t('settings.domain.title')} description={t('settings.domain.description')}>
      <div className="space-y-6">
        <SettingsNavigation active="domain" />
        <CustomDomainCard />
      </div>
    </MainPageLayout>
  )
}
