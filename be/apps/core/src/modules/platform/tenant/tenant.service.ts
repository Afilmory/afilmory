import { isTenantSlugReserved } from '@afilmory/utils'
import { BizException, ErrorCode } from 'core/errors'
import { AppStateService } from 'core/modules/infrastructure/app-state/app-state.service'
import { injectable } from 'tsyringe'

import { TenantRepository } from './tenant.repository'
import type { TenantAggregate, TenantContext, TenantResolutionInput } from './tenant.types'

const PLACEHOLDER_TENANT_SLUG = 'holding'
const PLACEHOLDER_TENANT_NAME = 'Pending Workspace'

@injectable()
export class TenantService {
  constructor(
    private readonly repository: TenantRepository,
    private readonly appState: AppStateService,
  ) {}

  async createTenant(payload: { name: string; slug: string }): Promise<TenantAggregate> {
    const normalizedSlug = this.normalizeSlug(payload.slug)

    if (!normalizedSlug) {
      throw new BizException(ErrorCode.COMMON_VALIDATION, {
        message: 'Tenant slug is required',
      })
    }

    if (isTenantSlugReserved(normalizedSlug)) {
      throw new BizException(ErrorCode.TENANT_SLUG_RESERVED)
    }

    const aggregate = await this.repository.createTenant({
      ...payload,
      slug: normalizedSlug,
    })
    await this.appState.markInitialized()
    return aggregate
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
    const tenantId = this.normalizeString(input.tenantId)
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

  private ensureTenantIsActive(tenant: TenantAggregate['tenant']): void {
    if (tenant.status === 'suspended') {
      throw new BizException(ErrorCode.TENANT_SUSPENDED)
    }

    if (tenant.status !== 'active') {
      throw new BizException(ErrorCode.TENANT_INACTIVE)
    }
  }

  private normalizeString(value?: string | null): string | null {
    if (!value) {
      return null
    }
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
  }

  private normalizeSlug(value?: string | null): string | null {
    const normalized = this.normalizeString(value)
    return normalized ? normalized.toLowerCase() : null
  }
}
