import { MainPageLayout } from '~/components/layouts/MainPageLayout'
import { SettingsForm, SettingsNavigation } from '~/modules/settings'

export function Component() {
  return (
    <MainPageLayout title="系统设置" description="管理后台与核心功能的通用配置，修改后会立即同步生效。">
      <div className="space-y-6">
        <SettingsNavigation active="site" />
        <SettingsForm />
      </div>
    </MainPageLayout>
  )
}
