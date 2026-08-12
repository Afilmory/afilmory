import { billingEntitlements, billingSubscriptions, generateId, settings, tenants } from '@afilmory/db'
import { DbAccessor } from '@core/database/database.provider'
import { SettingService } from '@core/modules/configuration/setting/setting.service'
import {
  MANAGED_STORAGE_PROVIDER_ID,
  STORAGE_ACTIVE_PROVIDER_SETTING_KEY,
} from '@core/modules/configuration/setting/storage-provider.constants'
import { isByoStorageActive } from '@core/modules/configuration/setting/storage-provider.utils'
import { TenantDomainService } from '@core/modules/platform/tenant/tenant-domain.service'
import { and, eq, sql } from 'drizzle-orm'
import { injectable } from 'tsyringe'

import { BillingError } from '../billing.error'
import type {
  BillingEntitlementKind,
  BillingProjection,
  BillingSubscriptionReconciliationInput,
} from '../billing-domain.types'
import {
  selectEffectiveEntitlement,
  shouldReleaseCustomDomains,
  subscriptionGrantsEntitlement,
} from './billing-entitlement.policy'

type BillingTransaction = Parameters<Parameters<ReturnType<DbAccessor['get']>['transaction']>[0]>[0]

interface TenantProjectionResult {
  downgradedToFree: boolean
  projection: BillingProjection
}

@injectable()
export class BillingEntitlementService {
  constructor(
    private readonly dbAccessor: DbAccessor,
    private readonly settings: SettingService,
    private readonly tenantDomains: TenantDomainService,
  ) {}

  async reconcileSubscription(input: BillingSubscriptionReconciliationInput): Promise<BillingProjection> {
    return await this.runTenantTransaction(input.tenantId, async (tx) => {
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
          throw new BillingError('BILLING_ORIGINAL_TRANSACTION_CONFLICT')
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
        throw new BillingError('BILLING_SUBSCRIPTION_UPSERT_FAILED')
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
    return await this.runTenantTransaction(input.tenantId, async (tx) => {
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
    return await this.runTenantTransaction(tenantId, async tx => await this.projectWithTransaction(tx, tenantId))
  }

  async revokeSubscription(subscriptionId: string, tenantId: string): Promise<BillingProjection> {
    return await this.runTenantTransaction(tenantId, async (tx) => {
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
        throw new BillingError('BILLING_SUBSCRIPTION_NOT_FOUND')
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

  private async runTenantTransaction(
    tenantId: string,
    body: (tx: BillingTransaction) => Promise<TenantProjectionResult>,
  ): Promise<BillingProjection> {
    const db = this.dbAccessor.get()
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${tenantId}))`)
      return await body(tx)
    })

    // Cloudflare hostname deletion is not transactional, so it runs after the commit and is
    // allowed to throw: the provider webhook retries and the tenant is already on free.
    if (result.downgradedToFree) {
      await this.tenantDomains.deleteDomainsForTenant(tenantId)
    }
    return result.projection
  }

  private async projectWithTransaction(tx: BillingTransaction, tenantId: string): Promise<TenantProjectionResult> {
    const previous = await tx
      .select({ planId: tenants.planId })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1)
      .then(rows => rows[0] ?? null)

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
    return {
      downgradedToFree: shouldReleaseCustomDomains(previous?.planId, projection.applicationPlanId),
      projection,
    }
  }

  private async activateManagedStorageWhenNoByo(tx: BillingTransaction, tenantId: string): Promise<void> {
    const activeProviderValue = await this.settings.get(STORAGE_ACTIVE_PROVIDER_SETTING_KEY, { tenantId })
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
        key: STORAGE_ACTIVE_PROVIDER_SETTING_KEY,
        value: MANAGED_STORAGE_PROVIDER_ID,
        isSensitive: false,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [settings.tenantId, settings.key],
        set: { value: MANAGED_STORAGE_PROVIDER_ID, isSensitive: false, updatedAt: now },
      })
  }
}
