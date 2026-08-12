import type { OnModuleInit } from '@tsuki-hono/common'
import { createLogger } from '@tsuki-hono/common'
import { OnEvent } from '@tsuki-hono/event-emitter'
import { injectable } from 'tsyringe'

import { BILLING_PLAN_PRODUCTS_SETTING_KEY } from '../plan/billing-plan.constants'
import { STORAGE_PLAN_CATALOG_SETTING_KEY, STORAGE_PLAN_PRODUCTS_SETTING_KEY } from '../plan/storage-plan.constants'
import { BillingCatalogService } from './billing-catalog.service'

const CATALOG_SOURCE_KEYS = new Set<string>([
  BILLING_PLAN_PRODUCTS_SETTING_KEY,
  STORAGE_PLAN_CATALOG_SETTING_KEY,
  STORAGE_PLAN_PRODUCTS_SETTING_KEY,
])

@injectable()
export class BillingCatalogListener implements OnModuleInit {
  private readonly logger = createLogger('BillingCatalogListener')

  constructor(private readonly catalog: BillingCatalogService) {}

  async onModuleInit(): Promise<void> {
    await this.synchronize()
  }

  @OnEvent('system.setting.updated')
  async handleSettingUpdated(event: { key: string }): Promise<void> {
    if (!CATALOG_SOURCE_KEYS.has(event.key)) {
      return
    }
    await this.synchronize()
  }

  private async synchronize(): Promise<void> {
    try {
      await this.catalog.synchronizeConfiguredProducts()
    }
    catch (error) {
      this.logger.error('Failed to synchronize the billing offer catalog', error)
    }
  }
}
