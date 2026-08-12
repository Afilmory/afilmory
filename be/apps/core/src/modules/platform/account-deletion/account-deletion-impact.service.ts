import { authAccounts, authUsers, billingSubscriptions, tenantMemberships, tenants } from '@afilmory/db'
import { DbAccessor } from '@core/database/database.provider'
import { eq, inArray, or } from 'drizzle-orm'
import { injectable } from 'tsyringe'

import { requiresExternalSubscriptionCancellation, selectOwnerSuccessor } from './account-deletion.policy'
import type {
  AccountDeletionImpact,
  AccountDeletionProofMethod,
  AccountDeletionWorkspaceImpact,
} from './account-deletion.types'

@injectable()
export class AccountDeletionImpactService {
  constructor(private readonly dbAccessor: DbAccessor) {}

  async build(userId: string): Promise<AccountDeletionImpact> {
    const db = this.dbAccessor.get()
    const memberships = await db
      .select({
        createdAt: tenantMemberships.createdAt,
        membershipId: tenantMemberships.id,
        name: tenants.name,
        role: tenantMemberships.role,
        slug: tenants.slug,
        status: tenantMemberships.status,
        tenantId: tenants.id,
      })
      .from(tenantMemberships)
      .innerJoin(tenants, eq(tenants.id, tenantMemberships.tenantId))
      .where(eq(tenantMemberships.userId, userId))
    const accounts = await db
      .select({ providerId: authAccounts.providerId })
      .from(authAccounts)
      .where(eq(authAccounts.userId, userId))

    const ownedTenantIds = memberships
      .filter(membership => membership.status === 'active' && membership.role === 'owner')
      .map(membership => membership.tenantId)
    const candidates
      = ownedTenantIds.length === 0
        ? []
        : await db
            .select({
              createdAt: tenantMemberships.createdAt,
              email: authUsers.email,
              name: authUsers.name,
              role: tenantMemberships.role,
              status: tenantMemberships.status,
              tenantId: tenantMemberships.tenantId,
              userId: tenantMemberships.userId,
            })
            .from(tenantMemberships)
            .innerJoin(authUsers, eq(authUsers.id, tenantMemberships.userId))
            .where(inArray(tenantMemberships.tenantId, ownedTenantIds))

    const workspaces: AccountDeletionWorkspaceImpact[] = memberships
      .filter(membership => membership.status === 'active' && membership.role === 'owner')
      .map((membership) => {
        const successor = selectOwnerSuccessor(
          candidates.filter(candidate => candidate.tenantId === membership.tenantId),
          userId,
        )
        return {
          action: successor ? 'transfer' : 'delete',
          name: membership.name,
          slug: membership.slug,
          tenantId: membership.tenantId,
          transferTo: successor
            ? {
                email: successor.email,
                name: successor.name,
                role: successor.role as 'admin' | 'member',
                userId: successor.userId,
              }
            : null,
        }
      })

    const subscriptions = await this.listSubscriptions(userId, ownedTenantIds)

    return {
      joinedWorkspaces: memberships
        .filter(membership => membership.role !== 'owner')
        .map(({ name, slug, tenantId }) => ({ name, slug, tenantId })),
      proofMethods: this.resolveProofMethods(accounts.map(account => account.providerId)),
      subscriptions,
      workspaces,
    }
  }

  private async listSubscriptions(userId: string, tenantIds: string[]) {
    const conditions = [
      tenantIds.length > 0 ? inArray(billingSubscriptions.tenantId, tenantIds) : null,
      eq(billingSubscriptions.billingOwnerUserId, userId),
    ].filter((condition): condition is NonNullable<typeof condition> => Boolean(condition))
    const db = this.dbAccessor.get()
    const records = await db
      .select({
        id: billingSubscriptions.id,
        provider: billingSubscriptions.provider,
        status: billingSubscriptions.status,
        subscriptionId: billingSubscriptions.externalSubscriptionId,
        tenantId: billingSubscriptions.tenantId,
      })
      .from(billingSubscriptions)
      .where(conditions.length === 1 ? conditions[0] : or(...conditions))
    return records.map(subscription => ({
      ...subscription,
      requiresExternalCancellation: requiresExternalSubscriptionCancellation(
        subscription.provider,
        subscription.status,
      ),
    }))
  }

  private resolveProofMethods(providerIds: string[]): AccountDeletionProofMethod[] {
    const methods: AccountDeletionProofMethod[] = []
    if (providerIds.includes('credential')) {
      methods.push('password')
    }
    if (providerIds.includes('apple')) {
      methods.push('apple')
    }
    if (methods.length === 0) {
      methods.push('recent-session')
    }
    return methods
  }
}
