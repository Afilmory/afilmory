import { importPKCS8, SignJWT } from 'jose'
import { injectable } from 'tsyringe'

import type { AppleAuthOptions } from './auth.config'

const CLIENT_SECRET_TTL_SECONDS = 5 * 60
const CLIENT_SECRET_REFRESH_SKEW_SECONDS = 30

@injectable()
export class AppleClientSecretService {
  private readonly cache = new Map<string, { expiresAt: number, token: string }>()

  async generate(options: AppleAuthOptions, clientId = options.clientId): Promise<string> {
    const now = Math.floor(Date.now() / 1000)
    const cacheKey = [options.teamId, options.keyId, clientId].join(':')
    const cached = this.cache.get(cacheKey)
    if (cached && cached.expiresAt - CLIENT_SECRET_REFRESH_SKEW_SECONDS > now) {
      return cached.token
    }

    const privateKey = await importPKCS8(this.normalizePrivateKey(options.privateKey), 'ES256')
    const expiresAt = now + CLIENT_SECRET_TTL_SECONDS
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'ES256', kid: options.keyId })
      .setIssuer(options.teamId)
      .setAudience('https://appleid.apple.com')
      .setSubject(clientId)
      .setIssuedAt(now)
      .setExpirationTime(expiresAt)
      .sign(privateKey)

    this.cache.set(cacheKey, { expiresAt, token })
    return token
  }

  private normalizePrivateKey(value: string): string {
    return value.includes('\\n') ? value.replaceAll('\\n', '\n') : value
  }
}
