import { MainPageLayout } from '~/components/layouts/MainPageLayout'
import { BuilderSettingsForm } from '~/modules/builder-settings'
import { SettingsNavigation } from '~/modules/settings'

export function Component() {
  return (
    <MainPageLayout title="构建器" description="调整照片构建任务的并发、日志输出与仓库同步策略。">
      <div className="space-y-6">
        <SettingsNavigation active="builder" />
        <BuilderSettingsForm />
      </div>
    </MainPageLayout>
  )
}
