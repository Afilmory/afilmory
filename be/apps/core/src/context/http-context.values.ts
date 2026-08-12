import type { AuthSession } from '@core/modules/platform/auth/auth.provider'
import type { WorkspaceMembership } from '@core/modules/platform/auth/workspace-membership.service'
import type { TenantContext } from '@core/modules/platform/tenant/tenant.types'
import type { SupportedLanguage } from '@core/modules/ui/ui-schema/ui-schema.i18n'
import type { Session } from 'better-auth'

export interface HttpContextAuth {
  user?: AuthSession['user']
  session?: Session & { activeTenantId?: string | null }
}
declare module '@tsuki-hono/common' {
  interface HttpContextValues {
    tenant?: TenantContext
    auth?: HttpContextAuth
    membership?: WorkspaceMembership
    language?: SupportedLanguage
  }
}
