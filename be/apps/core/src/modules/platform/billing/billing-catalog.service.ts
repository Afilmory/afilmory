import { billingOfferProducts, billingOffers, generateId } from '@afilmory/db'
import { env } from '@afilmory/env'
import { DbAccessor } from '@core/database/database.provider'
import { SystemSettingService } from '@core/modules/configuration/system-setting/system-setting.service'
import { and, eq } from 'drizzle-orm'
import { injectable } from 'tsyringe'

import type { BillingProvider } from './billing-domain.types'
import { BILLING_PLAN_DEFINITIONS } from './billing-plan.constants'
import { DEFAULT_STORAGE_PLAN_CATALOG } from './storage-plan.constants'

export function getAppStoreEnvironment(): 'production' | 'sandbox' {
  return env.NODE_ENV === 'production' ? 'production' : 'sandbox'
}

export function getCreemEnvironment(): 'production' | 'test' {
  return env.NODE_ENV === 'production' ? 'production' : 'test'
}

export function normalizeAppStoreEnvironment(value: string | null | undefined): 'production' | 'sandbox' | null {
  switch (value?.trim().toLowerCase()) {
    case 'production': {
      return 'production'
    }
    case 'sandbox':
    case 'xcode':
    case 'localtesting': {
      return 'sandbox'
    }
    default: {
      return null
    }
  }
}

export interface BillingPurchaseOffer {
  applicationPlanId: string | null
  description: string | null
  externalProductId: string
  id: string
  name: string
  rank: number
  storageCapacityBytes: number | null
  storagePlanId: string | null
}

@injectable()
export class BillingCatalogService {
  constructor(
    private readonly dbAccessor: DbAccessor,
    private readonly systemSettings: SystemSettingService,
  ) {}

  async synchronizeConfiguredProducts(): Promise<void> {
    const planProducts = await this.systemSettings.getBillingPlanProducts()
    const storageProducts = await this.systemSettings.getStoragePlanProducts()
    const storageCatalog = await this.systemSettings.getStoragePlanCatalog()

    for (const [planId, products] of Object.entries(planProducts)) {
      const definition = BILLING_PLAN_DEFINITIONS[planId as keyof typeof BILLING_PLAN_DEFINITIONS]
      if (!definition || !products) {
        continue
      }
      await this.ensureOffer({
        applicationPlanId: planId,
        description: definition.description,
        id: `plan:${planId}`,
        name: definition.name,
        rank: planId === 'friend' ? 1000 : planId === 'pro' ? 100 : 0,
        storagePlanId: null,
      })
      await this.synchronizeProductsForOffer(`plan:${planId}`, products)
    }

    const mergedStorageCatalog = { ...DEFAULT_STORAGE_PLAN_CATALOG, ...storageCatalog }
    for (const [storagePlanId, products] of Object.entries(storageProducts)) {
      const definition = mergedStorageCatalog[storagePlanId]
      if (!definition || !products) {
        continue
      }
      await this.ensureOffer({
        applicationPlanId: null,
        description: definition.description ?? null,
        id: `storage:${storagePlanId}`,
        name: definition.name,
        rank: this.storageRank(definition.capacityBytes),
        storagePlanId,
      })
      await this.synchronizeProductsForOffer(`storage:${storagePlanId}`, products)
    }
  }

  async resolveCreemOffer(input: {
    applicationPlanId: string | null
    externalProductId: string
    storagePlanId: string | null
  }): Promise<BillingPurchaseOffer | null> {
    await this.synchronizeConfiguredProducts()
    const environment = getCreemEnvironment()
    const configured = await this.findOfferByProduct('creem', environment, input.externalProductId)
    if (configured) {
      return configured
    }

    const offerId = input.applicationPlanId
      ? `plan:${input.applicationPlanId}`
      : input.storagePlanId
        ? `storage:${input.storagePlanId}`
        : null
    if (!offerId) {
      return null
    }
    const planDefinition = input.applicationPlanId
      ? BILLING_PLAN_DEFINITIONS[input.applicationPlanId as keyof typeof BILLING_PLAN_DEFINITIONS]
      : null
    const storageCatalog = input.storagePlanId
      ? { ...DEFAULT_STORAGE_PLAN_CATALOG, ...(await this.systemSettings.getStoragePlanCatalog()) }
      : null
    const storageDefinition = input.storagePlanId && storageCatalog ? storageCatalog[input.storagePlanId] : null
    if ((input.applicationPlanId && !planDefinition) || (input.storagePlanId && !storageDefinition)) {
      return null
    }
    await this.ensureOffer({
      applicationPlanId: input.applicationPlanId,
      description: planDefinition?.description ?? storageDefinition?.description ?? null,
      id: offerId,
      name: planDefinition?.name ?? storageDefinition?.name ?? offerId,
      rank: planDefinition
        ? input.applicationPlanId === 'friend'
          ? 1000
          : input.applicationPlanId === 'pro'
            ? 100
            : 0
        : this.storageRank(storageDefinition?.capacityBytes),
      storagePlanId: input.storagePlanId,
    })
    await this.upsertProduct(offerId, 'creem', environment, input.externalProductId)
    return await this.findOfferByProduct('creem', environment, input.externalProductId)
  }

  async getAppStoreOffer(offerId: string): Promise<BillingPurchaseOffer | null> {
    await this.synchronizeConfiguredProducts()
    return await this.findOfferById('app_store', getAppStoreEnvironment(), offerId)
  }

