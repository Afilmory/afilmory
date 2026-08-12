import { billingSubscriptions, photoAssets, tenantDomains } from '@afilmory/db'
import { DbAccessor } from '@core/database/database.provider'
import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { injectable } from 'tsyringe'

import type { BillingProvider } from '../billing-domain.types'

const ENTITLING_STATUSES = ['active', 'cancel_scheduled', 'grace_period', 'conflict'] as const

@injectable()
export class BillingOverviewRepository {
  constructor(private readonly dbAccessor: DbAccessor) {}

  async countLibraryItems(tenantId: string): Promise<number> {
    const [row] = await this.dbAccessor
      .get()
      .select({ total: sql<number>`count(*)` })
      .from(photoAssets)
      .where(eq(photoAssets.tenantId, tenantId))
    return Number(row?.total ?? 0)
  }

  async countCustomDomains(tenantId: string): Promise<number> {
    const [row] = await this.dbAccessor
      .get()
      .select({ total: sql<number>`count(*)` })
      .from(tenantDomains)
      .where(eq(tenantDomains.tenantId, tenantId))
    return Number(row?.total ?? 0)
  }

  async getActiveProvider(tenantId: string): Promise<BillingProvider | null> {
    const [row] = await this.dbAccessor
      .get()
      .select({ provider: billingSubscriptions.provider })
      .from(billingSubscriptions)
      .where(
        and(eq(billingSubscriptions.tenantId, tenantId), inArray(billingSubscriptions.status, [...ENTITLING_STATUSES])),
      )
      .orderBy(desc(billingSubscriptions.providerUpdatedAt))
      .limit(1)
    return row?.provider ?? null
  }
}
