import { billingOffers, billingSubscriptions, tenantMemberships, tenants } from '@afilmory/db'
import { DbAccessor } from '@core/database/database.provider'
import { SettingService } from '@core/modules/configuration/setting/setting.service'
import {
  MANAGED_STORAGE_PROVIDER_ID,
  STORAGE_ACTIVE_PROVIDER_SETTING_KEY,
} from '@core/modules/configuration/setting/storage-provider.constants'
import { isByoStorageActive } from '@core/modules/configuration/setting/storage-provider.utils'
import { BillingCatalogService } from '@core/modules/platform/billing/catalog/billing-catalog.service'
import { AppStoreBillingService } from '@core/modules/platform/billing/providers/app-store/app-store-billing.service'
import { and, desc, eq } from 'drizzle-orm'
import { injectable } from 'tsyringe'

import { deriveMobileOnboardingState } from './mobile-onboarding.policy'

const RECOVERABLE_SUBSCRIPTION_STATUSES = ['billing_retry', 'expired', 'revoked']
const CURRENT_SUBSCRIPTION_STATUSES = ['active', 'cancel_scheduled', 'conflict', 'grace_period', 'pending']

@injectable()
export class MobileOnboardingService {
  constructor(
    private readonly dbAccessor: DbAccessor,
    private readonly catalog: BillingCatalogService,
    private readonly appStore: AppStoreBillingService,
    private readonly settings: SettingService,
  ) {}

  async getReadiness(userId: string, activeTenantId: string | null) {
    if (!activeTenantId) {
      return this.workspaceRequired()
    }
    const db = this.dbAccessor.get()
    const membership = await db
      .select({
        id: tenantMemberships.id,
        role: tenantMemberships.role,
        status: tenantMemberships.status,
        workspaceId: tenants.id,
        workspaceName: tenants.name,
        workspaceSlug: tenants.slug,
        storagePlanId: tenants.storagePlanId,
      })
      .from(tenantMemberships)
      .innerJoin(tenants, eq(tenants.id, tenantMemberships.tenantId))
      .where(and(eq(tenantMemberships.userId, userId), eq(tenantMemberships.tenantId, activeTenantId)))
      .limit(1)
      .then(rows => rows[0] ?? null)
    if (!membership || membership.status !== 'active') {
      return this.workspaceRequired()
    }

    const activeProviderValue = await this.settings.get(STORAGE_ACTIVE_PROVIDER_SETTING_KEY, {
      tenantId: activeTenantId,
    })
    const storageProviders = await this.settings.getStorageProvidersRaw({ tenantId: activeTenantId })
    const subscriptions = await db
      .select({
        offerStoragePlanId: billingOffers.storagePlanId,
        provider: billingSubscriptions.provider,
        status: billingSubscriptions.status,
        periodEnd: billingSubscriptions.periodEnd,
      })
      .from(billingSubscriptions)
      .innerJoin(billingOffers, eq(billingOffers.id, billingSubscriptions.offerId))
      .where(eq(billingSubscriptions.tenantId, activeTenantId))
      .orderBy(desc(billingSubscriptions.providerUpdatedAt), desc(billingSubscriptions.updatedAt))
    const offers = membership.role === 'owner' ? await this.catalog.listAppStoreOffers() : []

    const activeProvider = activeProviderValue?.trim() || null
    const byoProviderIds = new Set(storageProviders.map(provider => provider.id))
    const hasByoStorage = isByoStorageActive(activeProvider, byoProviderIds)
    const hasManagedStorage = Boolean(membership.storagePlanId)
    const purchasePending = subscriptions.some(subscription => subscription.status === 'pending')
    const hasRecoverableManagedHistory
      = subscriptions.some(
        subscription =>
          Boolean(subscription.offerStoragePlanId) && RECOVERABLE_SUBSCRIPTION_STATUSES.includes(subscription.status),
      )
      || (activeProvider === MANAGED_STORAGE_PROVIDER_ID && !hasManagedStorage)
    const currentSubscription
      = subscriptions.find(subscription => CURRENT_SUBSCRIPTION_STATUSES.includes(subscription.status)) ?? null
    const state = deriveMobileOnboardingState({
      hasByoStorage,
      hasManagedStorage,
      hasRecoverableManagedHistory,
      membershipRole: membership.role,
      purchasePending,
      workspaceId: membership.workspaceId,
    })

    return {
      state,
      workspace: {
        id: membership.workspaceId,
        name: membership.workspaceName,
        slug: membership.workspaceSlug,
      },
      membership: { role: membership.role },
      permissions: {
        canConfigureByo: membership.role === 'admin' || membership.role === 'owner',
        canPurchase: membership.role === 'owner',
      },
      storage: {
        activeProvider,
        hasByoStorage,
        hasManagedStorage,
        managedPlanId: membership.storagePlanId,
        recoveryRequired: hasRecoverableManagedHistory && !hasByoStorage && !hasManagedStorage,
      },
      subscription: currentSubscription
        ? {
            cancelAtPeriodEnd: currentSubscription.status === 'cancel_scheduled',
            periodEnd: currentSubscription.periodEnd,
            provider: currentSubscription.provider,
            status: currentSubscription.status,
          }
        : null,
      appStore: {
        configured: this.appStore.isConfigured(),
        offers,
      },
    }
  }

  private workspaceRequired() {
    return {
      state: 'workspace_required' as const,
      workspace: null,
      membership: null,
      permissions: { canConfigureByo: false, canPurchase: false },
      storage: {
        activeProvider: null,
        hasByoStorage: false,
        hasManagedStorage: false,
        managedPlanId: null,
        recoveryRequired: false,
      },
      subscription: null,
      appStore: { configured: this.appStore.isConfigured(), offers: [] },
    }
  }
}
