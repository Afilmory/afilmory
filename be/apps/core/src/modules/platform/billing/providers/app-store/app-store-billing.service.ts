import { randomUUID } from 'node:crypto'

import { sha256Hex } from '@afilmory/be-utils'
import { billingEntitlements, billingSubjects, billingSubscriptions } from '@afilmory/db'
import type { JWSTransactionDecodedPayload, ResponseBodyV2DecodedPayload } from '@apple/app-store-server-library'
import { DbAccessor } from '@core/database/database.provider'
import { BizException, ErrorCode } from '@core/errors'
import { and, eq, inArray } from 'drizzle-orm'
import { injectable } from 'tsyringe'

import { BillingError } from '../../billing.error'
import type { BillingSubscriptionStatus } from '../../billing-domain.types'
import { BillingCatalogService } from '../../catalog/billing-catalog.service'
import type { BillingPurchaseOffer } from '../../catalog/billing-catalog.types'
import { BillingEntitlementService } from '../../entitlement/billing-entitlement.service'
import { getAppStoreEnvironment, normalizeAppStoreEnvironment } from '../billing-environment'
import { BillingProviderEventService } from '../billing-provider-event.service'
import { describeTerminalClientBillingError } from './app-store-billing.policy'
import { AppStoreSignedDataService } from './app-store-signed-data.service'

export interface AppStorePurchaseContext {
  appAccountToken: string
  environment: 'production' | 'sandbox'
  offer: BillingPurchaseOffer
  productId: string
}

interface ReconciliationContext {
  eventId: string
  eventType: string
  expectedOwnerUserId?: string
  expectedTenantId?: string
  notificationStatus?: number
  skipEventInsert?: boolean
}

@injectable()
export class AppStoreBillingService {
  constructor(
    private readonly dbAccessor: DbAccessor,
    private readonly catalog: BillingCatalogService,
    private readonly entitlements: BillingEntitlementService,
    private readonly signedData: AppStoreSignedDataService,
    private readonly providerEvents: BillingProviderEventService,
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
    try {
      const transaction = await this.signedData.verifyTransaction(input.signedTransactionInfo)
      return await this.reconcileVerifiedTransaction(transaction, {
        expectedOwnerUserId: input.billingOwnerUserId,
        expectedTenantId: input.tenantId,
        eventId: transaction.transactionId ?? sha256Hex(input.signedTransactionInfo),
        eventType: 'client_transaction',
      })
    }
    catch (error) {
      throw this.toClientFacingError(error)
    }
  }

  // One foreign transaction on the device must not sink the customer's own restore, so terminal
  // rejections are skipped rather than thrown. Anything retryable still fails the whole request.
  async restoreTransactions(input: { billingOwnerUserId: string, signedTransactions: string[], tenantId: string }) {
    const results: unknown[] = []
    const rejected: Array<{ message: string }> = []
    for (const signedTransaction of input.signedTransactions) {
      try {
        results.push(
          await this.submitTransaction({
            billingOwnerUserId: input.billingOwnerUserId,
            signedTransactionInfo: signedTransaction,
            tenantId: input.tenantId,
          }),
        )
      }
      catch (error) {
        if (error instanceof BizException && error.code === ErrorCode.BILLING_TRANSACTION_NOT_ATTRIBUTABLE) {
          rejected.push({ message: error.message })
          continue
        }
        throw error
      }
    }
    return { rejected, restored: results.length, results }
  }

  private toClientFacingError(error: unknown): unknown {
    if (!(error instanceof BillingError)) {
      return error
    }
    const message = describeTerminalClientBillingError(error.code)
    if (!message) {
      return error
    }
    return new BizException(ErrorCode.BILLING_TRANSACTION_NOT_ATTRIBUTABLE, { cause: error, message })
  }

