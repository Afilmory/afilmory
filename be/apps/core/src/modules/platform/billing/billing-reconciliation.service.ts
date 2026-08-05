import { createHash } from 'node:crypto'

import { billingProviderEvents, generateId } from '@afilmory/db'
import { DbAccessor } from '@core/database/database.provider'
import { and, eq } from 'drizzle-orm'
import { injectable } from 'tsyringe'

import { normalizeCreemSubscriptionStatus } from './billing.policy'
import { BillingCatalogService, getCreemEnvironment } from './billing-catalog.service'
import type { BillingProjection } from './billing-domain.types'
import { BillingEntitlementService } from './billing-entitlement.service'

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
export class BillingReconciliationService {
  constructor(
    private readonly dbAccessor: DbAccessor,
    private readonly catalog: BillingCatalogService,
    private readonly entitlements: BillingEntitlementService,
  ) {}

  async reconcileCreem(input: CreemReconciliationInput): Promise<BillingProjection> {
    const environment = getCreemEnvironment()
    const normalizedPayload = {
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
    }
    const payloadDigest = createHash('sha256').update(JSON.stringify(normalizedPayload)).digest('hex')
    const db = this.dbAccessor.get()
    const [event] = await db
      .insert(billingProviderEvents)
      .values({
        id: generateId(),
        provider: 'creem',
        environment,
        externalEventId: input.eventId,
        externalSubscriptionId: input.externalSubscriptionId,
        signedAt: input.providerUpdatedAt ?? null,
        payload: normalizedPayload,
        payloadDigest,
      })
      .onConflictDoNothing()
      .returning({ id: billingProviderEvents.id })
    const eventId
      = event?.id
        ?? (await db
          .select({ id: billingProviderEvents.id })
          .from(billingProviderEvents)
          .where(
            and(
              eq(billingProviderEvents.provider, 'creem'),
              eq(billingProviderEvents.environment, environment),
              eq(billingProviderEvents.externalEventId, input.eventId),
            ),
          )
          .limit(1)
          .then(rows => rows[0]?.id))

    try {
      const offer = await this.catalog.resolveCreemOffer({
        applicationPlanId: input.applicationPlanId,
        externalProductId: input.productId,
        storagePlanId: input.storagePlanId,
      })
      if (!offer) {
        throw new Error('BILLING_OFFER_NOT_FOUND')
      }
      const status = normalizeCreemSubscriptionStatus({
        cancelAtPeriodEnd: input.cancelAtPeriodEnd,
        forceRevoke: input.forceRevoke,
        periodEnd: input.periodEnd,
        status: input.status,
      })
      if (!status) {
        throw new Error('BILLING_STATUS_NOT_ACTIONABLE')
      }
      const projection = await this.entitlements.reconcileSubscription({
        applicationPlanId: offer.applicationPlanId,
        billingOwnerUserId: input.billingOwnerUserId,
        environment,
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
      if (eventId) {
        await db
          .update(billingProviderEvents)
          .set({ processingStatus: 'processed', processedAt: new Date().toISOString(), errorCode: null })
          .where(eq(billingProviderEvents.id, eventId))
      }
      return projection
    }
    catch (error) {
      if (eventId) {
        await db
          .update(billingProviderEvents)
          .set({
            processingStatus: 'failed',
            errorCode: error instanceof Error ? error.message.slice(0, 120) : 'BILLING_RECONCILIATION_FAILED',
          })
          .where(eq(billingProviderEvents.id, eventId))
      }
      throw error
    }
  }
}
