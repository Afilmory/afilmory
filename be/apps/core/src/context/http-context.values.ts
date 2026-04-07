import type { Session } from 'better-auth'
import type { AuthSession } from 'core/modules/platform/auth/auth.provider'
import type { TenantContext } from 'core/modules/platform/tenant/tenant.types'
import type { SupportedLanguage } from 'core/modules/ui/ui-schema/ui-schema.i18n'

export interface HttpContextAuth {
  user?: AuthSession['user']
  session?: Session
}
declare module '@tsuki/framework' {
  interface HttpContextValues {
    tenant?: TenantContext
    auth?: HttpContextAuth
    language?: SupportedLanguage
  }
}
