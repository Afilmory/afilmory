import { MainPageLayout } from '~/components/layouts/MainPageLayout'
import { SocialConnectionSettings } from '~/modules/auth/components/SocialConnectionSettings'
import { SettingsNavigation } from '~/modules/settings'

export function Component() {
  return (
    <MainPageLayout title="账号与登录" description="绑定第三方账号，使用 OAuth 快速登录后台。">
      <div className="space-y-6">
        <SettingsNavigation active="account" />
        <SocialConnectionSettings />
      </div>
    </MainPageLayout>
  )
}
