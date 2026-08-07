import { DEFAULT_BASE_DOMAIN } from '@afilmory/utils'
import { BizException, ErrorCode } from '@core/errors'
import { SystemSettingService } from '@core/modules/configuration/system-setting/system-setting.service'
import type { CloudflareCustomHostname } from '@core/modules/infrastructure/cloudflare/cloudflare-custom-hostname.service'
import { CloudflareCustomHostnameService } from '@core/modules/infrastructure/cloudflare/cloudflare-custom-hostname.service'
import { BillingPlanService } from '@core/modules/platform/billing/billing-plan.service'
import { requireTenantContext } from '@core/modules/platform/tenant/tenant.context'
import { injectable } from 'tsyringe'

import { TenantService } from './tenant.service'
import type { TenantDomainAggregate, TenantDomainRecord } from './tenant.types'
import { TenantDomainRepository } from './tenant-domain.repository'
import { mapCloudflareDomainState } from './tenant-domain.state'

const HTTP_PROTOCOL_PATTERN = /^https?:\/\//

@injectable()
export class TenantDomainService {
  constructor(
    private readonly repository: TenantDomainRepository,
    private readonly tenantService: TenantService,
    private readonly systemSettings: SystemSettingService,
    private readonly cloudflare: CloudflareCustomHostnameService,
    private readonly billingPlanService: BillingPlanService,
  ) {}

  getCnameTarget(): string {
    return this.cloudflare.getCnameTarget()
  }

  async resolveTenantByDomain(host: string): Promise<TenantDomainAggregate | null> {
    const normalized = this.normalizeDomain(host)
    if (!normalized) {
      return null
    }

    const aggregate = await this.repository.findActiveByDomain(normalized)
    if (!aggregate) {
      return null
    }
    this.tenantService.ensureTenantIsActive(aggregate.tenant)
    if (!(await this.billingPlanService.hasCustomDomainEntitlement(aggregate.tenant.id))) {
      return null
    }
    return aggregate
  }

  async listDomainsForTenant(): Promise<TenantDomainRecord[]> {
    const tenantContext = requireTenantContext()
    return await this.repository.listByTenant(tenantContext.tenant.id)
  }

  async getCustomDomainLimitForCurrentTenant(): Promise<number | null> {
    const quota = await this.billingPlanService.getQuotaForCurrentTenant()
    return quota.customDomainLimit
  }

  async requestDomain(domain: string): Promise<TenantDomainAggregate> {
    const tenantContext = requireTenantContext()
    const normalized = this.normalizeDomain(domain)
    if (!normalized) {
      throw new BizException(ErrorCode.COMMON_VALIDATION, { message: '域名不能为空' })
    }

    const baseDomain = await this.getBaseDomain()
    if (normalized === baseDomain || normalized.endsWith(`.${baseDomain}`)) {
      throw new BizException(ErrorCode.COMMON_BAD_REQUEST, { message: '无需绑定主域名或其子域名' })
    }

    const existing = await this.repository.findByDomain(normalized)
    if (existing && existing.tenant.id !== tenantContext.tenant.id) {
      throw new BizException(ErrorCode.COMMON_CONFLICT, { message: '该域名已被其他空间绑定' })
    }

    if (existing) {
      const currentDomainCount = await this.repository.countByTenant(tenantContext.tenant.id)
      await this.billingPlanService.ensureCustomDomainAllowance(
        tenantContext.tenant.id,
        Math.max(currentDomainCount - 1, 0),
      )
      return await this.ensureCloudflareHostname(existing)
    }

    const currentDomainCount = await this.repository.countByTenant(tenantContext.tenant.id)
    await this.billingPlanService.ensureCustomDomainAllowance(tenantContext.tenant.id, currentDomainCount)

    const cloudflareHostname = await this.cloudflare.createOrGet(normalized)
    const providerState = mapCloudflareDomainState(cloudflareHostname)

    return await this.repository.createDomain({
      tenantId: tenantContext.tenant.id,
      domain: normalized,
      cloudflareHostnameId: cloudflareHostname.id,
      ...providerState,
    })
  }

