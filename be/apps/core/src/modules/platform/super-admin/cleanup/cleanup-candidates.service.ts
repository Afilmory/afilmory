import type { CleanupCriteria } from '@afilmory/db'
import {
  authSessions,
  authUsers,
  contentReports,
  creemSubscriptions,
  managedStorageFileReferences,
  photoAssets,
  platformActivityEvents,
  tenantCleanupItems,
  tenantDomains,
  tenantMemberships,
  tenants,
} from '@afilmory/db'
import { DbAccessor } from '@core/database/database.provider'
import { and, desc, eq, inArray, isNull, lt, sql } from 'drizzle-orm'
import { injectable } from 'tsyringe'

import type { CleanupCandidate } from './cleanup.shared'
import { calculateInactiveCutoff } from './cleanup.shared'

const MB = 1024 * 1024

// Drizzle omits the table qualifier for a single-table FROM, which collides with the aliases
// inside these correlated subqueries. Reference the outer row explicitly.
const TENANT_ID = sql.raw('"tenant"."id"')
const USER_ID = sql.raw('"auth_user"."id"')

const tenantPhotoCount = sql<number>`(select count(*)::int from ${photoAssets} p where p.tenant_id = ${TENANT_ID})`

const tenantStorageBytes = sql<number>`(
  (select coalesce(sum(p.size), 0)::bigint from ${photoAssets} p where p.tenant_id = ${TENANT_ID})
  + (select coalesce(sum(f.size), 0)::bigint from ${managedStorageFileReferences} f where f.tenant_id = ${TENANT_ID})
)`

const tenantReportCount = sql<number>`(
  select count(*)::int from ${contentReports} r
  where r.tenant_id = ${TENANT_ID} and r.status in ('pending', 'actioned')
)`

// tenants.updatedAt is deliberately excluded: suspending a tenant writes that column, as does
// any admin edit, and counting it as owner activity would silently cancel a pending deletion.
const tenantLastActivity = sql<string>`greatest(
  ${tenants.createdAt},
  coalesce((select max(a.occurred_at) from ${platformActivityEvents} a where a.tenant_id = ${TENANT_ID}), ${tenants.createdAt}),
  coalesce((select max(s.updated_at) from ${authSessions} s where s.active_tenant_id = ${TENANT_ID}), ${tenants.createdAt}),
  coalesce((select max(m.updated_at) from ${tenantMemberships} m where m.tenant_id = ${TENANT_ID}), ${tenants.createdAt})
)`

const userLastActivity = sql<string>`greatest(
  ${authUsers.createdAt},
  coalesce(${authUsers.lastSignedInAt}, ${authUsers.createdAt}),
  coalesce(${authUsers.lastActiveAt}, ${authUsers.createdAt}),
  coalesce((select max(s.updated_at) from ${authSessions} s where s.user_id = ${USER_ID}), ${authUsers.createdAt})
)`

const userPhotoCount = sql<number>`(
  select count(*)::int from ${photoAssets} p
  join ${tenantMemberships} m on m.tenant_id = p.tenant_id
  where m.user_id = ${USER_ID} and m.status = 'active' and m.role = 'owner'
)`

const userStorageBytes = sql<number>`(
  select coalesce(sum(p.size), 0)::bigint from ${photoAssets} p
  join ${tenantMemberships} m on m.tenant_id = p.tenant_id
  where m.user_id = ${USER_ID} and m.status = 'active' and m.role = 'owner'
)`

const userWorkspaceCount = sql<number>`(
  select count(*)::int from ${tenantMemberships} m
  where m.user_id = ${USER_ID} and m.status = 'active' and m.role = 'owner'
)`

const userReportCount = sql<number>`(
  select count(*)::int from ${contentReports} r
  where r.reported_user_id = ${USER_ID} and r.status in ('pending', 'actioned')
)`

// A subject already queued for deletion must not be offered again while its batch item is live.
const tenantHasLiveCleanupItem = sql`exists(
  select 1 from ${tenantCleanupItems} i
  where i.tenant_id = ${TENANT_ID} and i.status = 'suspended'
)`

const userHasLiveCleanupItem = sql`exists(
  select 1 from ${tenantCleanupItems} i
  where i.user_id = ${USER_ID} and i.status = 'suspended'
)`

@injectable()
export class CleanupCandidatesService {
  constructor(private readonly dbAccessor: DbAccessor) {}

