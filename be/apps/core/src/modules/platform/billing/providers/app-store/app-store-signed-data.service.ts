import { Buffer } from 'node:buffer'

import { env } from '@afilmory/env'
import type { JWSTransactionDecodedPayload, ResponseBodyV2DecodedPayload } from '@apple/app-store-server-library'
import { Environment, SignedDataVerifier } from '@apple/app-store-server-library'
import { injectable } from 'tsyringe'

import { BillingError } from '../../billing.error'

const CERTIFICATE_PATTERN = /-----BEGIN CERTIFICATE-----([\s\S]*?)-----END CERTIFICATE-----/g
const WHITESPACE_PATTERN = /\s/g

export interface AppStoreSignedDataVerifier {
  isConfigured: () => boolean
  verifyNotification: (signedPayload: string) => Promise<ResponseBodyV2DecodedPayload>
  verifyTransaction: (signedTransactionInfo: string) => Promise<JWSTransactionDecodedPayload>
}

@injectable()
export class AppStoreSignedDataService implements AppStoreSignedDataVerifier {
  private readonly verifiers = new Map<string, SignedDataVerifier>()

  isConfigured(): boolean {
    const hasProductionAppId = env.NODE_ENV !== 'production' || Boolean(env.APP_STORE_APPLE_ID)
    return this.getRootCertificates().length > 0 && Boolean(env.APP_STORE_BUNDLE_ID) && hasProductionAppId
  }

  async verifyTransaction(signedTransactionInfo: string): Promise<JWSTransactionDecodedPayload> {
    const environment = this.resolveUntrustedEnvironment(signedTransactionInfo)
    return await this.getVerifier(environment).verifyAndDecodeTransaction(signedTransactionInfo)
  }

  async verifyNotification(signedPayload: string): Promise<ResponseBodyV2DecodedPayload> {
    const environment = this.resolveUntrustedEnvironment(signedPayload)
    return await this.getVerifier(environment).verifyAndDecodeNotification(signedPayload)
  }

  private getVerifier(environment: Environment): SignedDataVerifier {
    const cached = this.verifiers.get(environment)
    if (cached) {
      return cached
    }
    const roots = this.getRootCertificates()
    if (roots.length === 0) {
      throw new BillingError('APP_STORE_ROOT_CERTIFICATES_NOT_CONFIGURED')
    }
    if (environment === Environment.PRODUCTION && !env.APP_STORE_APPLE_ID) {
      throw new BillingError('APP_STORE_APPLE_ID_NOT_CONFIGURED')
    }
    const verifier = new SignedDataVerifier(
      roots,
      env.APP_STORE_ENABLE_ONLINE_CHECKS,
      environment,
      env.APP_STORE_BUNDLE_ID,
      env.APP_STORE_APPLE_ID,
    )
    this.verifiers.set(environment, verifier)
    return verifier
  }

  private resolveUntrustedEnvironment(jws: string): Environment {
    const payloadPart = jws.split('.')[1]
    if (!payloadPart) {
      throw new BillingError('APP_STORE_JWS_MALFORMED')
    }
    let payload: Record<string, unknown>
    try {
      payload = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8')) as Record<string, unknown>
    }
    catch {
      throw new BillingError('APP_STORE_JWS_MALFORMED')
    }
    const data = payload.data && typeof payload.data === 'object' ? (payload.data as Record<string, unknown>) : null
    const value = String(data?.environment ?? payload.environment ?? '')
    switch (value.toLowerCase()) {
      case 'production': {
        return Environment.PRODUCTION
      }
      case 'xcode': {
        return Environment.XCODE
      }
      case 'localtesting': {
        return Environment.LOCAL_TESTING
      }
      default: {
        return Environment.SANDBOX
      }
    }
  }

  private getRootCertificates(): Buffer[] {
    const raw = env.APP_STORE_ROOT_CA_CERTIFICATES?.trim()
    if (!raw) {
      return []
    }
    if (raw.startsWith('[')) {
      try {
        const values = JSON.parse(raw) as unknown
        return Array.isArray(values)
          ? values
              .filter((value): value is string => typeof value === 'string')
              .map(value => Buffer.from(value, 'base64'))
          : []
      }
      catch {
        return []
      }
    }
    const pemCertificates = Array.from(raw.matchAll(CERTIFICATE_PATTERN), match =>
      Buffer.from((match[1] ?? '').replaceAll(WHITESPACE_PATTERN, ''), 'base64'))
    if (pemCertificates.length > 0) {
      return pemCertificates
    }
    return raw
      .split(',')
      .map(value => value.trim())
      .filter(Boolean)
      .map(value => Buffer.from(value, 'base64'))
  }
}
