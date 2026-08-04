import { createHash, randomBytes } from 'node:crypto'

import { accountDeletionRequests, authAccounts, authSessions, authUsers } from '@afilmory/db'
import { DbAccessor } from '@core/database/database.provider'
import { BizException, ErrorCode } from '@core/errors'
import { verifyPassword } from 'better-auth/crypto'
import { and, eq, ne } from 'drizzle-orm'
import { injectable } from 'tsyringe'

import { AppleAuthorizationService } from '../auth/apple-authorization.service'
import { AccountDeletionQueue } from './account-deletion.queue'
import type { AccountDeletionProof, AccountDeletionRequestResult } from './account-deletion.types'
import { AccountDeletionImpactService } from './account-deletion-impact.service'

const RECENT_SESSION_MAX_AGE_MS = 5 * 60 * 1000

@injectable()
export class AccountDeletionRequestService {
  constructor(
    private readonly dbAccessor: DbAccessor,
    private readonly impactService: AccountDeletionImpactService,
    private readonly apple: AppleAuthorizationService,
    private readonly queue: AccountDeletionQueue,
  ) {}

  async request(params: {
    proof: AccountDeletionProof
    sessionCreatedAt: Date | string
    userId: string
  }): Promise<AccountDeletionRequestResult> {
    await this.verifyProof(params)
    const impact = await this.impactService.build(params.userId)
    const statusToken = randomBytes(32).toString('base64url')
    const statusTokenHash = this.hashStatusToken(statusToken)
    const now = new Date().toISOString()
    const db = this.dbAccessor.get()

    const requestId = await db.transaction(async (tx) => {
      const [user] = await tx
        .select({ deletionRequestedAt: authUsers.deletionRequestedAt, role: authUsers.role })
        .from(authUsers)
        .where(eq(authUsers.id, params.userId))
        .limit(1)
      if (!user) {
        throw new BizException(ErrorCode.AUTH_UNAUTHORIZED)
      }
      if (user.role === 'superadmin') {
        throw new BizException(ErrorCode.AUTH_FORBIDDEN, {
          message: 'Transfer the platform super administrator role before deleting this account.',
        })
      }
      if (user.deletionRequestedAt) {
        throw new BizException(ErrorCode.COMMON_CONFLICT, { message: 'Account deletion is already in progress.' })
      }
      const [existing] = await tx
        .select({ id: accountDeletionRequests.id })
        .from(accountDeletionRequests)
        .where(
          and(
            eq(accountDeletionRequests.subjectUserId, params.userId),
            ne(accountDeletionRequests.status, 'completed'),
          ),
        )
        .limit(1)
      if (existing) {
        throw new BizException(ErrorCode.COMMON_CONFLICT, { message: 'Account deletion is already in progress.' })
      }

      const [request] = await tx
        .insert(accountDeletionRequests)
        .values({
          accessRevokedAt: now,
          impactSnapshot: { ...impact },
          statusTokenHash,
          subjectUserId: params.userId,
        })
        .returning({ id: accountDeletionRequests.id })
      if (!request) {
        throw new BizException(ErrorCode.COMMON_INTERNAL_SERVER_ERROR)
      }
      await tx
        .update(authUsers)
        .set({ deletionRequestedAt: now, updatedAt: now })
        .where(eq(authUsers.id, params.userId))
      await tx.delete(authSessions).where(eq(authSessions.userId, params.userId))
      return request.id
    })

    await this.queue.enqueue(requestId)
    return { requestId, status: 'requested', statusToken }
  }

  async status(requestId: string, statusToken: string) {
    const db = this.dbAccessor.get()
    const [request] = await db
      .select({
        completedAt: accountDeletionRequests.completedAt,
        lastErrorCode: accountDeletionRequests.lastErrorCode,
        stage: accountDeletionRequests.stage,
        status: accountDeletionRequests.status,
      })
      .from(accountDeletionRequests)
      .where(
        and(
          eq(accountDeletionRequests.id, requestId),
          eq(accountDeletionRequests.statusTokenHash, this.hashStatusToken(statusToken)),
        ),
      )
      .limit(1)
    if (!request) {
      throw new BizException(ErrorCode.COMMON_NOT_FOUND)
    }
    return request
  }

  private async verifyProof(params: {
    proof: AccountDeletionProof
    sessionCreatedAt: Date | string
    userId: string
  }): Promise<void> {
    const db = this.dbAccessor.get()
    const accounts = await db
      .select({ password: authAccounts.password, providerId: authAccounts.providerId })
      .from(authAccounts)
      .where(eq(authAccounts.userId, params.userId))

    if (params.proof.type === 'password') {
      const credential = accounts.find(account => account.providerId === 'credential')
      const valid = credential?.password
        ? await verifyPassword({ hash: credential.password, password: params.proof.password })
        : false
      if (!valid) {
        throw new BizException(ErrorCode.AUTH_UNAUTHORIZED, { message: 'The current password is incorrect.' })
      }
      return
    }

    if (params.proof.type === 'apple') {
      if (!accounts.some(account => account.providerId === 'apple')) {
        throw new BizException(ErrorCode.AUTH_UNAUTHORIZED)
      }
      await this.apple.verifyReauthentication(params.userId, params.proof.identityToken, params.proof.nonce)
      return
    }

    if (accounts.some(account => account.providerId === 'credential' || account.providerId === 'apple')) {
      throw new BizException(ErrorCode.AUTH_UNAUTHORIZED, { message: 'Explicit reauthentication is required.' })
    }
    const createdAt = new Date(params.sessionCreatedAt).getTime()
    if (!Number.isFinite(createdAt) || Date.now() - createdAt > RECENT_SESSION_MAX_AGE_MS) {
      throw new BizException(ErrorCode.AUTH_UNAUTHORIZED, {
        message: 'Sign in again before deleting this account.',
      })
    }
  }

  private hashStatusToken(value: string): string {
    return createHash('sha256').update(value).digest('hex')
  }
}
