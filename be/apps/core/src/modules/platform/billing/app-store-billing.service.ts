import { createHash, randomUUID } from 'node:crypto'

import {
  billingEntitlements,
  billingProviderEvents,
  billingSubjects,
  billingSubscriptions,
  generateId,
} from '@afilmory/db'
import type { JWSTransactionDecodedPayload, ResponseBodyV2DecodedPayload } from '@apple/app-store-server-library'
import { DbAccessor } from '@core/database/database.provider'
import { BizException, ErrorCode } from '@core/errors'
import { and, eq, inArray } from 'drizzle-orm'
import { injectable } from 'tsyringe'

import { AppStoreSignedDataService } from './app-store-signed-data.service'
import type { BillingPurchaseOffer } from './billing-catalog.service'
import { BillingCatalogService, getAppStoreEnvironment, normalizeAppStoreEnvironment } from './billing-catalog.service'
import type { BillingSubscriptionStatus } from './billing-domain.types'
import { BillingEntitlementService } from './billing-entitlement.service'

export interface AppStorePurchaseContext {
  appAccountToken: string
  environment: 'production' | 'sandbox'
  offer: BillingPurchaseOffer
  productId: string
}

@injectable()
export class AppStoreBillingService {
  constructor(
    private readonly dbAccessor: DbAccessor,
    private readonly catalog: BillingCatalogService,
    private readonly entitlements: BillingEntitlementService,
    private readonly signedData: AppStoreSignedDataService,
  ) {}

  isConfigured(): boolean {
    return this.signedData.isConfigured()
  }

  async createPurchaseContext(input: {
    billingOwnerUserId: string
    offerId: string
    tenantId: string
  }): Promise<AppStorePurchaseContext> {
    const offer = await this.catalog.getAppStoreOffer(input.offerId)
    if (!offer) {
      throw new BizException(ErrorCode.COMMON_BAD_REQUEST, { message: 'This App Store offer is unavailable.' })
    }
    await this.ensureNoOverlappingProvider(input.tenantId, offer)
    const subject = await this.getOrCreateBillingSubject(input.tenantId, input.billingOwnerUserId)
    return {
      appAccountToken: subject.appAccountToken,
      environment: getAppStoreEnvironment(),
      offer,
      productId: offer.externalProductId,
    }
  }

  async submitTransaction(input: { billingOwnerUserId: string, signedTransactionInfo: string, tenantId: string }) {
    const transaction = await this.signedData.verifyTransaction(input.signedTransactionInfo)
    return await this.reconcileVerifiedTransaction(transaction, {
      expectedOwnerUserId: input.billingOwnerUserId,
      expectedTenantId: input.tenantId,
      eventId: transaction.transactionId ?? this.digest(input.signedTransactionInfo),
      eventType: 'client_transaction',
    })
  }

  async restoreTransactions(input: { billingOwnerUserId: string, signedTransactions: string[], tenantId: string }) {
    const results: unknown[] = []
    for (const signedTransaction of input.signedTransactions) {
      results.push(
        await this.submitTransaction({
          billingOwnerUserId: input.billingOwnerUserId,
          signedTransactionInfo: signedTransaction,
          tenantId: input.tenantId,
        }),
      )
    }
    return { restored: results.length, results }
  }

  async processNotification(signedPayload: string): Promise<{ accepted: true, duplicate: boolean }> {
    const notification = await this.signedData.verifyNotification(signedPayload)
    const environment = normalizeAppStoreEnvironment(notification.data?.environment)
    const notificationId = notification.notificationUUID
    if (!environment || !notificationId) {
      throw new Error('APP_STORE_NOTIFICATION_INVALID')
    }
    const payload = this.notificationAuditPayload(notification)
    const event = await this.recordProviderEvent({
      environment,
      eventId: notificationId,
      eventType: String(notification.notificationType ?? 'UNKNOWN'),
      externalSubscriptionId: null,
      payload,
      signedAt: this.toIsoDate(notification.signedDate),
    })
    if (!notification.data?.signedTransactionInfo) {
      await this.markProviderEvent(event.id, 'processed', null)
      return { accepted: true, duplicate: event.duplicate }
    }

    try {
      const transaction = await this.signedData.verifyTransaction(notification.data.signedTransactionInfo)
      const result = await this.reconcileVerifiedTransaction(transaction, {
        eventId: notificationId,
        eventType: String(notification.notificationType ?? 'notification'),
        notificationStatus: notification.data.status,
        skipEventInsert: true,
      })
      await this.markProviderEvent(event.id, 'processed', null)
      return { accepted: true, duplicate: event.duplicate || result.duplicate }
    }
    catch (error) {
      await this.markProviderEvent(
        event.id,
        'failed',
        error instanceof Error ? error.message.slice(0, 120) : 'APP_STORE_NOTIFICATION_RECONCILIATION_FAILED',
      )
      throw error
    }
  }

