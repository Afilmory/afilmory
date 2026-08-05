import { creemSubscriptions } from '@afilmory/db'
import { env } from '@afilmory/env'
import { DrizzleProvider } from '@core/database/database.provider'
import type { FlatSubscriptionEvent } from '@creem_io/better-auth'
import { creem } from '@creem_io/better-auth'
import { createLogger } from '@tsuki-hono/common'
import { eq } from 'drizzle-orm'
import { injectable } from 'tsyringe'

import { CreemBillingService } from './creem-billing.service'
import { mergeCreemMetadata, readMetadataPlanId, readMetadataString, toCreemIsoDate } from './creem-webhook.policy'

const logger = createLogger('CreemWebhook')

interface CreemWebhookEvent {
  cancelAtPeriodEnd?: boolean
  event: string
  eventId: string
  forceRevoke?: boolean
  metadata?: Record<string, unknown> | null
  periodEnd?: string | null
  periodStart?: string | null
  productId: string
  providerUpdatedAt?: string | null
  status?: string | null
  subscriptionId?: string | null
}

@injectable()
export class CreemWebhookService {
  constructor(
    private readonly drizzleProvider: DrizzleProvider,
    private readonly billing: CreemBillingService,
  ) {}

  isConfigured(): boolean {
    return Boolean(env.CREEM_API_KEY && env.CREEM_WEBHOOK_SECRET)
  }

  createBetterAuthPlugins(): ReturnType<typeof creem>[] {
    if (!env.CREEM_API_KEY || !env.CREEM_WEBHOOK_SECRET) {
      return []
    }
    return [
      creem({
        apiKey: env.CREEM_API_KEY,
        webhookSecret: env.CREEM_WEBHOOK_SECRET,
        persistSubscriptions: true,
        testMode: env.NODE_ENV !== 'production',
        onCheckoutCompleted: async (data) => {
          await this.handle({
            event: data.webhookEventType,
            eventId: data.webhookId,
            metadata: mergeCreemMetadata(data.metadata, data.subscription?.metadata),
            status: data.subscription?.status ?? 'active',
            subscriptionId: data.subscription?.id ?? null,
            productId: data.product.id,
            periodStart: toCreemIsoDate(data.subscription?.current_period_start_date),
            periodEnd: toCreemIsoDate(data.subscription?.current_period_end_date),
            providerUpdatedAt: toCreemIsoDate(data.webhookCreatedAt),
          })
        },
        onSubscriptionCanceled: async data => await this.handleSubscription(data, false, true),
        onSubscriptionExpired: async data => await this.handleSubscription(data, true),
        onSubscriptionUpdate: async data => await this.handleSubscription(data, false),
        onSubscriptionActive: async data => await this.handleSubscription(data, false),
        onSubscriptionTrialing: async data => await this.handleSubscription(data, false),
        onSubscriptionPaid: async data => await this.handleSubscription(data, false),
        onSubscriptionUnpaid: async data => await this.handleSubscription(data, false),
        onSubscriptionPastDue: async data => await this.handleSubscription(data, false),
        onSubscriptionPaused: async data => await this.handleSubscription(data, true),
      }),
    ]
  }

  private async handleSubscription(
    data: FlatSubscriptionEvent<string>,
    forceRevoke: boolean,
    cancelAtPeriodEnd = false,
  ): Promise<void> {
    await this.handle({
      event: data.webhookEventType,
      eventId: data.webhookId,
      metadata: mergeCreemMetadata(data.metadata),
      status: data.status,
      subscriptionId: data.id,
      productId: data.product.id,
      periodStart: toCreemIsoDate(data.current_period_start_date),
      periodEnd: toCreemIsoDate(data.current_period_end_date),
      providerUpdatedAt: toCreemIsoDate(data.webhookCreatedAt) ?? toCreemIsoDate(data.updated_at),
      cancelAtPeriodEnd,
      forceRevoke,
    })
  }

  private async handle(event: CreemWebhookEvent): Promise<void> {
    const metadata = event.metadata ?? undefined
    const tenantId = readMetadataString(metadata, 'tenantId')

    if (!tenantId) {
      logger.warn(`Creem ${event.event} event missing tenantId metadata`)
      return
    }
    if (!event.subscriptionId) {
      logger.warn(`Creem ${event.event} event missing a subscription ID`)
      return
    }
    if (!event.productId) {
      logger.warn(`Creem ${event.event} event missing a product ID`)
      return
    }

    await this.attachSubscriptionTenant(event.subscriptionId, tenantId)
    await this.billing.reconcile({
      applicationPlanId: readMetadataPlanId(metadata),
      billingOwnerUserId: readMetadataString(metadata, 'referenceId'),
      cancelAtPeriodEnd: event.cancelAtPeriodEnd ?? false,
      eventId: event.eventId,
      eventType: event.event,
      externalSubscriptionId: event.subscriptionId,
      forceRevoke: event.forceRevoke ?? false,
      periodEnd: event.periodEnd,
      periodStart: event.periodStart,
      productId: event.productId,
      providerUpdatedAt: event.providerUpdatedAt,
      status: event.status,
      storagePlanId: readMetadataString(metadata, 'storagePlanId'),
      tenantId,
    })
    logger.info(`Reconciled Creem ${event.event} for tenant ${tenantId}`)
  }

  private async attachSubscriptionTenant(subscriptionId: string, tenantId: string): Promise<void> {
    await this.drizzleProvider
      .getDb()
      .update(creemSubscriptions)
      .set({ tenantId, updatedAt: new Date().toISOString() })
      .where(eq(creemSubscriptions.creemSubscriptionId, subscriptionId))
  }
}
