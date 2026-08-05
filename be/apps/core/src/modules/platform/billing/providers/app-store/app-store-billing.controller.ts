import { AllowPlaceholderTenant } from '@core/decorators/allow-placeholder.decorator'
import { SkipTenantGuard } from '@core/decorators/skip-tenant.decorator'
import { BizException, ErrorCode } from '@core/errors'
import { TenantRoles } from '@core/guards/roles.decorator'
import { requireTenantContext } from '@core/modules/platform/tenant/tenant.context'
import { Body, Controller, createZodSchemaDto, Get, HttpContext, Post } from '@tsuki-hono/common'
import { z } from 'zod'

import { BillingCatalogService } from '../../catalog/billing-catalog.service'
import { AppStoreBillingService } from './app-store-billing.service'

class PurchaseContextDto extends createZodSchemaDto(z.object({ offerId: z.string().trim().min(1).max(160) })) {}

class TransactionDto extends createZodSchemaDto(
  z.object({ signedTransactionInfo: z.string().trim().min(1).max(250_000) }),
) {}

class RestoreDto extends createZodSchemaDto(
  z.object({
    signedTransactions: z.array(z.string().trim().min(1).max(250_000)).max(100),
  }),
) {}

class NotificationDto extends createZodSchemaDto(z.object({ signedPayload: z.string().trim().min(1).max(500_000) })) {}

@Controller('billing/app-store')
@TenantRoles('owner')
export class AppStoreBillingController {
  constructor(
    private readonly billing: AppStoreBillingService,
    private readonly catalog: BillingCatalogService,
  ) {}

  @Get('/offers')
  async getOffers() {
    return {
      configured: this.billing.isConfigured(),
      offers: await this.catalog.listAppStoreOffers(),
    }
  }

  @Post('/purchase-context')
  async createPurchaseContext(@Body() body: PurchaseContextDto) {
    const identity = this.requireIdentity()
    return await this.billing.createPurchaseContext({
      billingOwnerUserId: identity.userId,
      offerId: body.offerId,
      tenantId: identity.tenantId,
    })
  }

  @Post('/transactions')
  async submitTransaction(@Body() body: TransactionDto) {
    const identity = this.requireIdentity()
    return await this.billing.submitTransaction({
      billingOwnerUserId: identity.userId,
      signedTransactionInfo: body.signedTransactionInfo,
      tenantId: identity.tenantId,
    })
  }

  @Post('/restore')
  async restore(@Body() body: RestoreDto) {
    const identity = this.requireIdentity()
    return await this.billing.restoreTransactions({
      billingOwnerUserId: identity.userId,
      signedTransactions: body.signedTransactions,
      tenantId: identity.tenantId,
    })
  }

  private requireIdentity(): { tenantId: string, userId: string } {
    const auth = HttpContext.getValue('auth')
    if (!auth?.user) {
      throw new BizException(ErrorCode.AUTH_UNAUTHORIZED)
    }
    return { tenantId: requireTenantContext().tenant.id, userId: auth.user.id }
  }
}

@Controller('billing/app-store/notifications-v2')
@AllowPlaceholderTenant()
@SkipTenantGuard()
export class AppStoreNotificationController {
  constructor(private readonly billing: AppStoreBillingService) {}

  @Post('/')
  async receive(@Body() body: NotificationDto) {
    return await this.billing.processNotification(body.signedPayload)
  }
}