  private async reconcileVerifiedTransaction(
    transaction: JWSTransactionDecodedPayload,
    context: {
      eventId: string
      eventType: string
      expectedOwnerUserId?: string
      expectedTenantId?: string
      notificationStatus?: number
      skipEventInsert?: boolean
    },
  ) {
    const environment = normalizeAppStoreEnvironment(transaction.environment)
    const productId = transaction.productId?.trim()
    const originalTransactionId = transaction.originalTransactionId?.trim()
    const transactionId = transaction.transactionId?.trim()
    const appAccountToken = transaction.appAccountToken?.trim().toLowerCase()
    if (!environment || !productId || !originalTransactionId || !transactionId || !appAccountToken) {
      throw new Error('APP_STORE_TRANSACTION_MISSING_REQUIRED_FIELDS')
    }
    if (environment !== getAppStoreEnvironment()) {
      throw new Error('APP_STORE_ENVIRONMENT_MISMATCH')
    }
    const offer = await this.catalog.findOfferByProduct('app_store', environment, productId)
    if (!offer) {
      throw new Error('APP_STORE_PRODUCT_NOT_ALLOWLISTED')
    }
    const db = this.dbAccessor.get()
    const subject = await db
      .select()
      .from(billingSubjects)
      .where(eq(billingSubjects.appAccountToken, appAccountToken))
      .limit(1)
      .then(rows => rows[0] ?? null)
    if (!subject) {
      throw new Error('APP_STORE_BILLING_SUBJECT_NOT_FOUND')
    }
    if (subject.tombstonedAt) {
      if (context.expectedTenantId || context.expectedOwnerUserId) {
        throw new Error('APP_STORE_BILLING_SUBJECT_TOMBSTONED')
      }
      return {
        duplicate: false,
        ignored: true,
        originalTransactionId,
        status: 'revoked' as const,
        tenantId: subject.tenantId,
        transactionId,
      }
    }
    if (context.expectedTenantId && subject.tenantId !== context.expectedTenantId) {
      throw new Error('APP_STORE_TRANSACTION_TENANT_MISMATCH')
    }
    if (
      context.expectedOwnerUserId
      && subject.billingOwnerUserId
      && subject.billingOwnerUserId !== context.expectedOwnerUserId
    ) {
      throw new Error('APP_STORE_TRANSACTION_OWNER_MISMATCH')
    }

    const status = this.resolveTransactionStatus(transaction, context.notificationStatus)
    const providerEvent = context.skipEventInsert
      ? null
      : await this.recordProviderEvent({
          environment,
          eventId: context.eventId,
          eventType: context.eventType,
          externalSubscriptionId: originalTransactionId,
          payload: {
            eventType: context.eventType,
            originalTransactionId,
            productId,
            status,
            transactionId,
          },
          signedAt: this.toIsoDate(transaction.signedDate),
        })

    try {
      const projection = await this.entitlements.reconcileSubscription({
        appAccountToken,
        applicationPlanId: offer.applicationPlanId,
        billingOwnerUserId: subject.billingOwnerUserId ?? context.expectedOwnerUserId ?? null,
        environment,
        externalSubscriptionId: originalTransactionId,
        metadata: { latestTransactionId: transactionId, productId },
        offerId: offer.id,
        originalTransactionId,
        periodEnd: this.toIsoDate(transaction.expiresDate),
        periodStart: this.toIsoDate(transaction.purchaseDate),
        provider: 'app_store',
        providerUpdatedAt: this.toIsoDate(transaction.signedDate),
        rank: offer.rank,
        status,
        storagePlanId: offer.storagePlanId,
        tenantId: subject.tenantId,
      })
      if (providerEvent) {
        await this.markProviderEvent(providerEvent.id, 'processed', null)
      }
      return {
        duplicate: providerEvent?.duplicate ?? false,
        originalTransactionId,
        projection,
        status,
        tenantId: subject.tenantId,
        transactionId,
      }
    }
    catch (error) {
      if (providerEvent) {
        await this.markProviderEvent(
          providerEvent.id,
          'failed',
          error instanceof Error ? error.message.slice(0, 120) : 'APP_STORE_RECONCILIATION_FAILED',
        )
      }
      throw error
    }
  }

  private async getOrCreateBillingSubject(tenantId: string, billingOwnerUserId: string) {
    const db = this.dbAccessor.get()
    const current = await db
      .select()
      .from(billingSubjects)
      .where(eq(billingSubjects.tenantId, tenantId))
      .limit(1)
      .then(rows => rows[0] ?? null)
    if (current?.tombstonedAt) {
      throw new BizException(ErrorCode.COMMON_CONFLICT, { message: 'This billing subject is no longer available.' })
    }
    if (current?.billingOwnerUserId && current.billingOwnerUserId !== billingOwnerUserId) {
      throw new BizException(ErrorCode.COMMON_CONFLICT, {
        message: 'This workspace already has a different billing owner.',
      })
    }
    if (current) {
      if (!current.billingOwnerUserId) {
        const [updated] = await db
          .update(billingSubjects)
          .set({ billingOwnerUserId, updatedAt: new Date().toISOString() })
          .where(eq(billingSubjects.tenantId, tenantId))
          .returning()
        return updated ?? current
      }
      return current
    }
    const [created] = await db
      .insert(billingSubjects)
      .values({ tenantId, appAccountToken: randomUUID(), billingOwnerUserId })
      .returning()
    if (!created) {
      throw new Error('BILLING_SUBJECT_CREATION_FAILED')
    }
    return created
  }

