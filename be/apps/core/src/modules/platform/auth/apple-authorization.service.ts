import { createHash } from 'node:crypto'

import { appleAuthorizations, authAccounts, authUsers } from '@afilmory/db'
import { DbAccessor } from '@core/database/database.provider'
import { BizException, ErrorCode } from '@core/errors'
import { createLogger } from '@tsuki-hono/common'
import { and, eq } from 'drizzle-orm'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { injectable } from 'tsyringe'

import { AppleClientSecretService } from './apple-client-secret.service'
import { AppleCredentialCipher } from './apple-credential-cipher.service'
import type { AppleAuthOptions } from './auth.config'
import { AuthConfig } from './auth.config'

const APPLE_ISSUER = 'https://appleid.apple.com'
const APPLE_JWKS = createRemoteJWKSet(new URL(`${APPLE_ISSUER}/auth/keys`))
const logger = createLogger('AppleAuthorization')

interface AppleExchangeResponse {
  access_token?: string
  error?: string
  error_description?: string
  expires_in?: number
  id_token?: string
  refresh_token?: string
  token_type?: string
}

export interface AppleAuthorizationInput {
  authorizationCode: string
  identityToken: string
  nonce: string
}

@injectable()
export class AppleAuthorizationService {
  constructor(
    private readonly dbAccessor: DbAccessor,
    private readonly authConfig: AuthConfig,
    private readonly clientSecrets: AppleClientSecretService,
    private readonly cipher: AppleCredentialCipher,
  ) {}

  async configuration(): Promise<{ appBundleIdentifier: string, enabled: boolean, webEnabled: boolean }> {
    const options = await this.authConfig.getOptions()
    return {
      appBundleIdentifier: options.apple?.appBundleIdentifier ?? 'app.afilmory',
      enabled: Boolean(options.apple),
      webEnabled: options.apple?.webEnabled ?? false,
    }
  }

  async exchange(userId: string, input: AppleAuthorizationInput): Promise<void> {
    const options = await this.requireOptions()
    const identity = await this.verifyIdentityToken(input.identityToken, options.appBundleIdentifier, input.nonce)
    const subject = identity.sub
    if (!subject) {
      throw new BizException(ErrorCode.AUTH_UNAUTHORIZED, { message: 'Apple identity token is missing a subject.' })
    }

    const db = this.dbAccessor.get()
    const [account] = await db
      .select({ id: authAccounts.id })
      .from(authAccounts)
      .where(
        and(eq(authAccounts.userId, userId), eq(authAccounts.providerId, 'apple'), eq(authAccounts.accountId, subject)),
      )
      .limit(1)
    if (!account) {
      throw new BizException(ErrorCode.AUTH_UNAUTHORIZED, {
        message: 'The Apple authorization does not match the signed-in account.',
      })
    }

    const authorizationCodeHash = this.hashAuthorizationCode(input.authorizationCode)
    const [replay] = await db
      .select({ id: appleAuthorizations.id })
      .from(appleAuthorizations)
      .where(eq(appleAuthorizations.authorizationCodeHash, authorizationCodeHash))
      .limit(1)
    if (replay) {
      throw new BizException(ErrorCode.AUTH_UNAUTHORIZED, { message: 'The Apple authorization code was already used.' })
    }

    const tokenResponse = await this.exchangeAuthorizationCode(options, input.authorizationCode)
    if (!tokenResponse.refresh_token || !tokenResponse.id_token) {
      logger.error('Apple token exchange did not return the required tokens', {
        error: tokenResponse.error,
        description: tokenResponse.error_description,
      })
      throw new BizException(ErrorCode.AUTH_UNAUTHORIZED, { message: 'Apple authorization could not be linked.' })
    }

    const exchangedIdentity = await this.verifyIdentityToken(tokenResponse.id_token, options.appBundleIdentifier)
    if (exchangedIdentity.sub !== subject) {
      throw new BizException(ErrorCode.AUTH_UNAUTHORIZED, {
        message: 'The exchanged Apple identity does not match the original authorization.',
      })
    }

    const encryptedRefreshToken = this.cipher.encrypt(tokenResponse.refresh_token)
    const now = new Date().toISOString()
    await db
      .insert(appleAuthorizations)
      .values({
        accountId: account.id,
        authorizationCodeHash,
        clientId: options.appBundleIdentifier,
        encryptedRefreshToken,
        status: 'active',
        subject,
        userId,
      })
      .onConflictDoUpdate({
        target: appleAuthorizations.accountId,
        set: {
          authorizationCodeHash,
          clientId: options.appBundleIdentifier,
          encryptedRefreshToken,
          lastRevocationError: null,
          revokedAt: null,
          status: 'active',
          subject,
          updatedAt: now,
        },
      })
  }

