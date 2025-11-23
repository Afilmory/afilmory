import { generateId, tenants } from '@afilmory/db'
import { isTenantSlugReserved } from '@afilmory/utils'
import { DbAccessor } from 'core/database/database.provider'
import { BizException, ErrorCode } from 'core/errors'
import type { BillingPlanId } from 'core/modules/platform/billing/billing-plan.types'
import { desc, eq } from 'drizzle-orm'
import { injectable } from 'tsyringe'

import type { TenantAggregate } from './tenant.types'

@injectable()
export class TenantRepository {
  constructor(private readonly dbAccessor: DbAccessor) {}

  async findById(id: string): Promise<TenantAggregate | null> {
    const db = this.dbAccessor.get()
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, id)).limit(1)
    if (!tenant) {
      return null
    }
    return { tenant }
  }

  async findBySlug(slug: string): Promise<TenantAggregate | null> {
    const db = this.dbAccessor.get()
    const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, slug)).limit(1)

    if (!tenant) {
      return null
    }
    return { tenant }
  }

  async createTenant(payload: {
    name: string
    slug: string
    planId?: BillingPlanId
    storagePlanId?: string | null
  }): Promise<TenantAggregate> {
    const db = this.dbAccessor.get()
    const tenantId = generateId()
    const tenantRecord: typeof tenants.$inferInsert = {
      id: tenantId,
      name: payload.name,
      slug: payload.slug,
      planId: payload.planId ?? 'free',
      storagePlanId: payload.storagePlanId ?? null,
      status: 'active',
    }

    await db.insert(tenants).values(tenantRecord)

    return await this.findById(tenantId).then((aggregate) => {
      if (!aggregate) {
        throw new BizException(ErrorCode.COMMON_INTERNAL_SERVER_ERROR, {
          message: 'Failed to create tenant',
        })
      }
      return aggregate
    })
  }

  async deleteById(id: string): Promise<void> {
    const db = this.dbAccessor.get()
    await db.delete(tenants).where(eq(tenants.id, id))
  }

  async updatePlan(id: string, planId: BillingPlanId): Promise<void> {
    const db = this.dbAccessor.get()
    await db.update(tenants).set({ planId, updatedAt: new Date().toISOString() }).where(eq(tenants.id, id))
  }

  async updateBanned(id: string, banned: boolean): Promise<void> {
    const db = this.dbAccessor.get()
    await db.update(tenants).set({ banned, updatedAt: new Date().toISOString() }).where(eq(tenants.id, id))
  }

  async listTenants(): Promise<TenantAggregate[]> {
    const db = this.dbAccessor.get()
    const rows = await db.select().from(tenants).orderBy(desc(tenants.createdAt))

    // Ignore preseve slug
    return rows.filter((tenant) => !isTenantSlugReserved(tenant.slug)).map((tenant) => ({ tenant }))
  }
}