  private async ensureNoOverlappingProvider(tenantId: string, offer: BillingPurchaseOffer): Promise<void> {
    const kinds = [
      offer.applicationPlanId ? ('application_plan' as const) : null,
      offer.storagePlanId ? ('managed_storage' as const) : null,
    ].filter((kind): kind is 'application_plan' | 'managed_storage' => Boolean(kind))
    if (kinds.length === 0) {
      throw new BizException(ErrorCode.COMMON_BAD_REQUEST, { message: 'This offer grants no entitlement.' })
    }
    const db = this.dbAccessor.get()
    const grants = await db
      .select({
        sourceType: billingEntitlements.sourceType,
        provider: billingSubscriptions.provider,
      })
      .from(billingEntitlements)
      .leftJoin(
        billingSubscriptions,
        and(
          eq(billingEntitlements.sourceType, 'subscription'),
          eq(billingEntitlements.sourceId, billingSubscriptions.id),
        ),
      )
      .where(
        and(
          eq(billingEntitlements.tenantId, tenantId),
          eq(billingEntitlements.status, 'active'),
          inArray(billingEntitlements.kind, kinds),
        ),
      )
    if (grants.some(grant => grant.sourceType === 'manual' || grant.provider === 'creem')) {
      throw new BizException(ErrorCode.COMMON_CONFLICT, {
        message: 'An overlapping entitlement is already managed outside the App Store.',
      })
    }
  }

  private resolveTransactionStatus(
    transaction: JWSTransactionDecodedPayload,
    notificationStatus?: number,
  ): BillingSubscriptionStatus {
    if (transaction.revocationDate || transaction.revocationReason !== undefined || notificationStatus === 5) {
      return 'revoked'
    }
    switch (notificationStatus) {
      case 2: {
        return 'expired'
      }
      case 3: {
        return 'billing_retry'
      }
      case 4: {
        return 'grace_period'
      }
      case 5: {
        return 'revoked'
      }
    }
    const expiresAt = transaction.expiresDate ?? 0
    return expiresAt > Date.now() ? 'active' : 'expired'
  }

  private async recordProviderEvent(input: {
    environment: string
    eventId: string
    eventType: string
    externalSubscriptionId: string | null
    payload: Record<string, unknown>
    signedAt: string | null
  }): Promise<{ duplicate: boolean, id: string }> {
    const db = this.dbAccessor.get()
    const digest = this.digest(JSON.stringify(input.payload))
    const [created] = await db
      .insert(billingProviderEvents)
      .values({
        id: generateId(),
        provider: 'app_store',
        environment: input.environment,
        externalEventId: input.eventId,
        externalSubscriptionId: input.externalSubscriptionId,
        signedAt: input.signedAt,
        payload: input.payload,
        payloadDigest: digest,
      })
      .onConflictDoNothing()
      .returning({ id: billingProviderEvents.id })
    if (created) {
      return { duplicate: false, id: created.id }
    }
    const existing = await db
      .select({ id: billingProviderEvents.id })
      .from(billingProviderEvents)
      .where(
        and(
          eq(billingProviderEvents.provider, 'app_store'),
          eq(billingProviderEvents.environment, input.environment),
          eq(billingProviderEvents.externalEventId, input.eventId),
        ),
      )
      .limit(1)
      .then(rows => rows[0] ?? null)
    if (!existing) {
      throw new Error('APP_STORE_EVENT_RECEIPT_FAILED')
    }
    return { duplicate: true, id: existing.id }
  }

  private async markProviderEvent(
    eventId: string,
    status: 'failed' | 'processed',
    errorCode: string | null,
  ): Promise<void> {
    await this.dbAccessor
      .get()
      .update(billingProviderEvents)
      .set({
        processingStatus: status,
        processedAt: status === 'processed' ? new Date().toISOString() : null,
        errorCode,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(billingProviderEvents.id, eventId))
  }

  private notificationAuditPayload(notification: ResponseBodyV2DecodedPayload): Record<string, unknown> {
    return {
      bundleId: notification.data?.bundleId ?? null,
      environment: notification.data?.environment ?? null,
      notificationType: notification.notificationType ?? null,
      notificationUUID: notification.notificationUUID ?? null,
      signedDate: notification.signedDate ?? null,
      status: notification.data?.status ?? null,
      subtype: notification.subtype ?? null,
    }
  }

  private toIsoDate(value: number | null | undefined): string | null {
    if (value === null || value === undefined) {
      return null
    }
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date.toISOString()
  }

  private digest(value: string): string {
    return createHash('sha256').update(value).digest('hex')
  }
}
