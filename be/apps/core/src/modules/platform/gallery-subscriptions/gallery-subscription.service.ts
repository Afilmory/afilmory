import {
  authUsers,
  gallerySubscriptions,
  photoAssets,
  settings,
  tenantDomains,
  tenantMemberships,
  tenants,
} from '@afilmory/db'
import { DbAccessor } from '@core/database/database.provider'
import { BizException, ErrorCode } from '@core/errors'
import { normalizeDate } from '@core/helpers/normalize.helper'
import { UserSafetyService } from '@core/modules/platform/user-safety/user-safety.service'
import { and, asc, eq, gte, inArray, notInArray, sql } from 'drizzle-orm'
import { injectable } from 'tsyringe'

import { evaluateGallerySubscription } from './gallery-subscription.policy'
import type { GallerySubscriptionSummary, SubscriptionTarget } from './gallery-subscription-list.policy'
import { assembleSubscriptionSummaries } from './gallery-subscription-list.policy'
import { toGalleryPhotoPreview } from './gallery-subscription-preview'
import type { GalleryPhotoPreview } from './gallery-subscription-timeline.policy'
import { clusterTimelineEvents, TIMELINE_WINDOW_DAYS } from './gallery-subscription-timeline.policy'
import { parseTimelineQuery } from './gallery-subscription-timeline.query'

export type { GallerySubscriptionSummary }

export type GallerySubscriptionRecord = {
  createdAt: string
  tenantId: string
}

@injectable()
export class GallerySubscriptionService {
  constructor(
    private readonly dbAccessor: DbAccessor,
    private readonly userSafety: UserSafetyService,
  ) {}

  async listForUser(userId: string): Promise<GallerySubscriptionSummary[]> {
    const context = await this.loadEligibleTargets(userId)
    if (context.subscriptions.length === 0) {
      return []
    }
    const { photoCounts, photos } = await this.loadSubscriptionPhotos(Object.keys(context.targets))
    return assembleSubscriptionSummaries({
      ...context,
      photoCounts,
      photos,
    })
  }

  async listTimelineForUser(userId: string, query: { cursor?: string, limit: number, timeZone: string }) {
    const parsed = parseTimelineQuery(query)
    const context = await this.loadEligibleTargets(userId)
    const tenantIds = Object.entries(context.targets)
      .filter(([tenantId, target]) => {
        return evaluateGallerySubscription(
          { banned: target.banned, slug: target.slug, status: target.status },
          context.memberTenantIds.has(tenantId),
        ).allowed
      })
      .map(([tenantId]) => tenantId)

    const since = new Date(Date.now() - TIMELINE_WINDOW_DAYS * 24 * 60 * 60 * 1000)
    const { photos } = await this.loadSubscriptionPhotos(tenantIds, since)
    const clustered = clusterTimelineEvents({
      photos: Object.entries(photos).flatMap(([tenantId, items]) => items.map(preview => ({ tenantId, preview }))),
      timeZone: parsed.timeZone,
      limit: parsed.limit,
      cursor: parsed.cursor,
    })

    return {
      events: clustered.events.flatMap((event) => {
        const target = context.targets[event.tenantId]
        if (!target) {
          return []
        }
        return [
          {
            ...event,
            gallery: {
              id: event.tenantId,
              name: target.name,
              slug: target.slug,
              author: target.author,
            },
          },
        ]
      }),
      nextCursor: clustered.nextCursor,
    }
  }

