import { SystemSettingService } from '@core/modules/configuration/system-setting/system-setting.service'
import { createLogger } from '@tsuki-hono/common'
import { EventEmitterService } from '@tsuki-hono/event-emitter'
import { injectable } from 'tsyringe'

const IPV4_HOST_PATTERN = /^\d{1,3}(?:\.\d{1,3}){3}$/

@injectable()
export class StaticAssetHostService {
  private readonly logger = createLogger('StaticAssetHostService')
  private readonly cache = new Map<string, string | null>()

  constructor(
    private readonly systemSettingService: SystemSettingService,
    private readonly eventService: EventEmitterService,
  ) {
    eventService.on('system.setting.updated', ({ key }) => {
      if (key === 'system.domain.base') {
        this.cache.clear()
      }
    })
  }

  async getStaticAssetHost(requestHost?: string | null): Promise<string | null> {
    const cacheKey = this.buildCacheKey(requestHost)
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey) ?? null
    }

    const resolved = await this.resolveStaticAssetHost(requestHost)
    this.cache.set(cacheKey, resolved ?? null)
    return resolved ?? null
  }

  private buildCacheKey(requestHost?: string | null): string {
    if (!requestHost) {
      return '__default__'
    }
    return requestHost.trim().toLowerCase()
  }

  private async resolveStaticAssetHost(requestHost?: string | null): Promise<string | null> {
    try {
      const requestHostname = this.extractHostname(requestHost)
      if (requestHostname && this.isLocalDomain(requestHostname)) {
        return null
      }

      const settings = await this.systemSettingService.getSettings()
      const baseDomain = settings.baseDomain?.trim().toLowerCase()
      if (!baseDomain) {
        return null
      }

      if (this.isLocalDomain(baseDomain)) {
        const port = this.extractPort(requestHost)
        return port ? `//static.${baseDomain}:${port}` : `//static.${baseDomain}`
      }

      return `//static.${baseDomain}`
    }
    catch (error) {
      this.logger.warn('Failed to load system settings for static asset host', error)
      return null
    }
  }

  private isLocalDomain(baseDomain: string): boolean {
    if (baseDomain === 'localhost') {
      return true
    }

    if (baseDomain.endsWith('.localhost')) {
      return true
    }

    if (IPV4_HOST_PATTERN.test(baseDomain)) {
      return true
    }

    return false
  }

  private extractPort(requestHost?: string | null): string | null {
    if (!requestHost) {
      return null
    }

    const host = requestHost.trim()
    if (!host) {
      return null
    }

    if (host.startsWith('[')) {
      const closingIndex = host.indexOf(']')
      if (closingIndex !== -1 && closingIndex + 1 < host.length && host[closingIndex + 1] === ':') {
        return host.slice(closingIndex + 2)
      }
      return null
    }

    const segments = host.split(':')
    if (segments.length <= 1) {
      return null
    }

    return segments.at(-1) ?? null
  }

  private extractHostname(requestHost?: string | null): string | null {
    const host = requestHost?.trim()
    if (!host) {
      return null
    }

    try {
      return new URL(`http://${host}`).hostname.toLowerCase()
    }
    catch {
      return null
    }
  }
}