  async listAppStoreOffers(): Promise<BillingPurchaseOffer[]> {
    await this.synchronizeConfiguredProducts()
    const db = this.dbAccessor.get()
    const environment = getAppStoreEnvironment()
    const rows = await db
      .select({
        applicationPlanId: billingOffers.applicationPlanId,
        description: billingOffers.description,
        externalProductId: billingOfferProducts.externalProductId,
        id: billingOffers.id,
        name: billingOffers.name,
        rank: billingOffers.rank,
        storagePlanId: billingOffers.storagePlanId,
      })
      .from(billingOfferProducts)
      .innerJoin(billingOffers, eq(billingOffers.id, billingOfferProducts.offerId))
      .where(
        and(
          eq(billingOfferProducts.provider, 'app_store'),
          eq(billingOfferProducts.environment, environment),
          eq(billingOffers.isActive, true),
        ),
      )
    const storageCatalog = { ...DEFAULT_STORAGE_PLAN_CATALOG, ...(await this.systemSettings.getStoragePlanCatalog()) }
    return rows
      .map(row => ({
        ...row,
        storageCapacityBytes: row.storagePlanId ? (storageCatalog[row.storagePlanId]?.capacityBytes ?? null) : null,
      }))
      .sort((left, right) => left.rank - right.rank)
  }

  async findOfferByProduct(
    provider: BillingProvider,
    environment: string,
    externalProductId: string,
  ): Promise<BillingPurchaseOffer | null> {
    const db = this.dbAccessor.get()
    const [row] = await db
      .select({
        applicationPlanId: billingOffers.applicationPlanId,
        description: billingOffers.description,
        externalProductId: billingOfferProducts.externalProductId,
        id: billingOffers.id,
        name: billingOffers.name,
        rank: billingOffers.rank,
        storagePlanId: billingOffers.storagePlanId,
      })
      .from(billingOfferProducts)
      .innerJoin(billingOffers, eq(billingOffers.id, billingOfferProducts.offerId))
      .where(
        and(
          eq(billingOfferProducts.provider, provider),
          eq(billingOfferProducts.environment, environment),
          eq(billingOfferProducts.externalProductId, externalProductId),
          eq(billingOffers.isActive, true),
        ),
      )
      .limit(1)
    if (!row) {
      return null
    }
    const storageCatalog = { ...DEFAULT_STORAGE_PLAN_CATALOG, ...(await this.systemSettings.getStoragePlanCatalog()) }
    return {
      ...row,
      storageCapacityBytes: row.storagePlanId ? (storageCatalog[row.storagePlanId]?.capacityBytes ?? null) : null,
    }
  }

  private async findOfferById(
    provider: BillingProvider,
    environment: string,
    offerId: string,
  ): Promise<BillingPurchaseOffer | null> {
    const db = this.dbAccessor.get()
    const [product] = await db
      .select({ externalProductId: billingOfferProducts.externalProductId })
      .from(billingOfferProducts)
      .where(
        and(
          eq(billingOfferProducts.offerId, offerId),
          eq(billingOfferProducts.provider, provider),
          eq(billingOfferProducts.environment, environment),
        ),
      )
      .limit(1)
    return product ? await this.findOfferByProduct(provider, environment, product.externalProductId) : null
  }

  private async synchronizeProductsForOffer(
    offerId: string,
    products: { appStoreProductId?: string | null, creemProductId?: string | null },
  ): Promise<void> {
    if (products.creemProductId?.trim()) {
      await this.upsertProduct(offerId, 'creem', getCreemEnvironment(), products.creemProductId.trim())
    }
    if (products.appStoreProductId?.trim()) {
      const productId = products.appStoreProductId.trim()
      await this.upsertProduct(offerId, 'app_store', 'sandbox', productId)
      await this.upsertProduct(offerId, 'app_store', 'production', productId)
    }
  }

  private async ensureOffer(input: {
    applicationPlanId: string | null
    description: string | null
    id: string
    name: string
    rank: number
    storagePlanId: string | null
  }): Promise<void> {
    const db = this.dbAccessor.get()
    await db
      .insert(billingOffers)
      .values({ ...input, isActive: true, updatedAt: new Date().toISOString() })
      .onConflictDoUpdate({
        target: billingOffers.id,
        set: {
          applicationPlanId: input.applicationPlanId,
          description: input.description,
          name: input.name,
          rank: input.rank,
          storagePlanId: input.storagePlanId,
          isActive: true,
          updatedAt: new Date().toISOString(),
        },
      })
  }

  private async upsertProduct(
    offerId: string,
    provider: BillingProvider,
    environment: string,
    externalProductId: string,
  ): Promise<void> {
    const db = this.dbAccessor.get()
    await db
      .insert(billingOfferProducts)
      .values({ id: generateId(), offerId, provider, environment, externalProductId })
      .onConflictDoUpdate({
        target: [
          billingOfferProducts.provider,
          billingOfferProducts.environment,
          billingOfferProducts.externalProductId,
        ],
        set: { offerId, updatedAt: new Date().toISOString() },
      })
  }

  private storageRank(capacityBytes: number | null | undefined): number {
    if (capacityBytes === null) {
      return 10000
    }
    return Math.max(1, Math.floor((capacityBytes ?? 0) / 1024 / 1024 / 1024))
  }
}