  async loadEligibleTargets(userId: string): Promise<{
    memberTenantIds: Set<string>
    subscriptions: GallerySubscriptionRecord[]
    targets: Record<string, SubscriptionTarget>
  }> {
    const db = this.dbAccessor.get()
    const blockedTenantIds = await this.userSafety.blockedOwnerTenantIds(userId)
    const subscriptions = await db
      .select({
        tenantId: gallerySubscriptions.targetTenantId,
        createdAt: gallerySubscriptions.createdAt,
      })
      .from(gallerySubscriptions)
      .where(
        and(
          eq(gallerySubscriptions.subscriberUserId, userId),
          blockedTenantIds.length > 0 ? notInArray(gallerySubscriptions.targetTenantId, blockedTenantIds) : undefined,
        ),
      )

    if (subscriptions.length === 0) {
      return { memberTenantIds: new Set(), subscriptions: [], targets: {} }
    }

    const tenantIds = subscriptions.map(item => item.tenantId)
    const [tenantRows, siteNames, authors, domains, memberships] = await Promise.all([
      db
        .select({
          id: tenants.id,
          name: tenants.name,
          slug: tenants.slug,
          banned: tenants.banned,
          status: tenants.status,
        })
        .from(tenants)
        .where(inArray(tenants.id, tenantIds)),
      db
        .select({
          tenantId: settings.tenantId,
          value: settings.value,
        })
        .from(settings)
        .where(and(inArray(settings.tenantId, tenantIds), eq(settings.key, 'site.name'))),
      db
        .select({
          tenantId: tenantMemberships.tenantId,
          name: authUsers.name,
          image: authUsers.image,
        })
        .from(authUsers)
        .innerJoin(tenantMemberships, eq(tenantMemberships.userId, authUsers.id))
        .where(and(inArray(tenantMemberships.tenantId, tenantIds), eq(tenantMemberships.status, 'active')))
        .orderBy(
          sql`case when ${tenantMemberships.role} = 'owner' then 0 when ${tenantMemberships.role} = 'admin' then 1 else 2 end`,
          asc(authUsers.createdAt),
        ),
      db
        .select({
          tenantId: tenantDomains.tenantId,
          domain: tenantDomains.domain,
        })
        .from(tenantDomains)
        .where(and(inArray(tenantDomains.tenantId, tenantIds), eq(tenantDomains.status, 'verified'))),
      db
        .select({ tenantId: tenantMemberships.tenantId })
        .from(tenantMemberships)
        .where(
          and(
            eq(tenantMemberships.userId, userId),
            eq(tenantMemberships.status, 'active'),
            inArray(tenantMemberships.tenantId, tenantIds),
          ),
        ),
    ])

    const nameByTenant = new Map(siteNames.map(row => [row.tenantId, row.value]))
    const authorByTenant = new Map<string, { avatar: string | null, name: string }>()
    for (const author of authors) {
      if (!authorByTenant.has(author.tenantId)) {
        authorByTenant.set(author.tenantId, { name: author.name, avatar: author.image ?? null })
      }
    }
    const domainByTenant = new Map<string, string>()
    for (const domain of domains) {
      if (!domainByTenant.has(domain.tenantId)) {
        domainByTenant.set(domain.tenantId, domain.domain)
      }
    }

    const targets: Record<string, SubscriptionTarget> = {}
    for (const tenant of tenantRows) {
      targets[tenant.id] = {
        banned: tenant.banned,
        slug: tenant.slug,
        status: tenant.status,
        name: nameByTenant.get(tenant.id) || tenant.name,
        domain: domainByTenant.get(tenant.id) ?? null,
        author: authorByTenant.get(tenant.id) ?? null,
      }
    }

    return {
      subscriptions: subscriptions.map(item => ({
        tenantId: item.tenantId,
        createdAt: normalizeDate(item.createdAt) ?? item.createdAt,
      })),
      targets,
      memberTenantIds: new Set(memberships.map(item => item.tenantId)),
    }
  }