  async verifyDomain(domainId: string): Promise<TenantDomainAggregate> {
    const tenantContext = requireTenantContext()
    const aggregate = await this.repository.findById(domainId)
    if (!aggregate) {
      throw new BizException(ErrorCode.COMMON_NOT_FOUND, { message: '未找到该域名记录' })
    }
    if (aggregate.tenant.id !== tenantContext.tenant.id) {
      throw new BizException(ErrorCode.COMMON_FORBIDDEN, { message: '无法操作其他空间的域名' })
    }

    this.tenantService.ensureTenantIsActive(aggregate.tenant)

    const currentDomainCount = await this.repository.countByTenant(tenantContext.tenant.id)
    await this.billingPlanService.ensureCustomDomainAllowance(
      tenantContext.tenant.id,
      Math.max(currentDomainCount - 1, 0),
    )

    const registered = await this.ensureCloudflareHostname(aggregate)
    const cloudflareHostname = await this.cloudflare.retryValidation(registered.domain.cloudflareHostnameId!)
    return await this.syncCloudflareState(registered.domain.id, cloudflareHostname)
  }

  async deleteDomain(domainId: string): Promise<void> {
    const tenantContext = requireTenantContext()
    const aggregate = await this.repository.findById(domainId)
    if (!aggregate) {
      return
    }
    if (aggregate.tenant.id !== tenantContext.tenant.id) {
      throw new BizException(ErrorCode.COMMON_FORBIDDEN, { message: '无法操作其他空间的域名' })
    }

    await this.deleteDomainRecord(aggregate.domain)
  }

  async deleteDomainsForTenant(tenantId: string): Promise<number> {
    const domains = await this.repository.listByTenant(tenantId)
    for (const domain of domains) {
      await this.deleteDomainRecord(domain)
    }
    return domains.length
  }

  private normalizeDomain(value?: string | null): string | null {
    if (!value) {
      return null
    }
    const trimmed = value.trim().toLowerCase()
    if (!trimmed) {
      return null
    }

    const withoutProtocol = trimmed.replace(HTTP_PROTOCOL_PATTERN, '')
    const [hostname] = withoutProtocol.split('/', 1)
    const [hostWithoutPort] = hostname.split(':', 1)
    const normalized = hostWithoutPort.endsWith('.') ? hostWithoutPort.slice(0, -1) : hostWithoutPort

    return normalized.length > 0 ? normalized : null
  }

  private async ensureCloudflareHostname(aggregate: TenantDomainAggregate): Promise<TenantDomainAggregate> {
    if (aggregate.domain.cloudflareHostnameId) {
      const cloudflareHostname = await this.cloudflare.get(aggregate.domain.cloudflareHostnameId)
      return await this.syncCloudflareState(aggregate.domain.id, cloudflareHostname)
    }

    const cloudflareHostname = await this.cloudflare.createOrGet(aggregate.domain.domain)
    return await this.syncCloudflareState(aggregate.domain.id, cloudflareHostname)
  }

  private async deleteDomainRecord(domain: TenantDomainRecord): Promise<void> {
    if (domain.cloudflareHostnameId) {
      await this.cloudflare.delete(domain.cloudflareHostnameId)
    }
    await this.repository.deleteDomain(domain.id)
  }

  private async syncCloudflareState(
    domainId: string,
    cloudflareHostname: CloudflareCustomHostname,
  ): Promise<TenantDomainAggregate> {
    return await this.repository.updateDomain(domainId, {
      cloudflareHostnameId: cloudflareHostname.id,
      ...mapCloudflareDomainState(cloudflareHostname),
    })
  }

  private async getBaseDomain(): Promise<string> {
    const settings = await this.systemSettings.getSettings()
    return settings.baseDomain || DEFAULT_BASE_DOMAIN
  }
}
