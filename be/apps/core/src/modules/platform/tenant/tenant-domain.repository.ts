import { tenantDomains, tenants } from '@afilmory/db'
import { DbAccessor } from 'core/database/database.provider'
import { BizException, ErrorCode } from 'core/errors'
import { and, desc, eq } from 'drizzle-orm'
import { injectable } from 'tsyringe'

import type { TenantDomainAggregate, TenantDomainRecord } from './tenant.types'

@injectable()
export class TenantDomainRepository {
  constructor(private readonly dbAccessor: DbAccessor) {}

  async findActiveByDomain(domain: string): Promise<TenantDomainAggregate | null> {
    const db = this.dbAccessor.get()
    const [row] = await db
      .select({
        tenant: tenants,
        domain: tenantDomains,
      })
      .from(tenantDomains)
      .innerJoin(tenants, eq(tenantDomains.tenantId, tenants.id))
      .where(and(eq(tenantDomains.domain, domain), eq(tenantDomains.status, 'verified')))
      .limit(1)

    if (!row) {
      return null
    }
    return { tenant: row.tenant, domain: row.domain }
  }

  async findByDomain(domain: string): Promise<TenantDomainAggregate | null> {
    const db = this.dbAccessor.get()
    const [row] = await db
      .select({
        tenant: tenants,
        domain: tenantDomains,
      })
      .from(tenantDomains)
      .innerJoin(tenants, eq(tenantDomains.tenantId, tenants.id))
      .where(eq(tenantDomains.domain, domain))
      .limit(1)

    if (!row) {
      return null
    }
    return { tenant: row.tenant, domain: row.domain }
  }

  async findById(id: string): Promise<TenantDomainAggregate | null> {
    const db = this.dbAccessor.get()
    const [row] = await db
      .select({
        tenant: tenants,
        domain: tenantDomains,
      })
      .from(tenantDomains)
      .innerJoin(tenants, eq(tenantDomains.tenantId, tenants.id))
      .where(eq(tenantDomains.id, id))
      .limit(1)

    if (!row) {
      return null
    }

    return {
      tenant: row.tenant,
      domain: row.domain,
    }
  }

  async listByTenant(tenantId: string): Promise<TenantDomainRecord[]> {
    const db = this.dbAccessor.get()
    return await db
      .select()
      .from(tenantDomains)
      .where(eq(tenantDomains.tenantId, tenantId))
      .orderBy(desc(tenantDomains.createdAt))
  }

  async createDomain(payload: {
    tenantId: string
    domain: string
    verificationToken: string
  }): Promise<TenantDomainAggregate> {
    const db = this.dbAccessor.get()
    await db.insert(tenantDomains).values({
      tenantId: payload.tenantId,
      domain: payload.domain,
      status: 'pending',
      verificationToken: payload.verificationToken,
    })

    const aggregate = await this.findByDomain(payload.domain)
    if (!aggregate) {
      throw new BizException(ErrorCode.COMMON_INTERNAL_SERVER_ERROR, { message: 'Failed to create tenant domain' })
    }

    return aggregate
  }

  async updateDomain(
    id: string,
    patch: Partial<Pick<TenantDomainRecord, 'status' | 'verificationToken' | 'verifiedAt'>>,
  ): Promise<TenantDomainAggregate> {
    const db = this.dbAccessor.get()
    await db
      .update(tenantDomains)
      .set({
        ...patch,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(tenantDomains.id, id))

    const aggregate = await this.findById(id)
    if (!aggregate) {
      throw new BizException(ErrorCode.COMMON_INTERNAL_SERVER_ERROR, { message: 'Failed to update tenant domain' })
    }

    return aggregate
  }

  async deleteDomain(id: string): Promise<void> {
    const db = this.dbAccessor.get()
    await db.delete(tenantDomains).where(eq(tenantDomains.id, id))
  }
}