  async loadSubscriptionPhotos(
    tenantIds: string[],
    since?: Date,
  ): Promise<{
    photoCounts: Record<string, number>
    photos: Record<string, GalleryPhotoPreview[]>
  }> {
    const photoCounts: Record<string, number> = {}
    const photos: Record<string, GalleryPhotoPreview[]> = {}
    if (tenantIds.length === 0) {
      return { photoCounts, photos }
    }

    const db = this.dbAccessor.get()
    const rows = await db
      .select({
        tenantId: photoAssets.tenantId,
        photoId: photoAssets.photoId,
        syncedAt: photoAssets.syncedAt,
        manifest: photoAssets.manifest,
      })
      .from(photoAssets)
      .where(
        and(
          inArray(photoAssets.tenantId, tenantIds),
          inArray(photoAssets.syncStatus, ['synced', 'conflict']),
          since ? gte(photoAssets.syncedAt, since.toISOString()) : undefined,
        ),
      )

    for (const row of rows) {
      photoCounts[row.tenantId] = (photoCounts[row.tenantId] ?? 0) + 1
      const preview = toGalleryPhotoPreview({
        photoId: row.photoId,
        syncedAt: normalizeDate(row.syncedAt) ?? String(row.syncedAt),
        manifest: row.manifest?.data,
      })
      if (!preview) {
        continue
      }
      const bucket = photos[row.tenantId]
      if (bucket) {
        bucket.push(preview)
      }
      else {
        photos[row.tenantId] = [preview]
      }
    }

    return { photoCounts, photos }
  }

  async subscribe(userId: string, targetTenantId: string): Promise<GallerySubscriptionRecord> {
    const db = this.dbAccessor.get()
    const blockedTenantIds = await this.userSafety.blockedOwnerTenantIds(userId)
    if (blockedTenantIds.includes(targetTenantId)) {
      throw new BizException(ErrorCode.COMMON_NOT_FOUND, { message: 'Gallery not found.' })
    }
    const [[target], [activeMembership]] = await Promise.all([
      db
        .select({
          banned: tenants.banned,
          slug: tenants.slug,
          status: tenants.status,
        })
        .from(tenants)
        .where(eq(tenants.id, targetTenantId))
        .limit(1),
      db
        .select({ id: tenantMemberships.id })
        .from(tenantMemberships)
        .where(
          and(
            eq(tenantMemberships.userId, userId),
            eq(tenantMemberships.tenantId, targetTenantId),
            eq(tenantMemberships.status, 'active'),
          ),
        )
        .limit(1),
    ])

    const decision = evaluateGallerySubscription(target ?? null, Boolean(activeMembership))
    if (!decision.allowed) {
      if (decision.reason === 'own-gallery') {
        throw new BizException(ErrorCode.AUTH_FORBIDDEN, {
          message: 'A workspace member cannot subscribe to their own gallery.',
        })
      }
      throw new BizException(ErrorCode.COMMON_NOT_FOUND, { message: 'Gallery not found.' })
    }

    const [created] = await db
      .insert(gallerySubscriptions)
      .values({
        subscriberUserId: userId,
        targetTenantId,
      })
      .onConflictDoNothing()
      .returning({
        tenantId: gallerySubscriptions.targetTenantId,
        createdAt: gallerySubscriptions.createdAt,
      })

    if (created) {
      return created
    }

    const [existing] = await db
      .select({
        tenantId: gallerySubscriptions.targetTenantId,
        createdAt: gallerySubscriptions.createdAt,
      })
      .from(gallerySubscriptions)
      .where(
        and(eq(gallerySubscriptions.subscriberUserId, userId), eq(gallerySubscriptions.targetTenantId, targetTenantId)),
      )
      .limit(1)

    if (!existing) {
      throw new BizException(ErrorCode.COMMON_CONFLICT, {
        message: 'The gallery subscription could not be created.',
      })
    }

    return existing
  }

  async unsubscribe(userId: string, targetTenantId: string): Promise<boolean> {
    const db = this.dbAccessor.get()
    const deleted = await db
      .delete(gallerySubscriptions)
      .where(
        and(eq(gallerySubscriptions.subscriberUserId, userId), eq(gallerySubscriptions.targetTenantId, targetTenantId)),
      )
      .returning({ id: gallerySubscriptions.id })

    return deleted.length > 0
  }
}