  async processNotification(signedPayload: string): Promise<{ accepted: true, duplicate: boolean }> {
    const notification = await this.signedData.verifyNotification(signedPayload)
    const environment = normalizeAppStoreEnvironment(notification.data?.environment)
    const notificationId = notification.notificationUUID
    if (!environment || !notificationId) {
      throw new BillingError('APP_STORE_NOTIFICATION_INVALID')
    }

    const signedTransactionInfo = notification.data?.signedTransactionInfo
    const tracked = await this.providerEvents.track(
      {
        environment,
        eventId: notificationId,
        externalSubscriptionId: null,
        payload: this.notificationAuditPayload(notification),
        provider: 'app_store',
        signedAt: this.toIsoDate(notification.signedDate),
      },
      'APP_STORE_NOTIFICATION_RECONCILIATION_FAILED',
      async () => {
        if (!signedTransactionInfo) {
          return null
        }
        const transaction = await this.signedData.verifyTransaction(signedTransactionInfo)
        return await this.reconcileVerifiedTransaction(transaction, {
          eventId: notificationId,
          eventType: String(notification.notificationType ?? 'notification'),
          notificationStatus: notification.data?.status,
          skipEventInsert: true,
        })
      },
    )

    return { accepted: true, duplicate: tracked.duplicate || (tracked.result?.duplicate ?? false) }
  }

  private async reconcileVerifiedTransaction(
    transaction: JWSTransactionDecodedPayload,
    context: ReconciliationContext,
  ) {
    const environment = normalizeAppStoreEnvironment(transaction.environment)
    const productId = transaction.productId?.trim()
    const originalTransactionId = transaction.originalTransactionId?.trim()
    const transactionId = transaction.transactionId?.trim()
    const appAccountToken = transaction.appAccountToken?.trim().toLowerCase()
    if (!environment || !productId || !originalTransactionId || !transactionId || !appAccountToken) {
      throw new BillingError('APP_STORE_TRANSACTION_MISSING_REQUIRED_FIELDS')
    }
    if (environment !== getAppStoreEnvironment()) {
      throw new BillingError('APP_STORE_ENVIRONMENT_MISMATCH')
    }
    const offer = await this.catalog.findOfferByProduct('app_store', environment, productId)
    if (!offer) {
      throw new BillingError('APP_STORE_PRODUCT_NOT_ALLOWLISTED')
    }

    const subject = await this.dbAccessor
      .get()
      .select()
      .from(billingSubjects)
      .where(eq(billingSubjects.appAccountToken, appAccountToken))
      .limit(1)
      .then(rows => rows[0] ?? null)
    // A subject goes missing when its workspace was deleted, and is tombstoned when the workspace
    // outlived a deleted owner. Apple keeps sending renewals either way, so an unattributable
    // notification is accepted and dropped — retrying it could never succeed.
    if (!subject || subject.tombstonedAt) {
      if (context.expectedTenantId || context.expectedOwnerUserId) {
        throw new BillingError(subject ? 'APP_STORE_BILLING_SUBJECT_TOMBSTONED' : 'APP_STORE_BILLING_SUBJECT_NOT_FOUND')
      }
      return {
        duplicate: false,
        ignored: true,
        originalTransactionId,
        status: 'revoked' as const,
        tenantId: subject?.tenantId ?? null,
        transactionId,
      }
    }
    if (context.expectedTenantId && subject.tenantId !== context.expectedTenantId) {
      throw new BillingError('APP_STORE_TRANSACTION_TENANT_MISMATCH')
    }
    if (
      context.expectedOwnerUserId
      && subject.billingOwnerUserId
      && subject.billingOwnerUserId !== context.expectedOwnerUserId
    ) {
      throw new BillingError('APP_STORE_TRANSACTION_OWNER_MISMATCH')
    }

    const status = this.resolveTransactionStatus(transaction, context.notificationStatus)
    const reconcile = async () =>
      await this.entitlements.reconcileSubscription({
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

    const outcome = context.skipEventInsert
      ? { duplicate: false, result: await reconcile() }
      : await this.providerEvents.track(
          {
            environment,
            eventId: context.eventId,
            externalSubscriptionId: originalTransactionId,
            payload: {
              eventType: context.eventType,
              originalTransactionId,
              productId,
              status,
              transactionId,
            },
            provider: 'app_store',
            signedAt: this.toIsoDate(transaction.signedDate),
          },
          'APP_STORE_RECONCILIATION_FAILED',
          reconcile,
        )

    return {
      duplicate: outcome.duplicate,
      originalTransactionId,
      projection: outcome.result,
      status,
      tenantId: subject.tenantId,
      transactionId,
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
      throw new BillingError('BILLING_SUBJECT_CREATION_FAILED')
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
    const grants = await this.dbAccessor
      .get()
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
}
