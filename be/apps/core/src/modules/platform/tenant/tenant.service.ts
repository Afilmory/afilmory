import { isTenantSlugReserved } from '@afilmory/utils'
import { BizException, ErrorCode } from 'core/errors'
import { normalizeString } from 'core/helpers/normalize.helper'
import type { BillingPlanId } from 'core/modules/platform/billing/billing-plan.types'
import { injectable } from 'tsyringe'

import {
  PLACEHOLDER_TENANT_NAME,
  PLACEHOLDER_TENANT_SLUG,
  ROOT_TENANT_NAME,
  ROOT_TENANT_SLUG,
} from './tenant.constants'
import { TenantRepository } from './tenant.repository'
import type { TenantAggregate, TenantContext, TenantResolutionInput } from './tenant.types'

@injectable()
export class TenantService {
  constructor(private readonly repository: TenantRepository) {}

  async createTenant(payload: {
    name: string
    slug: string
    planId?: BillingPlanId
    storagePlanId?: string | null
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

  async ensurePlaceholderTenant(): Promise<TenantAggregate> {
    const existing = await this.repository.findBySlug(PLACEHOLDER_TENANT_SLUG)
    if (existing) {
      return existing
    }

    return await this.repository.createTenant({
      name: PLACEHOLDER_TENANT_NAME,
      slug: PLACEHOLDER_TENANT_SLUG,
    })
  }

  getPlaceholderTenantSlug(): string {
    return PLACEHOLDER_TENANT_SLUG
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

  async isPlaceholderTenantId(tenantId: string | null | undefined): Promise<boolean> {
    if (!tenantId) {
      return false
    }
    const placeholder = await this.ensurePlaceholderTenant()
    return placeholder.tenant.id === tenantId
  }

  async resolve(input: TenantResolutionInput, noThrow: boolean): Promise<TenantContext | null>
  async resolve(input: TenantResolutionInput): Promise<TenantContext>
  async resolve(input: TenantResolutionInput, noThrow = false): Promise<TenantContext | null> {
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

    this.ensureTenantIsActive(aggregate.tenant)

    return {
      tenant: aggregate.tenant,
    }
  }

  async getById(id: string): Promise<TenantAggregate> {
    const aggregate = await this.repository.findById(id)
    if (!aggregate) {
      throw new BizException(ErrorCode.TENANT_NOT_FOUND)
    }
    this.ensureTenantIsActive(aggregate.tenant)
    return aggregate
  }

  async getBySlug(slug: string): Promise<TenantAggregate> {
    const normalized = this.normalizeSlug(slug)
    if (!normalized) {
      throw new BizException(ErrorCode.TENANT_NOT_FOUND)
    }

    const aggregate = await this.repository.findBySlug(normalized)
    if (!aggregate) {
      throw new BizException(ErrorCode.TENANT_NOT_FOUND)
    }
    this.ensureTenantIsActive(aggregate.tenant)
    return aggregate
  }

  async deleteTenant(id: string): Promise<void> {
    await this.repository.deleteById(id)
  }

  async listTenants(): Promise<TenantAggregate[]> {
    return await this.repository.listTenants()
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
    return existing === null
  }

  ensureTenantIsActive(tenant: TenantAggregate['tenant']): void {
    if (tenant.banned) {
      throw new BizException(ErrorCode.TENANT_BANNED)
    }

    if (tenant.status === 'suspended') {
      throw new BizException(ErrorCode.TENANT_SUSPENDED)
    }

    if (tenant.status !== 'active') {
      throw new BizException(ErrorCode.TENANT_INACTIVE)
    }
  }

  private normalizeSlug(value?: string | null): string | null {
    const normalized = normalizeString(value)
    return normalized ? normalized.toLowerCase() : null
  }
}
