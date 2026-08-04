import { authAccounts, authUsers, creemSubscriptions, tenantMemberships, tenants } from '@afilmory/db'
import { DbAccessor } from '@core/database/database.provider'
import { eq, inArray, or } from 'drizzle-orm'
import { injectable } from 'tsyringe'

import { selectOwnerSuccessor } from './account-deletion.policy'
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
    const [user, memberships, accounts] = await Promise.all([
      db
        .select({ creemCustomerId: authUsers.creemCustomerId })
        .from(authUsers)
        .where(eq(authUsers.id, userId))
        .limit(1)
        .then(records => records[0] ?? null),
      db
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
        .where(eq(tenantMemberships.userId, userId)),
      db.select({ providerId: authAccounts.providerId }).from(authAccounts).where(eq(authAccounts.userId, userId)),
    ])

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

    const subscriptions = await this.listSubscriptions(ownedTenantIds, user?.creemCustomerId ?? null)

    return {
      joinedWorkspaces: memberships
        .filter(membership => membership.role !== 'owner')
        .map(({ name, slug, tenantId }) => ({ name, slug, tenantId })),
      proofMethods: this.resolveProofMethods(accounts.map(account => account.providerId)),
      subscriptions,
      workspaces,
    }
  }

  private async listSubscriptions(tenantIds: string[], creemCustomerId: string | null) {
    const conditions = [
      tenantIds.length > 0 ? inArray(creemSubscriptions.tenantId, tenantIds) : null,
      creemCustomerId ? eq(creemSubscriptions.creemCustomerId, creemCustomerId) : null,
    ].filter((condition): condition is NonNullable<typeof condition> => Boolean(condition))
    if (conditions.length === 0) {
      return []
    }
    const db = this.dbAccessor.get()
    return await db
      .select({
        id: creemSubscriptions.id,
        status: creemSubscriptions.status,
        subscriptionId: creemSubscriptions.creemSubscriptionId,
        tenantId: creemSubscriptions.tenantId,
      })
      .from(creemSubscriptions)
      .where(conditions.length === 1 ? conditions[0] : or(...conditions))
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
