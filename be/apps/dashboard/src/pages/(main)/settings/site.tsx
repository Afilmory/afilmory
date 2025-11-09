import { MainPageLayout } from '~/components/layouts/MainPageLayout'
import { SettingsNavigation } from '~/modules/settings'
import { SiteSettingsForm } from '~/modules/site-settings'

export function Component() {
  return (
    <MainPageLayout title="站点设置" description="配置前台站点的品牌信息、社交渠道与地图展示。">
      <div className="space-y-6">
        <SettingsNavigation active="site" />
        <SiteSettingsForm />
      </div>
    </MainPageLayout>
  )
}
