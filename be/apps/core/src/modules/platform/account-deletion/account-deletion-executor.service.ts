import { randomUUID } from 'node:crypto'

import {
  accountDeletionRequests,
  authUsers,
  authVerifications,
  billingSubjects,
  billingSubscriptions,
  creemSubscriptions,
  tenantMemberships,
  tenants,
} from '@afilmory/db'
import { env } from '@afilmory/env'
import { DbAccessor } from '@core/database/database.provider'
import { BillingEntitlementService } from '@core/modules/platform/billing/entitlement/billing-entitlement.service'
import { DataManagementService } from '@core/modules/platform/data-management/data-management.service'
import { cancelSubscription } from '@creem_io/better-auth/server'
import { createLogger } from '@tsuki-hono/common'
import { and, eq, inArray, isNull, lte, or, sql } from 'drizzle-orm'
import { injectable } from 'tsyringe'

import { AppleAuthorizationService } from '../auth/apple-authorization.service'
import { ROOT_TENANT_SLUG } from '../tenant/tenant.constants'
import { selectOwnerSuccessor } from './account-deletion.policy'
import type { AccountDeletionImpact } from './account-deletion.types'

const MAX_ATTEMPTS = 5
const PROCESSING_LEASE_MS = 5 * 60 * 1000
const logger = createLogger('AccountDeletionExecutor')

class AccountDeletionStageError extends Error {
  constructor(
    readonly code: string,
    cause?: unknown,
  ) {
    super(code, cause ? { cause } : undefined)
  }
}

@injectable()
export class AccountDeletionExecutor {
  constructor(
    private readonly dbAccessor: DbAccessor,
    private readonly apple: AppleAuthorizationService,
    private readonly dataManagement: DataManagementService,
    private readonly entitlements: BillingEntitlementService,
  ) {}

  async process(requestId: string): Promise<void> {
    const request = await this.claim(requestId)
    if (!request || !request.subjectUserId) {
      return
    }
    try {
      let stage = request.stage
      let warningCode: string | null = request.lastErrorCode
      while (stage !== 'completed') {
        switch (stage) {
          case 'revoke_providers': {
            const revocation = await this.apple.revokeForUser(request.subjectUserId).catch((error) => {
              logger.error('Apple revocation stage failed unexpectedly', { requestId, error })
              return { failed: 1, revoked: 0 }
            })
            warningCode = revocation.failed > 0 ? 'APPLE_REVOCATION_FAILED' : warningCode
            stage = 'resolve_billing'
            break
          }
          case 'resolve_billing': {
            await this.resolveBilling(request.impactSnapshot as unknown as AccountDeletionImpact)
            stage = 'delete_storage'
            break
          }
          case 'delete_storage': {
            await this.deleteStorage(request.impactSnapshot as unknown as AccountDeletionImpact)
            stage = 'finalize_database'
            break
          }
          case 'finalize_database': {
            await this.finalize(
              request.id,
              request.subjectUserId,
              request.impactSnapshot as unknown as AccountDeletionImpact,
            )
            return
          }
        }
        await this.advance(request.id, stage, warningCode)
      }
    }
    catch (error) {
      await this.recordFailure(request, error)
    }
  }

  private async claim(requestId: string) {
    const db = this.dbAccessor.get()
    const now = new Date()
    const leaseUntil = new Date(now.getTime() + PROCESSING_LEASE_MS).toISOString()
    const [request] = await db
      .update(accountDeletionRequests)
      .set({ nextAttemptAt: leaseUntil, status: 'processing', updatedAt: now.toISOString() })
      .where(
        and(
          eq(accountDeletionRequests.id, requestId),
          inArray(accountDeletionRequests.status, ['requested', 'retryable_failure', 'processing']),
          or(
            isNull(accountDeletionRequests.nextAttemptAt),
            lte(accountDeletionRequests.nextAttemptAt, now.toISOString()),
          ),
        ),
      )
      .returning()
    return request ?? null
  }