  async verifyReauthentication(userId: string, identityToken: string, nonce: string): Promise<void> {
    const options = await this.requireOptions()
    const identity = await this.verifyIdentityToken(identityToken, options.appBundleIdentifier, nonce)
    if (!identity.sub) {
      throw new BizException(ErrorCode.AUTH_UNAUTHORIZED)
    }
    const db = this.dbAccessor.get()
    const [account] = await db
      .select({ id: authAccounts.id })
      .from(authAccounts)
      .where(
        and(
          eq(authAccounts.userId, userId),
          eq(authAccounts.providerId, 'apple'),
          eq(authAccounts.accountId, identity.sub),
        ),
      )
      .limit(1)
    if (!account) {
      throw new BizException(ErrorCode.AUTH_UNAUTHORIZED, {
        message: 'The Apple authorization does not match this account.',
      })
    }
  }

  async resolveExistingProfile(subject: string): Promise<{ email: string, name: string } | null> {
    const db = this.dbAccessor.get()
    const [record] = await db
      .select({ email: authUsers.email, name: authUsers.name })
      .from(authAccounts)
      .innerJoin(authUsers, eq(authUsers.id, authAccounts.userId))
      .where(and(eq(authAccounts.providerId, 'apple'), eq(authAccounts.accountId, subject)))
      .limit(1)
    return record ?? null
  }

  async revokeForUser(userId: string): Promise<{ failed: number, revoked: number }> {
    const options = await this.requireOptions()
    const db = this.dbAccessor.get()
    const records = await db
      .select()
      .from(appleAuthorizations)
      .where(and(eq(appleAuthorizations.userId, userId), eq(appleAuthorizations.status, 'active')))
    let failed = 0
    let revoked = 0

    for (const record of records) {
      try {
        const clientSecret = await this.clientSecrets.generate(options, record.clientId)
        const response = await fetch(`${APPLE_ISSUER}/auth/revoke`, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: record.clientId,
            client_secret: clientSecret,
            token: this.cipher.decrypt(record.encryptedRefreshToken),
            token_type_hint: 'refresh_token',
          }),
        })
        if (!response.ok) {
          throw new Error(`Apple revoke returned HTTP ${response.status}.`)
        }
        const now = new Date().toISOString()
        await db
          .update(appleAuthorizations)
          .set({ lastRevocationError: null, revokedAt: now, status: 'revoked', updatedAt: now })
          .where(eq(appleAuthorizations.id, record.id))
        revoked += 1
      }
      catch (error) {
        failed += 1
        const message = error instanceof Error ? error.message : 'Unknown Apple revocation failure.'
        await db
          .update(appleAuthorizations)
          .set({
            lastRevocationError: message.slice(0, 500),
            status: 'revocation_failed',
            updatedAt: new Date().toISOString(),
          })
          .where(eq(appleAuthorizations.id, record.id))
        logger.error('Failed to revoke Apple authorization', { authorizationId: record.id, error: message })
      }
    }

    return { failed, revoked }
  }

  private async exchangeAuthorizationCode(
    options: AppleAuthOptions,
    authorizationCode: string,
  ): Promise<AppleExchangeResponse> {
    const clientSecret = await this.clientSecrets.generate(options, options.appBundleIdentifier)
    const response = await fetch(`${APPLE_ISSUER}/auth/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: options.appBundleIdentifier,
        client_secret: clientSecret,
        code: authorizationCode,
        grant_type: 'authorization_code',
      }),
    })
    const data = (await response.json().catch(() => ({}))) as AppleExchangeResponse
    if (!response.ok) {
      logger.error('Apple authorization-code exchange failed', {
        status: response.status,
        error: data.error,
        description: data.error_description,
      })
    }
    return data
  }

  private async verifyIdentityToken(token: string, audience: string, nonce?: string) {
    try {
      const result = await jwtVerify(token, APPLE_JWKS, {
        audience,
        issuer: APPLE_ISSUER,
        maxTokenAge: '1h',
      })
      if (nonce) {
        const claim = result.payload.nonce
        const hashedNonce = createHash('sha256').update(nonce).digest('hex')
        if (claim !== nonce && claim !== hashedNonce) {
          throw new Error('Apple nonce mismatch.')
        }
      }
      return result.payload
    }
    catch {
      throw new BizException(ErrorCode.AUTH_UNAUTHORIZED, { message: 'Invalid Apple identity token.' })
    }
  }

  private async requireOptions(): Promise<AppleAuthOptions> {
    const options = await this.authConfig.getOptions()
    if (!options.apple) {
      throw new BizException(ErrorCode.AUTH_FORBIDDEN, { message: 'Sign in with Apple is not configured.' })
    }
    return options.apple
  }

  private hashAuthorizationCode(value: string): string {
    return createHash('sha256').update(value).digest('hex')
  }
}
