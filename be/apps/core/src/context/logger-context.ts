import { HttpContext, registerLoggerContextProvider } from '@tsuki/framework'
import type { TenantContext } from 'core/modules/platform/tenant/tenant.types'

registerLoggerContextProvider(() => {
  try {
    const tenantContext = HttpContext.getValue('tenant') as TenantContext | undefined
    if (!tenantContext) {
      return
    }

    const requestedSlug = tenantContext.requestedSlug ?? tenantContext.tenant?.slug ?? null
    const suffix = tenantContext.isPlaceholder ? ' (=holding)' : ''

    if (requestedSlug) {
      return `tenant:${requestedSlug}${suffix}`
    }

    const identifier = tenantContext.tenant?.id
    return identifier ? `tenant#${identifier}${suffix}` : undefined
  } catch {
    return
  }
})
