import { Spring } from '@afilmory/utils'
import { m } from 'motion/react'

import { SuperAdminSettingsForm } from '~/modules/super-admin'

export function Component() {
  return (
    <m.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={Spring.presets.smooth}
      className="space-y-6"
    >
      <header className="space-y-2">
        <h1 className="text-text text-2xl font-semibold">系统设置</h1>
        <p className="text-text-secondary text-sm">管理整个平台的注册策略与本地登录渠道，由超级管理员统一维护。</p>
      </header>

      <SuperAdminSettingsForm />
    </m.div>
  )
}
