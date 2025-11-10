import { MainPageLayout } from '~/components/layouts/MainPageLayout'
import { SettingsForm, SettingsNavigation } from '~/modules/settings'

export function Component() {
  return (
    <MainPageLayout title="素材存储" description="配置构建器访问素材存储的凭证、并发与连接策略。">
      <div className="space-y-6">
        <SettingsNavigation active="storage" />
        <SettingsForm />
      </div>
    </MainPageLayout>
  )
}
