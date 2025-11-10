import { generateId, tenants } from '@afilmory/db'
import { DbAccessor } from 'core/database/database.provider'
import { BizException, ErrorCode } from 'core/errors'
import { eq } from 'drizzle-orm'
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

  async createTenant(payload: { name: string; slug: string }): Promise<TenantAggregate> {
    const db = this.dbAccessor.get()
    const tenantId = generateId()
    const tenantRecord: typeof tenants.$inferInsert = {
      id: tenantId,
      name: payload.name,
      slug: payload.slug,
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
}
