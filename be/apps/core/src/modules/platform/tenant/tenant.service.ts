import { isTenantSlugReserved } from '@afilmory/utils'
import { BizException, ErrorCode } from '@core/errors'
import { normalizeString } from '@core/helpers/normalize.helper'
import type { BillingPlanId } from '@core/modules/platform/billing/plan/billing-plan.types'
import { injectable } from 'tsyringe'

import { PENDING_TENANT_DEFAULT_NAME, ROOT_TENANT_NAME, ROOT_TENANT_SLUG } from './tenant.constants'
import { TenantRepository } from './tenant.repository'
import type { TenantAggregate, TenantContext, TenantRecord, TenantResolutionInput } from './tenant.types'

@injectable()
export class TenantService {
  constructor(private readonly repository: TenantRepository) {}

  async createTenant(payload: {
    name: string
    slug: string
    planId?: BillingPlanId
    storagePlanId?: string | null
    status?: TenantRecord['status']
  }): Promise<TenantAggregate> {
    const normalizedSlug = this.normalizeSlug(payload.slug)

    if (!normalizedSlug) {
      throw new BizException(ErrorCode.COMMON_VALIDATION, {
        message: 'Tenant slug is required',
      })
    }

    if (isTenantSlugReserved(normalizedSlug)) {
      throw new BizException(ErrorCode.TENANT_SLUG_RESERVED)
    }

    return await this.repository.createTenant({
      ...payload,
      slug: normalizedSlug,
    })
  }

  async ensureRootTenant(): Promise<TenantAggregate> {
    const existing = await this.repository.findBySlug(ROOT_TENANT_SLUG)
    if (existing) {
      return existing
    }

    return await this.repository.createTenant({
      name: ROOT_TENANT_NAME,
      slug: ROOT_TENANT_SLUG,
    })
  }

  async resolve(
    input: TenantResolutionInput,
    options?: { noThrow?: boolean, allowPending?: boolean },
  ): Promise<TenantContext | null> {
    const { noThrow = false, allowPending = false } = options ?? {}
    const tenantId = normalizeString(input.tenantId)
    const slug = this.normalizeSlug(input.slug)

    let aggregate: TenantAggregate | null = null

    if (!tenantId && !slug) {
      if (noThrow) {
        return null
      }
      throw new BizException(ErrorCode.TENANT_NOT_FOUND)
    }

    if (tenantId) {
      aggregate = await this.repository.findById(tenantId)
    }

    if (!aggregate && slug) {
      aggregate = await this.repository.findBySlug(slug)
    }

    if (!aggregate) {
      if (noThrow) {
        return null
      }
      throw new BizException(ErrorCode.TENANT_NOT_FOUND)
    }

    this.ensureTenantIsActive(aggregate.tenant, { allowPending })

    return {
      tenant: aggregate.tenant,
    }
  }

  async getById(id: string, options?: { allowPending?: boolean }): Promise<TenantAggregate> {
    const aggregate = await this.repository.findById(id)
    if (!aggregate) {
      throw new BizException(ErrorCode.TENANT_NOT_FOUND)
    }
    this.ensureTenantIsActive(aggregate.tenant, { allowPending: options?.allowPending ?? false })
    return aggregate
  }

  async getBySlug(slug: string, options?: { allowPending?: boolean }): Promise<TenantAggregate> {
    const normalized = this.normalizeSlug(slug)
    if (!normalized) {
      throw new BizException(ErrorCode.TENANT_NOT_FOUND)
    }

    const aggregate = await this.repository.findBySlug(normalized)
    if (!aggregate) {
      throw new BizException(ErrorCode.TENANT_NOT_FOUND)
    }
    this.ensureTenantIsActive(aggregate.tenant, { allowPending: options?.allowPending ?? false })
    return aggregate
  }

  async deleteTenant(id: string): Promise<void> {
    await this.repository.deleteById(id)
  }

  async listTenants(options?: {
    page?: number
    limit?: number
    search?: string
    status?: TenantRecord['status']
    sortBy?: 'createdAt' | 'name'
    sortDir?: 'asc' | 'desc'
    requireStoragePlan?: boolean
  }): Promise<{ items: TenantAggregate[], total: number }> {
    return await this.repository.listTenants({
      page: options?.page ?? 1,
      limit: options?.limit ?? 20,
      search: options?.search,
      status: options?.status,
      sortBy: options?.sortBy,
      sortDir: options?.sortDir,
      requireStoragePlan: options?.requireStoragePlan,
    })
  }

  async setBanned(id: string, banned: boolean): Promise<void> {
    await this.repository.updateBanned(id, banned)
  }

  async isSlugAvailable(slug: string): Promise<boolean> {
    const normalized = this.normalizeSlug(slug)
    if (!normalized) {
      return false
    }

    const existing = await this.repository.findBySlug(normalized)
    if (!existing) {
      return true
    }

    return existing.tenant.status === 'pending'
  }

  ensureTenantIsActive(tenant: TenantAggregate['tenant'], options?: { allowPending?: boolean }): void {
    const allowPending = options?.allowPending ?? false
    if (tenant.banned) {
      throw new BizException(ErrorCode.TENANT_BANNED)
    }

    if (tenant.status === 'suspended') {
      throw new BizException(ErrorCode.TENANT_SUSPENDED)
    }

    if (tenant.status === 'pending' && allowPending) {
      return
    }

    if (tenant.status !== 'active') {
      throw new BizException(ErrorCode.TENANT_INACTIVE)
    }
  }

  async ensurePendingTenant(slug: string): Promise<TenantAggregate> {
    const normalized = this.normalizeSlug(slug)
    if (!normalized) {
      throw new BizException(ErrorCode.TENANT_NOT_FOUND, { message: 'Tenant slug is required' })
    }

    const existing = await this.repository.findBySlug(normalized)
    if (existing) {
      return existing
    }

    return await this.createTenant({
      name: PENDING_TENANT_DEFAULT_NAME,
      slug: normalized,
      status: 'pending',
    })
  }

  async isPendingTenantId(tenantId: string | null | undefined): Promise<boolean> {
    if (!tenantId) {
      return false
    }
    const aggregate = await this.repository.findById(tenantId)
    if (!aggregate) {
      return false
    }
    return aggregate.tenant.status === 'pending'
  }

  private normalizeSlug(value?: string | null): string | null {
    const normalized = normalizeString(value)
    return normalized ? normalized.toLowerCase() : null
  }
}
