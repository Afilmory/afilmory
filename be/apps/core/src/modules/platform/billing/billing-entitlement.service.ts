import { billingEntitlements, billingSubscriptions, generateId, settings, tenants } from '@afilmory/db'
import { DbAccessor } from '@core/database/database.provider'
import { SettingService } from '@core/modules/configuration/setting/setting.service'
import { and, eq, sql } from 'drizzle-orm'
import { injectable } from 'tsyringe'

import { isByoStorageActive, selectEffectiveEntitlement, subscriptionGrantsEntitlement } from './billing.policy'
import type {
  BillingEntitlementKind,
  BillingProjection,
  BillingSubscriptionReconciliationInput,
} from './billing-domain.types'

const ACTIVE_PROVIDER_KEY = 'builder.storage.activeProvider'

@injectable()
export class BillingEntitlementService {
  constructor(
    private readonly dbAccessor: DbAccessor,
    private readonly settings: SettingService,
  ) {}

  async reconcileSubscription(input: BillingSubscriptionReconciliationInput): Promise<BillingProjection> {
    const db = this.dbAccessor.get()
    return await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${input.tenantId}))`)

      if (input.originalTransactionId) {
        const conflicting = await tx
          .select({ appAccountToken: billingSubscriptions.appAccountToken, tenantId: billingSubscriptions.tenantId })
          .from(billingSubscriptions)
          .where(
            and(
              eq(billingSubscriptions.provider, input.provider),
              eq(billingSubscriptions.environment, input.environment),
              eq(billingSubscriptions.originalTransactionId, input.originalTransactionId),
            ),
          )
          .limit(1)
          .then(rows => rows[0] ?? null)
        if (
          conflicting
          && (conflicting.tenantId !== input.tenantId || conflicting.appAccountToken !== input.appAccountToken)
        ) {
          throw new Error('BILLING_ORIGINAL_TRANSACTION_CONFLICT')
        }
      }

      const now = new Date().toISOString()
      const existingSubscription = await tx
        .select({
          id: billingSubscriptions.id,
          providerUpdatedAt: billingSubscriptions.providerUpdatedAt,
        })
        .from(billingSubscriptions)
        .where(
          and(
            eq(billingSubscriptions.provider, input.provider),
            eq(billingSubscriptions.environment, input.environment),
            eq(billingSubscriptions.externalSubscriptionId, input.externalSubscriptionId),
          ),
        )
        .limit(1)
        .then(rows => rows[0] ?? null)
      if (
        existingSubscription?.providerUpdatedAt
        && input.providerUpdatedAt
        && new Date(existingSubscription.providerUpdatedAt).getTime() > new Date(input.providerUpdatedAt).getTime()
      ) {
        return await this.projectWithTransaction(tx, input.tenantId)
      }

      const [subscription] = await tx
        .insert(billingSubscriptions)
        .values({
          id: generateId(),
          tenantId: input.tenantId,
          billingOwnerUserId: input.billingOwnerUserId ?? null,
          offerId: input.offerId,
          provider: input.provider,
          externalSubscriptionId: input.externalSubscriptionId,
          originalTransactionId: input.originalTransactionId ?? null,
          appAccountToken: input.appAccountToken ?? null,
          environment: input.environment,
          status: input.status,
          periodStart: input.periodStart ?? null,
          periodEnd: input.periodEnd ?? null,
          cancelAtPeriodEnd: input.status === 'cancel_scheduled',
          providerUpdatedAt: input.providerUpdatedAt ?? now,
          metadata: input.metadata ?? null,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [
            billingSubscriptions.provider,
            billingSubscriptions.environment,
            billingSubscriptions.externalSubscriptionId,
          ],
          set: {
            tenantId: input.tenantId,
            billingOwnerUserId: input.billingOwnerUserId ?? null,
            offerId: input.offerId,
            originalTransactionId: input.originalTransactionId ?? null,
            appAccountToken: input.appAccountToken ?? null,
            status: input.status,
            periodStart: input.periodStart ?? null,
            periodEnd: input.periodEnd ?? null,
            cancelAtPeriodEnd: input.status === 'cancel_scheduled',
            providerUpdatedAt: input.providerUpdatedAt ?? now,
            metadata: input.metadata ?? null,
            updatedAt: now,
          },
        })
        .returning()

      if (!subscription) {
        throw new Error('BILLING_SUBSCRIPTION_UPSERT_FAILED')
      }

      await tx
        .update(billingEntitlements)
        .set({ status: 'inactive', updatedAt: now })
        .where(
          and(eq(billingEntitlements.sourceType, 'subscription'), eq(billingEntitlements.sourceId, subscription.id)),
        )

      if (subscriptionGrantsEntitlement(input.status, input.periodEnd)) {
        const grants: Array<{ kind: BillingEntitlementKind, value: string }> = []
        if (input.applicationPlanId) {
          grants.push({ kind: 'application_plan', value: input.applicationPlanId })
        }
        if (input.storagePlanId) {
          grants.push({ kind: 'managed_storage', value: input.storagePlanId })
        }
        for (const grant of grants) {
          await tx
            .insert(billingEntitlements)
            .values({
              id: generateId(),
              tenantId: input.tenantId,
              kind: grant.kind,
              value: grant.value,
              sourceType: 'subscription',
              sourceId: subscription.id,
              status: 'active',
              rank: input.rank,
              startsAt: input.periodStart ?? now,
              endsAt: input.periodEnd ?? null,
              updatedAt: now,
            })
            .onConflictDoUpdate({
              target: [billingEntitlements.sourceType, billingEntitlements.sourceId, billingEntitlements.kind],
              set: {
                tenantId: input.tenantId,
                value: grant.value,
                status: 'active',
                rank: input.rank,
                startsAt: input.periodStart ?? now,
                endsAt: input.periodEnd ?? null,
                updatedAt: now,
              },
            })
        }
      }

      return await this.projectWithTransaction(tx, input.tenantId)
    })
  }

  async setManualGrant(input: {
    kind: BillingEntitlementKind
    sourceId: string
    tenantId: string
    value: string | null
  }): Promise<BillingProjection> {
    const db = this.dbAccessor.get()
    return await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${input.tenantId}))`)
      const now = new Date().toISOString()
      await tx
        .update(billingEntitlements)
        .set({ status: 'inactive', updatedAt: now })
        .where(
          and(
            eq(billingEntitlements.sourceType, 'manual'),
            eq(billingEntitlements.sourceId, input.sourceId),
            eq(billingEntitlements.kind, input.kind),
          ),
        )
      if (input.value) {
        await tx
          .insert(billingEntitlements)
          .values({
            id: generateId(),
            tenantId: input.tenantId,
            kind: input.kind,
            value: input.value,
            sourceType: 'manual',
            sourceId: input.sourceId,
            status: 'active',
            rank: 100000,
            startsAt: now,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: [billingEntitlements.sourceType, billingEntitlements.sourceId, billingEntitlements.kind],
            set: { tenantId: input.tenantId, value: input.value, status: 'active', startsAt: now, updatedAt: now },
          })
      }
      return await this.projectWithTransaction(tx, input.tenantId)
    })
  }

  async projectTenant(tenantId: string): Promise<BillingProjection> {
    const db = this.dbAccessor.get()
    return await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${tenantId}))`)
      return await this.projectWithTransaction(tx, tenantId)
    })
  }

  async revokeSubscription(subscriptionId: string, tenantId: string): Promise<BillingProjection> {
    const db = this.dbAccessor.get()
    return await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${tenantId}))`)
      const subscription = await tx
        .select({
          id: billingSubscriptions.id,
          metadata: billingSubscriptions.metadata,
          tenantId: billingSubscriptions.tenantId,
        })
        .from(billingSubscriptions)
        .where(eq(billingSubscriptions.id, subscriptionId))
        .limit(1)
        .then(rows => rows[0] ?? null)
      if (!subscription || subscription.tenantId !== tenantId) {
        throw new Error('BILLING_SUBSCRIPTION_NOT_FOUND')
      }
      const now = new Date().toISOString()
      await tx
        .update(billingSubscriptions)
        .set({
          cancelAtPeriodEnd: false,
          metadata: { ...(subscription.metadata ?? {}), revokedReason: 'account_deletion' },
          providerUpdatedAt: now,
          status: 'revoked',
          updatedAt: now,
        })
        .where(eq(billingSubscriptions.id, subscription.id))
      await tx
        .update(billingEntitlements)
        .set({ status: 'inactive', updatedAt: now })
        .where(
          and(eq(billingEntitlements.sourceType, 'subscription'), eq(billingEntitlements.sourceId, subscription.id)),
        )
      return await this.projectWithTransaction(tx, tenantId)
    })
  }

  private async projectWithTransaction(
    tx: Parameters<Parameters<ReturnType<DbAccessor['get']>['transaction']>[0]>[0],
    tenantId: string,
  ): Promise<BillingProjection> {
    const records = await tx
      .select({
        endsAt: billingEntitlements.endsAt,
        kind: billingEntitlements.kind,
        rank: billingEntitlements.rank,
        sourceType: billingEntitlements.sourceType,
        startsAt: billingEntitlements.startsAt,
        value: billingEntitlements.value,
      })
      .from(billingEntitlements)
      .where(and(eq(billingEntitlements.tenantId, tenantId), eq(billingEntitlements.status, 'active')))

    const applicationPlan = selectEffectiveEntitlement(records.filter(record => record.kind === 'application_plan'))
    const storagePlan = selectEffectiveEntitlement(records.filter(record => record.kind === 'managed_storage'))
    const projection = {
      applicationPlanId: applicationPlan?.value ?? 'free',
      storagePlanId: storagePlan?.value ?? null,
    }
    await tx
      .update(tenants)
      .set({
        planId: projection.applicationPlanId,
        storagePlanId: projection.storagePlanId,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(tenants.id, tenantId))

    if (projection.storagePlanId) {
      await this.activateManagedStorageWhenNoByo(tx, tenantId)
    }
    return projection
  }

  private async activateManagedStorageWhenNoByo(
    tx: Parameters<Parameters<ReturnType<DbAccessor['get']>['transaction']>[0]>[0],
    tenantId: string,
  ): Promise<void> {
    const activeProviderValue = await this.settings.get(ACTIVE_PROVIDER_KEY, { tenantId })
    const storageProviders = await this.settings.getStorageProvidersRaw({ tenantId })
    const activeProvider = activeProviderValue?.trim() ?? ''
    const byoProviderIds = new Set(storageProviders.map(provider => provider.id))
    if (isByoStorageActive(activeProvider, byoProviderIds)) {
      return
    }

    const now = new Date().toISOString()
    await tx
      .insert(settings)
      .values({
        id: generateId(),
        tenantId,
        key: ACTIVE_PROVIDER_KEY,
        value: 'managed',
        isSensitive: false,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [settings.tenantId, settings.key],
        set: { value: 'managed', isSensitive: false, updatedAt: now },
      })
  }
}