  async listTenants(criteria: CleanupCriteria, restrictIds?: string[]): Promise<CleanupCandidate[]> {
    const cutoffIso = calculateInactiveCutoff(new Date(), criteria.inactiveMonths).toISOString()
    const maxStorageBytes = criteria.maxStorageMb * MB
    const db = this.dbAccessor.get()

    const rows = await db
      .select({
        id: tenants.id,
        label: tenants.name,
        secondaryLabel: tenants.slug,
        createdAt: tenants.createdAt,
        lastActivityAt: tenantLastActivity,
        photoCount: tenantPhotoCount,
        storageBytes: tenantStorageBytes,
        reportCount: tenantReportCount,
        ownerName: sql<string | null>`(
          select u.name from ${tenantMemberships} m
          join ${authUsers} u on u.id = m.user_id
          where m.tenant_id = ${TENANT_ID} and m.role = 'owner' and m.status = 'active'
          limit 1
        )`,
        ownerEmail: sql<string | null>`(
          select u.email from ${tenantMemberships} m
          join ${authUsers} u on u.id = m.user_id
          where m.tenant_id = ${TENANT_ID} and m.role = 'owner' and m.status = 'active'
          limit 1
        )`,
      })
      .from(tenants)
      .where(
        and(
          inArray(tenants.status, ['active', 'inactive']),
          eq(tenants.banned, false),
          eq(tenants.planId, 'free'),
          isNull(tenants.storagePlanId),
          lt(tenants.createdAt, cutoffIso),
          sql`${tenantLastActivity} < ${cutoffIso}`,
          sql`${tenantPhotoCount} <= ${criteria.maxPhotos}`,
          sql`${tenantStorageBytes} <= ${maxStorageBytes}`,
          criteria.onlyReported ? sql`${tenantReportCount} > 0` : undefined,
          sql`not exists(select 1 from ${tenantDomains} d where d.tenant_id = ${TENANT_ID} and d.status = 'verified')`,
          sql`not exists(
            select 1 from ${creemSubscriptions} cs
            where cs.tenant_id = ${TENANT_ID}
              and (cs.status in ('active', 'trialing', 'pending') or cs.period_end > now())
          )`,
          sql`not exists(
            select 1 from ${tenantMemberships} m
            join ${authSessions} s on s.user_id = m.user_id
            where m.tenant_id = ${TENANT_ID} and m.status = 'active' and s.updated_at >= ${cutoffIso}
          )`,
          sql`${tenants.slug} <> 'root'`,
          sql`not ${tenantHasLiveCleanupItem}`,
          restrictIds && restrictIds.length > 0 ? inArray(tenants.id, restrictIds) : undefined,
        ),
      )
      .orderBy(desc(tenants.createdAt))

    return rows.map(row => ({
      ...row,
      subjectType: 'tenant' as const,
      workspaceCount: null,
    }))
  }

  async listUsers(criteria: CleanupCriteria, restrictIds?: string[]): Promise<CleanupCandidate[]> {
    const cutoffIso = calculateInactiveCutoff(new Date(), criteria.inactiveMonths).toISOString()
    const maxStorageBytes = criteria.maxStorageMb * MB
    const db = this.dbAccessor.get()

    const rows = await db
      .select({
        id: authUsers.id,
        label: authUsers.name,
        secondaryLabel: authUsers.email,
        createdAt: authUsers.createdAt,
        lastActivityAt: userLastActivity,
        photoCount: userPhotoCount,
        storageBytes: userStorageBytes,
        reportCount: userReportCount,
        workspaceCount: userWorkspaceCount,
      })
      .from(authUsers)
      .where(
        and(
          sql`${authUsers.role} <> 'superadmin'`,
          isNull(authUsers.deletionRequestedAt),
          lt(authUsers.createdAt, cutoffIso),
          sql`${userLastActivity} < ${cutoffIso}`,
          sql`${userPhotoCount} <= ${criteria.maxPhotos}`,
          sql`${userStorageBytes} <= ${maxStorageBytes}`,
          criteria.onlyReported ? sql`${userReportCount} > 0` : undefined,
          // Any active membership in a workspace that is itself worth keeping protects the user.
          sql`not exists(
            select 1 from ${tenantMemberships} m
            join ${tenants} t on t.id = m.tenant_id
            where m.user_id = ${USER_ID}
              and m.status = 'active'
              and (
                t.plan_id <> 'free'
                or t.storage_plan_id is not null
                or t.slug = 'root'
                or (select count(*) from ${photoAssets} p where p.tenant_id = t.id) > ${criteria.maxPhotos}
                or (select coalesce(sum(f.size), 0) from ${managedStorageFileReferences} f where f.tenant_id = t.id) > ${maxStorageBytes}
                or exists(select 1 from ${tenantDomains} d where d.tenant_id = t.id and d.status = 'verified')
                or exists(
                  select 1 from ${creemSubscriptions} cs
                  where cs.tenant_id = t.id
                    and (cs.status in ('active', 'trialing', 'pending') or cs.period_end > now())
                )
              )
          )`,
          sql`not ${userHasLiveCleanupItem}`,
          restrictIds && restrictIds.length > 0 ? inArray(authUsers.id, restrictIds) : undefined,
        ),
      )
      .orderBy(desc(authUsers.createdAt))

    return rows.map(row => ({
      ...row,
      subjectType: 'user' as const,
      ownerName: null,
      ownerEmail: null,
    }))
  }

  async list(subjectType: 'tenant' | 'user', criteria: CleanupCriteria, restrictIds?: string[]) {
    return subjectType === 'tenant' ? this.listTenants(criteria, restrictIds) : this.listUsers(criteria, restrictIds)
  }

  async resolveLastActivity(subjectType: 'tenant' | 'user', id: string): Promise<string | null> {
    const db = this.dbAccessor.get()
    if (subjectType === 'tenant') {
      const [row] = await db
        .select({ lastActivityAt: tenantLastActivity })
        .from(tenants)
        .where(eq(tenants.id, id))
        .limit(1)
      return row?.lastActivityAt ?? null
    }
    const [row] = await db
      .select({ lastActivityAt: userLastActivity })
      .from(authUsers)
      .where(eq(authUsers.id, id))
      .limit(1)
    return row?.lastActivityAt ?? null
  }
}
