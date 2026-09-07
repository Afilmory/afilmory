import { Buffer } from 'node:buffer'
import type { KeyObject } from 'node:crypto'
import { createPrivateKey, randomUUID } from 'node:crypto'
import type { ClientHttp2Session } from 'node:http2'
import { connect as connectHttp2 } from 'node:http2'

import { env } from '@afilmory/env'
import { createLogger } from '@tsuki-hono/common'
import { injectable } from 'tsyringe'

import { classifyAPNsResponse, createAPNsProviderToken } from './apns.utils'
import type { GalleryPushNotification } from './gallery-push.payload'
import { buildGalleryPushAPNsPayload } from './gallery-push.payload'
import type { APNsEnvironment } from './push-device.service'

const APNS_ORIGINS: Record<APNsEnvironment, string> = {
  development: 'https://api.sandbox.push.apple.com',
  production: 'https://api.push.apple.com',
}

const PROVIDER_TOKEN_TTL_MS = 50 * 60 * 1000
const ESCAPED_NEWLINE_PATTERN = /\\n/g

interface APNsProviderConfiguration {
  bundleId: string
  keyId: string
  privateKey: KeyObject
  teamId: string
}

export interface GalleryPushPayload extends GalleryPushNotification {
  deliveryId: string
}

export interface APNsSendResult {
  invalidToken: boolean
  reason?: string
  requestId?: string
  retryable: boolean
  status: number
  success: boolean
}

interface CachedProviderToken {
  expiresAt: number
  value: string
}

@injectable()
export class APNsProvider {
  private readonly logger = createLogger('APNsProvider')
  private readonly configuration: APNsProviderConfiguration | null
  private readonly sessions = new Map<APNsEnvironment, ClientHttp2Session>()
  private cachedProviderToken?: CachedProviderToken

  constructor() {
    this.configuration = this.loadConfiguration()
  }

  isConfigured(): boolean {
    return this.configuration !== null
  }

  async send(
    deviceToken: string,
    environment: APNsEnvironment,
    notification: GalleryPushPayload,
  ): Promise<APNsSendResult> {
    if (!this.configuration) {
      return {
        invalidToken: false,
        reason: 'ProviderNotConfigured',
        retryable: false,
        status: 0,
        success: false,
      }
    }

    let result = await this.performSend(deviceToken, environment, notification)
    if (result.status === 403 && result.reason === 'ExpiredProviderToken') {
      this.cachedProviderToken = undefined
      result = await this.performSend(deviceToken, environment, notification)
    }
    return result
  }

  shutdown(): void {
    for (const session of this.sessions.values()) {
      session.close()
    }
    this.sessions.clear()
  }

  private async performSend(
    deviceToken: string,
    environment: APNsEnvironment,
    notification: GalleryPushPayload,
  ): Promise<APNsSendResult> {
    const configuration = this.configuration!
    const payload = JSON.stringify(buildGalleryPushAPNsPayload(notification))

    try {
      const session = this.sessionFor(environment)
      const response = await new Promise<{
        body: string
        requestId?: string
        status: number
      }>((resolve, reject) => {
        let responseBody = ''
        let responseStatus = 0
        let requestId: string | undefined
        const stream = session.request({
          ':method': 'POST',
          ':path': `/3/device/${deviceToken}`,
          'authorization': `bearer ${this.providerToken()}`,
          'apns-collapse-id': this.collapseId(notification.gallerySlug),
          'apns-expiration': String(Math.floor(Date.now() / 1000) + 24 * 60 * 60),
          'apns-id': notification.deliveryId,
          'apns-priority': '10',
          'apns-push-type': 'alert',
          'apns-topic': configuration.bundleId,
          'content-type': 'application/json',
        })
        stream.setEncoding('utf8')
        stream.on('response', (headers) => {
          responseStatus = Number(headers[':status'] ?? 0)
          const headerRequestId = headers['apns-id']
          requestId = Array.isArray(headerRequestId) ? headerRequestId[0] : headerRequestId
        })
        stream.on('data', (chunk: string) => {
          responseBody += chunk
        })
        stream.on('end', () => resolve({ body: responseBody, requestId, status: responseStatus }))
        stream.on('error', reject)
        stream.end(payload)
      })

      const reason = this.parseReason(response.body)
      const disposition = classifyAPNsResponse(response.status, reason)
      return {
        ...disposition,
        reason,
        requestId: response.requestId,
        status: response.status,
        success: response.status === 200,
      }
    }
    catch (error) {
      this.invalidateSession(environment)
      this.logger.warn('APNs request failed at the transport layer', {
        environment,
        error: error instanceof Error ? error.message : String(error),
      })
      return {
        invalidToken: false,
        reason: 'TransportError',
        retryable: true,
        status: 0,
        success: false,
      }
    }
  }

  private providerToken(): string {
    const now = Date.now()
    if (this.cachedProviderToken && this.cachedProviderToken.expiresAt > now) {
      return this.cachedProviderToken.value
    }
    const configuration = this.configuration!
    const value = createAPNsProviderToken({
      keyId: configuration.keyId,
      privateKey: configuration.privateKey,
      teamId: configuration.teamId,
    })
    this.cachedProviderToken = {
      value,
      expiresAt: now + PROVIDER_TOKEN_TTL_MS,
    }
    return value
  }

  private sessionFor(environment: APNsEnvironment): ClientHttp2Session {
    const existing = this.sessions.get(environment)
    if (existing && !existing.closed && !existing.destroyed) {
      return existing
    }

    const session = connectHttp2(APNS_ORIGINS[environment])
    session.on('error', (error) => {
      this.logger.warn('APNs HTTP/2 session error', {
        environment,
        error: error.message,
      })
    })
    session.on('close', () => {
      if (this.sessions.get(environment) === session) {
        this.sessions.delete(environment)
      }
    })
    this.sessions.set(environment, session)
    return session
  }

  private invalidateSession(environment: APNsEnvironment): void {
    const session = this.sessions.get(environment)
    if (!session)
      return
    this.sessions.delete(environment)
    session.destroy()
  }

  private collapseId(gallerySlug: string): string {
    const candidate = `gallery:${gallerySlug}`
    return Buffer.byteLength(candidate) <= 64 ? candidate : randomUUID()
  }

  private parseReason(body: string): string | undefined {
    if (!body)
      return undefined
    try {
      const parsed = JSON.parse(body) as { reason?: unknown }
      return typeof parsed.reason === 'string' ? parsed.reason : undefined
    }
    catch {
      return undefined
    }
  }

  private loadConfiguration(): APNsProviderConfiguration | null {
    const values = [env.APNS_TEAM_ID, env.APNS_KEY_ID, env.APNS_PRIVATE_KEY]
    const configuredValues = values.filter(value => Boolean(value)).length
    if (configuredValues === 0) {
      this.logger.warn('APNs delivery is disabled because provider credentials are not configured.')
      return null
    }
    if (configuredValues !== values.length) {
      this.logger.error('APNs delivery is disabled because provider credentials are incomplete.')
      return null
    }

    try {
      return {
        bundleId: env.APNS_BUNDLE_ID,
        keyId: env.APNS_KEY_ID!,
        privateKey: createPrivateKey(env.APNS_PRIVATE_KEY!.replace(ESCAPED_NEWLINE_PATTERN, '\n')),
        teamId: env.APNS_TEAM_ID!,
      }
    }
    catch (error) {
      this.logger.error('APNs delivery is disabled because the private key is invalid.', error)
      return null
    }
  }
}
