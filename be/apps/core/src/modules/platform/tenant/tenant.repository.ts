import { generateId, tenants } from '@afilmory/db'
import { RESERVED_TENANT_SLUGS } from '@afilmory/utils'
import { DbAccessor } from '@core/database/database.provider'
import { BizException, ErrorCode } from '@core/errors'
import type { BillingPlanId } from '@core/modules/platform/billing/plan/billing-plan.types'
import { and, asc, count, desc, eq, ilike, isNotNull, notInArray, or } from 'drizzle-orm'
import { injectable } from 'tsyringe'

import type { TenantAggregate, TenantRecord } from './tenant.types'

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
    status?: TenantAggregate['tenant']['status']
  }): Promise<TenantAggregate> {
    const db = this.dbAccessor.get()
    const tenantId = generateId()
    const tenantRecord: typeof tenants.$inferInsert = {
      id: tenantId,
      name: payload.name,
      slug: payload.slug,
      planId: payload.planId ?? 'free',
      storagePlanId: payload.storagePlanId ?? null,
      status: payload.status ?? 'active',
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

  async updateBanned(id: string, banned: boolean): Promise<void> {
    const db = this.dbAccessor.get()
    await db.update(tenants).set({ banned, updatedAt: new Date().toISOString() }).where(eq(tenants.id, id))
  }

  async listTenants(options: {
    page: number
    limit: number
    search?: string
    status?: TenantRecord['status']
    sortBy?: 'createdAt' | 'name'
    sortDir?: 'asc' | 'desc'
    requireStoragePlan?: boolean
  }): Promise<{ items: TenantAggregate[], total: number }> {
    const db = this.dbAccessor.get()
    const { page, limit, search, status, sortBy = 'createdAt', sortDir = 'desc' } = options

    const conditions = [notInArray(tenants.slug, RESERVED_TENANT_SLUGS)]

    if (status) {
      conditions.push(eq(tenants.status, status))
    }

    if (options.requireStoragePlan) {
      conditions.push(isNotNull(tenants.storagePlanId))
    }

    if (search) {
      const searchLike = `%${search}%`
      conditions.push(or(ilike(tenants.name, searchLike), ilike(tenants.slug, searchLike)))
    }

    const where = and(...conditions)

    const [total] = await db.select({ count: count() }).from(tenants).where(where)

    let orderBy
    const sortColumn = sortBy === 'name' ? tenants.name : tenants.createdAt
    if (sortDir === 'asc') {
      orderBy = asc(sortColumn)
    }
    else {
      orderBy = desc(sortColumn)
    }

    const rows = await db
      .select()
      .from(tenants)
      .where(where)
      .limit(limit)
      .offset((page - 1) * limit)
      .orderBy(orderBy)

    return {
      items: rows.map(tenant => ({ tenant })),
      total: total?.count ?? 0,
    }
  }
}
