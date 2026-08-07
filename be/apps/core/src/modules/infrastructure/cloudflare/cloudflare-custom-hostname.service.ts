import { env } from '@afilmory/env'
import { BizException, ErrorCode } from '@core/errors'
import { logger } from '@core/helpers/logger.helper'
import { injectable } from 'tsyringe'

const CLOUDFLARE_API_BASE_URL = 'https://api.cloudflare.com/client/v4'
const HTTP_PROTOCOL_PATTERN = /^https?:\/\//
const TRAILING_DOT_PATTERN = /\.$/
const CUSTOM_HOSTNAME_SSL_CONFIG = {
  method: 'http',
  type: 'dv',
  settings: {
    min_tls_version: '1.2',
  },
} as const

interface CloudflareApiError {
  code?: number
  message?: string
}

interface CloudflareApiResponse<T> {
  success: boolean
  errors?: CloudflareApiError[]
  result?: T
}

export interface CloudflareCustomHostname {
  id: string
  hostname: string
  status?: string
  verification_errors?: string[]
  ssl?: {
    method?: 'http' | 'txt' | 'email'
    status?: string
  }
}

interface CloudflareCustomHostnameConfig {
  apiToken: string
  cnameTarget: string
  zoneId: string
}

@injectable()
export class CloudflareCustomHostnameService {
  private readonly log = logger.extend('CloudflareCustomHostnameService')

  getCnameTarget(): string {
    return this.getConfig().cnameTarget
  }

  async create(hostname: string): Promise<CloudflareCustomHostname> {
    return await this.request<CloudflareCustomHostname>('/custom_hostnames', {
      method: 'POST',
      body: {
        hostname,
        ssl: CUSTOM_HOSTNAME_SSL_CONFIG,
      },
    })
  }

  async createOrGet(hostname: string): Promise<CloudflareCustomHostname> {
    try {
      return await this.create(hostname)
    }
    catch (createError) {
      try {
        const matches = await this.request<CloudflareCustomHostname[]>(
          `/custom_hostnames?hostname=${encodeURIComponent(hostname)}`,
        )
        const existing = matches.find(item => item.hostname.toLowerCase() === hostname.toLowerCase())
        if (existing)
          return existing
      }
      catch {
        // Preserve the original provisioning error when lookup also fails.
      }

      throw createError
    }
  }

  async get(customHostnameId: string): Promise<CloudflareCustomHostname> {
    return await this.request<CloudflareCustomHostname>(`/custom_hostnames/${customHostnameId}`)
  }

  async retryValidation(customHostnameId: string): Promise<CloudflareCustomHostname> {
    return await this.request<CloudflareCustomHostname>(`/custom_hostnames/${customHostnameId}`, {
      method: 'PATCH',
      body: {
        ssl: CUSTOM_HOSTNAME_SSL_CONFIG,
      },
    })
  }

  async delete(customHostnameId: string): Promise<void> {
    await this.request<unknown>(`/custom_hostnames/${customHostnameId}`, {
      method: 'DELETE',
      ignoreNotFound: true,
    })
  }

  private getConfig(): CloudflareCustomHostnameConfig {
    const apiToken = env.CLOUDFLARE_API_TOKEN?.trim()
    const zoneId = env.CLOUDFLARE_ZONE_ID?.trim()
    const cnameTarget = this.normalizeHostname(env.CLOUDFLARE_CUSTOM_HOSTNAME_TARGET)

    if (!apiToken || !zoneId || !cnameTarget) {
      throw new BizException(ErrorCode.COMMON_INTERNAL_SERVER_ERROR, {
        message:
          'Custom domain service is not configured. Set CLOUDFLARE_API_TOKEN, CLOUDFLARE_ZONE_ID, and CLOUDFLARE_CUSTOM_HOSTNAME_TARGET.',
      })
    }

    return { apiToken, zoneId, cnameTarget }
  }

  private normalizeHostname(value?: string): string | null {
    if (!value)
      return null

    const normalized = value
      .trim()
      .toLowerCase()
      .replace(HTTP_PROTOCOL_PATTERN, '')
      .split('/')[0]
      ?.replace(TRAILING_DOT_PATTERN, '')
    if (!normalized || normalized.includes(':'))
      return null
    return normalized
  }

  private async request<T>(
    path: string,
    options: {
      method?: 'DELETE' | 'GET' | 'PATCH' | 'POST'
      body?: Record<string, unknown>
      ignoreNotFound?: boolean
    } = {},
  ): Promise<T> {
    const config = this.getConfig()
    const method = options.method ?? 'GET'
    const response = await fetch(`${CLOUDFLARE_API_BASE_URL}/zones/${encodeURIComponent(config.zoneId)}${path}`, {
      method,
      headers: {
        'authorization': `Bearer ${config.apiToken}`,
        'content-type': 'application/json',
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(10_000),
    })

    if (options.ignoreNotFound && response.status === 404) {
      return undefined as T
    }

    let payload: CloudflareApiResponse<T> | null = null
    try {
      payload = (await response.json()) as CloudflareApiResponse<T>
    }
    catch (error) {
      this.log.error('Cloudflare returned an invalid JSON response', { error, method, path, status: response.status })
    }

    if (!response.ok || !payload?.success || payload.result === undefined) {
      const details = payload?.errors
        ?.map(error => error.message?.trim())
        .filter((message): message is string => Boolean(message))
        .join('; ')

      this.log.error('Cloudflare custom hostname API request failed', {
        details,
        errors: payload?.errors,
        method,
        path,
        status: response.status,
      })

      throw new BizException(ErrorCode.COMMON_BAD_REQUEST, {
        message: details || `Cloudflare custom hostname request failed (${response.status})`,
      })
    }

    return payload.result
  }
}