  private async resolveBilling(impact: AccountDeletionImpact): Promise<void> {
    const db = this.dbAccessor.get()
    for (const subscription of impact.subscriptions) {
      if (['canceled', 'cancelled', 'expired', 'revoked'].includes(subscription.status.toLowerCase())) {
        continue
      }
      if (subscription.provider === 'creem' && subscription.subscriptionId) {
        if (!env.CREEM_API_KEY) {
          throw new AccountDeletionStageError('CREEM_NOT_CONFIGURED')
        }
        try {
          await cancelSubscription(
            { apiKey: env.CREEM_API_KEY, testMode: env.NODE_ENV !== 'production' },
            subscription.subscriptionId,
          )
        }
        catch (error) {
          throw new AccountDeletionStageError('CREEM_CANCELLATION_FAILED', error)
        }
      }
      if (subscription.provider === 'creem' && subscription.subscriptionId) {
        await db
          .update(creemSubscriptions)
          .set({ cancelAtPeriodEnd: false, status: 'canceled', updatedAt: new Date().toISOString() })
          .where(eq(creemSubscriptions.creemSubscriptionId, subscription.subscriptionId))
      }
      if (subscription.tenantId) {
        await this.entitlements.revokeSubscription(subscription.id, subscription.tenantId)
      }
    }
  }

  private async deleteStorage(impact: AccountDeletionImpact): Promise<void> {
    for (const workspace of impact.workspaces) {
      if (workspace.action !== 'delete') {
        continue
      }
      try {
        await this.dataManagement.deleteManagedStorageForTenantId(workspace.tenantId)
      }
      catch (error) {
        throw new AccountDeletionStageError('MANAGED_STORAGE_DELETION_FAILED', error)
      }
    }
  }

