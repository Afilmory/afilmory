import { injectable } from 'tsyringe'

import { BillingError } from '../../billing.error'
import type { BillingProjection } from '../../billing-domain.types'
import { BillingCatalogService } from '../../catalog/billing-catalog.service'
import { BillingEntitlementService } from '../../entitlement/billing-entitlement.service'
import { getCreemEnvironment } from '../billing-environment'
import { BillingProviderEventService } from '../billing-provider-event.service'
import { normalizeCreemSubscriptionStatus } from './creem-billing.policy'

export interface CreemReconciliationInput {
  applicationPlanId: string | null
  billingOwnerUserId: string | null
  cancelAtPeriodEnd?: boolean
  eventId: string
  eventType: string
  externalSubscriptionId: string
  forceRevoke?: boolean
  periodEnd?: string | null
  periodStart?: string | null
  productId: string
  providerUpdatedAt?: string | null
  status?: string | null
  storagePlanId: string | null
  tenantId: string
}

@injectable()
export class CreemBillingService {
  constructor(
    private readonly catalog: BillingCatalogService,
    private readonly entitlements: BillingEntitlementService,
    private readonly providerEvents: BillingProviderEventService,
  ) {}

  async reconcile(input: CreemReconciliationInput): Promise<BillingProjection> {
    const tracked = await this.providerEvents.track(
      {
        environment: getCreemEnvironment(),
        eventId: input.eventId,
        externalSubscriptionId: input.externalSubscriptionId,
        payload: {
          applicationPlanId: input.applicationPlanId,
          cancelAtPeriodEnd: input.cancelAtPeriodEnd ?? false,
          eventType: input.eventType,
          periodEnd: input.periodEnd ?? null,
          periodStart: input.periodStart ?? null,
          productId: input.productId,
          providerUpdatedAt: input.providerUpdatedAt ?? null,
          status: input.status ?? null,
          storagePlanId: input.storagePlanId,
          tenantId: input.tenantId,
        },
        provider: 'creem',
        signedAt: input.providerUpdatedAt ?? null,
      },
      'BILLING_RECONCILIATION_FAILED',
      async () => await this.project(input),
    )
    return tracked.result
  }

  private async project(input: CreemReconciliationInput): Promise<BillingProjection> {
    const offer = await this.catalog.resolveCreemOffer({
      applicationPlanId: input.applicationPlanId,
      externalProductId: input.productId,
      storagePlanId: input.storagePlanId,
    })
    if (!offer) {
      throw new BillingError('BILLING_OFFER_NOT_FOUND')
    }
    const status = normalizeCreemSubscriptionStatus({
      cancelAtPeriodEnd: input.cancelAtPeriodEnd,
      forceRevoke: input.forceRevoke,
      periodEnd: input.periodEnd,
      status: input.status,
    })
    if (!status) {
      throw new BillingError('BILLING_STATUS_NOT_ACTIONABLE')
    }
    return await this.entitlements.reconcileSubscription({
      applicationPlanId: offer.applicationPlanId,
      billingOwnerUserId: input.billingOwnerUserId,
      environment: getCreemEnvironment(),
      externalSubscriptionId: input.externalSubscriptionId,
      metadata: { eventType: input.eventType, productId: input.productId },
      offerId: offer.id,
      periodEnd: input.periodEnd,
      periodStart: input.periodStart,
      provider: 'creem',
      providerUpdatedAt: input.providerUpdatedAt,
      rank: offer.rank,
      status,
      storagePlanId: offer.storagePlanId,
      tenantId: input.tenantId,
    })
  }
}