  private async finalize(requestId: string, userId: string, impact: AccountDeletionImpact): Promise<void> {
    const db = this.dbAccessor.get()
    await db.transaction(async (tx) => {
      await tx.execute(sql`select id from ${authUsers} where ${authUsers.id} = ${userId} for update`)
      const transferredTenantIds: string[] = []
      for (const workspace of impact.workspaces) {
        const freshMembers = await tx
          .select({
            createdAt: tenantMemberships.createdAt,
            email: authUsers.email,
            name: authUsers.name,
            role: tenantMemberships.role,
            status: tenantMemberships.status,
            userId: tenantMemberships.userId,
          })
          .from(tenantMemberships)
          .innerJoin(authUsers, eq(authUsers.id, tenantMemberships.userId))
          .where(eq(tenantMemberships.tenantId, workspace.tenantId))
        const successor = selectOwnerSuccessor(freshMembers, userId)
        if (successor) {
          await tx
            .update(tenantMemberships)
            .set({ role: 'member', updatedAt: new Date().toISOString() })
            .where(
              and(
                eq(tenantMemberships.tenantId, workspace.tenantId),
                eq(tenantMemberships.userId, userId),
                eq(tenantMemberships.role, 'owner'),
              ),
            )
          await tx
            .update(tenantMemberships)
            .set({ role: 'owner', updatedAt: new Date().toISOString() })
            .where(
              and(
                eq(tenantMemberships.tenantId, workspace.tenantId),
                eq(tenantMemberships.userId, successor.userId),
                eq(tenantMemberships.status, 'active'),
              ),
            )
          transferredTenantIds.push(workspace.tenantId)
          continue
        }
        if (workspace.slug === ROOT_TENANT_SLUG) {
          throw new AccountDeletionStageError('ROOT_TENANT_REQUIRES_OWNER_TRANSFER')
        }
        await tx.delete(tenants).where(eq(tenants.id, workspace.tenantId))
      }

      const now = new Date().toISOString()
      // A transferred workspace outlives its former owner, so its billing subject must be released
      // rather than tombstoned: the successor has to be able to purchase. Rotating the App Store
      // account token also detaches the departing owner's Apple identity, so their renewal
      // notifications no longer resolve to this workspace.
      for (const tenantId of transferredTenantIds) {
        await tx
          .update(billingSubjects)
          .set({ appAccountToken: randomUUID(), billingOwnerUserId: null, updatedAt: now })
          .where(eq(billingSubjects.tenantId, tenantId))
      }
      // Deleted workspaces take their billing subject with them via the tenant cascade, so the
      // remaining rows are subjects whose workspace neither moved nor was removed.
      await tx
        .update(billingSubjects)
        .set({ billingOwnerUserId: null, tombstonedAt: now, updatedAt: now })
        .where(eq(billingSubjects.billingOwnerUserId, userId))

      const subscriptionIds = impact.subscriptions.map(subscription => subscription.id)
      if (subscriptionIds.length > 0) {
        await tx.delete(billingSubscriptions).where(inArray(billingSubscriptions.id, subscriptionIds))
      }
      const creemSubscriptionIds = impact.subscriptions
        .filter(subscription => subscription.provider === 'creem' && subscription.subscriptionId)
        .map(subscription => subscription.subscriptionId as string)
      if (creemSubscriptionIds.length > 0) {
        await tx.delete(creemSubscriptions).where(inArray(creemSubscriptions.creemSubscriptionId, creemSubscriptionIds))
      }
      const [user] = await tx
        .select({ email: authUsers.email })
        .from(authUsers)
        .where(eq(authUsers.id, userId))
        .limit(1)
      if (user) {
        await tx
          .delete(authVerifications)
          .where(
            or(
              eq(authVerifications.identifier, userId),
              eq(authVerifications.value, userId),
              eq(authVerifications.identifier, user.email),
            ),
          )
      }
      await tx.delete(authUsers).where(eq(authUsers.id, userId))
      await tx
        .update(accountDeletionRequests)
        .set({
          completedAt: now,
          impactSnapshot: {
            deletedWorkspaces: impact.workspaces.filter(workspace => workspace.action === 'delete').length,
            transferredWorkspaces: impact.workspaces.filter(workspace => workspace.action === 'transfer').length,
          },
          nextAttemptAt: null,
          stage: 'completed',
          status: 'completed',
          subjectUserId: null,
          updatedAt: now,
        })
        .where(eq(accountDeletionRequests.id, requestId))
    })
  }

  private async advance(
    requestId: string,
    stage: 'delete_storage' | 'finalize_database' | 'resolve_billing',
    warningCode: string | null,
  ): Promise<void> {
    const db = this.dbAccessor.get()
    await db
      .update(accountDeletionRequests)
      .set({ lastErrorCode: warningCode, stage, updatedAt: new Date().toISOString() })
      .where(eq(accountDeletionRequests.id, requestId))
  }

  private async recordFailure(request: typeof accountDeletionRequests.$inferSelect, error: unknown): Promise<void> {
    const attempts = request.attempts + 1
    const manualIntervention = attempts >= MAX_ATTEMPTS
    const delayMs = Math.min(60 * 60 * 1000, 2 ** attempts * 30_000)
    const errorCode = error instanceof AccountDeletionStageError ? error.code : 'ACCOUNT_DELETION_STAGE_FAILED'
    logger.error('Account deletion stage failed', {
      requestId: request.id,
      stage: request.stage,
      attempts,
      error,
    })
    if (manualIntervention) {
      logger.error('Account deletion requires manual intervention', {
        requestId: request.id,
        stage: request.stage,
        attempts,
        errorCode,
      })
    }
    const db = this.dbAccessor.get()
    await db
      .update(accountDeletionRequests)
      .set({
        attempts,
        lastErrorCode: errorCode,
        nextAttemptAt: manualIntervention ? null : new Date(Date.now() + delayMs).toISOString(),
        status: manualIntervention ? 'manual_intervention' : 'retryable_failure',
        updatedAt: new Date().toISOString(),
      })
      .where(eq(accountDeletionRequests.id, request.id))
  }
}
