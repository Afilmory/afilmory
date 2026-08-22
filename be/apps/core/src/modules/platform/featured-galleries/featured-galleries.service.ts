import {
  authUsers,
  gallerySubscriptions,
  photoAssets,
  settings,
  tenantDomains,
  tenantMemberships,
  tenants,
} from '@afilmory/db'
import { RESERVED_TENANT_SLUGS } from '@afilmory/utils'
import { DbAccessor } from '@core/database/database.provider'
import { normalizeDate } from '@core/helpers/normalize.helper'
import { UserSafetyService } from '@core/modules/platform/user-safety/user-safety.service'
import { and, asc, eq, ilike, inArray, notInArray, or, sql } from 'drizzle-orm'
import { injectable } from 'tsyringe'

import { galleryDirectoryMatchRank } from './gallery-directory-ranking'

const DIRECTORY_LIKE_META_PATTERN = /[%_\\]/g

@injectable()
export class FeaturedGalleriesService {
  constructor(
    private readonly dbAccessor: DbAccessor,
    private readonly userSafety: UserSafetyService,
  ) {}

  async listFeaturedGalleries(userId?: string, options: { query?: string, limit?: number } = {}) {
    const db = this.dbAccessor.get()
    const query = options.query?.trim()
    const limit = Math.min(Math.max(options.limit ?? 20, 1), 40)
    const blockedTenantIds = userId ? await this.userSafety.blockedOwnerTenantIds(userId) : []
    const visibilityConditions = [
      eq(tenants.banned, false),
      eq(tenants.status, 'active'),
      notInArray(tenants.slug, RESERVED_TENANT_SLUGS),
      blockedTenantIds.length > 0 ? notInArray(tenants.id, blockedTenantIds) : undefined,
    ]
    const escapedQuery = query?.replaceAll(DIRECTORY_LIKE_META_PATTERN, '\\$&')
    const searchPattern = escapedQuery ? `%${escapedQuery}%` : undefined
    const directoryRows = await db
      .select({
        id: tenants.id,
        tenantName: tenants.name,
        slug: tenants.slug,
        siteName: settings.value,
        authorName: authUsers.name,
      })
      .from(tenants)
      .leftJoin(settings, and(eq(settings.tenantId, tenants.id), eq(settings.key, 'site.name')))
      .leftJoin(
        tenantMemberships,
        and(
          eq(tenantMemberships.tenantId, tenants.id),
          eq(tenantMemberships.status, 'active'),
          eq(tenantMemberships.role, 'owner'),
        ),
      )
      .leftJoin(authUsers, eq(authUsers.id, tenantMemberships.userId))
      .where(
        and(
          ...visibilityConditions,
          searchPattern
            ? or(
                ilike(tenants.name, searchPattern),
                ilike(tenants.slug, searchPattern),
                ilike(settings.value, searchPattern),
                ilike(authUsers.name, searchPattern),
              )
            : undefined,
        ),
      )

    const directoryCandidates = new Map<
      string,
      { tenantName: string, slug: string, siteName: string | null, authorName: string | null }
    >()
    for (const row of directoryRows) {
      const current = directoryCandidates.get(row.id)
      directoryCandidates.set(row.id, {
        tenantName: current?.tenantName ?? row.tenantName,
        slug: current?.slug ?? row.slug,
        siteName: current?.siteName ?? row.siteName,
        authorName: current?.authorName ?? row.authorName,
      })
    }

    if (directoryCandidates.size === 0) {
      return { galleries: [] }
    }

    const candidateTenantIds = [...directoryCandidates.keys()]
    const candidateTenantList = sql.join(
      candidateTenantIds.map(tenantId => sql`${tenantId}`),
      sql`, `,
    )

    // Step 1: Calculate quality scores for all valid tenants with photos
    // Quality score formula:
    // - Photo count: 1 point per photo
    // - Total size: 0.1 points per MB (indicates high quality images)
    // - EXIF info: 2 points per photo with EXIF data (indicates professional shooting)
    // - Unique tags: 5 points per unique tag (indicates content diversity)
    // - GPS info: 1 point per photo with GPS (indicates complete metadata)
    const qualityScores = await db.execute<{
      tenant_id: string
      photo_count: number
      total_size_bytes: number
      exif_count: number
      unique_tag_count: number
      gps_count: number
      quality_score: number
    }>(sql`
      with tenant_quality as (
        select
          ${photoAssets.tenantId} as tenant_id,
          count(*)::int as photo_count,
          coalesce(sum(${photoAssets.size}), 0)::bigint as total_size_bytes,
          count(case when ${photoAssets.manifest}->'data'->'exif'->>'Make' is not null 
                     and ${photoAssets.manifest}->'data'->'exif'->>'Make' != '' then 1 end)::int as exif_count,
          count(case when ${photoAssets.manifest}->'data'->'exif'->'GPSLatitude' is not null 
                     or ${photoAssets.manifest}->'data'->'exif'->'GPSLongitude' is not null then 1 end)::int as gps_count
        from ${photoAssets}
        where ${photoAssets.syncStatus} in ('synced', 'conflict')
          and ${photoAssets.tenantId} in (${candidateTenantList})
        group by ${photoAssets.tenantId}
      ),
      tenant_tags as (
        select
          ${photoAssets.tenantId} as tenant_id,
          count(distinct tag)::int as unique_tag_count
        from ${photoAssets},
        lateral jsonb_array_elements_text(${photoAssets.manifest}->'data'->'tags') as tag
        where ${photoAssets.syncStatus} in ('synced', 'conflict')
          and ${photoAssets.tenantId} in (${candidateTenantList})
          and nullif(trim(tag), '') is not null
        group by ${photoAssets.tenantId}
      ),
      tenant_scores as (
        select
          tq.tenant_id,
          tq.photo_count,
          tq.total_size_bytes,
          tq.exif_count,
          coalesce(tt.unique_tag_count, 0) as unique_tag_count,
          tq.gps_count,
          -- Quality score calculation
          (tq.photo_count * 1.0 +                                    -- Photo count: 1 point each
           (tq.total_size_bytes / 1024.0 / 1024.0) * 0.1 +          -- Size: 0.1 points per MB
           tq.exif_count * 2.0 +                                     -- EXIF: 2 points each
           coalesce(tt.unique_tag_count, 0) * 5.0 +                 -- Tags: 5 points each
           tq.gps_count * 1.0) as quality_score                      -- GPS: 1 point each
        from tenant_quality tq
        left join tenant_tags tt on tq.tenant_id = tt.tenant_id
        where tq.photo_count > 0
      )
      select * from tenant_scores
    `)

    if (qualityScores.rows.length === 0) {
      return { galleries: [] }
    }

    const selectedScores = [...qualityScores.rows]
      .sort((a, b) => {
        if (query) {
          const aDirectory = directoryCandidates.get(a.tenant_id)
          const bDirectory = directoryCandidates.get(b.tenant_id)
          const rankA = galleryDirectoryMatchRank(query, [
            aDirectory?.siteName,
            aDirectory?.tenantName,
            aDirectory?.slug,
            aDirectory?.authorName,
          ])
          const rankB = galleryDirectoryMatchRank(query, [
            bDirectory?.siteName,
            bDirectory?.tenantName,
            bDirectory?.slug,
            bDirectory?.authorName,
          ])
          if (rankA !== rankB)
            return rankA - rankB
        }
        return Number(b.quality_score) - Number(a.quality_score)
      })
      .slice(0, limit)

    const topTenantIds = selectedScores.map(row => row.tenant_id)
    const scoreMap = new Map(
      selectedScores.map(row => [
        row.tenant_id,
        {
          photoCount: row.photo_count,
          totalSizeBytes: row.total_size_bytes,
          exifCount: row.exif_count,
          uniqueTagCount: row.unique_tag_count,
          gpsCount: row.gps_count,
          qualityScore: row.quality_score,
        },
      ]),
    )

    // Step 2: Fetch tenant basic info
    const tenantRecords = await db
      .select()
      .from(tenants)
      .where(and(inArray(tenants.id, topTenantIds), eq(tenants.banned, false), eq(tenants.status, 'active')))

    const validTenants = tenantRecords

    if (validTenants.length === 0) {
      return { galleries: [] }
    }

    const finalTenantIds = validTenants.map(t => t.id)

    // Step 3: Fetch all related data in parallel
    const [siteSettings, authors, domains, lastUpdatedRows, subscriptions, ownMemberships] = await Promise.all([
      // Site settings
      db
        .select()
        .from(settings)
        .where(
          and(inArray(settings.tenantId, finalTenantIds), inArray(settings.key, ['site.name', 'site.description'])),
        ),
      // Primary authors
      db
        .select({
          tenantId: tenantMemberships.tenantId,
          name: authUsers.name,
          image: authUsers.image,
        })
        .from(authUsers)
        .innerJoin(tenantMemberships, eq(tenantMemberships.userId, authUsers.id))
        .where(and(inArray(tenantMemberships.tenantId, finalTenantIds), eq(tenantMemberships.status, 'active')))
        .orderBy(
          sql`case when ${tenantMemberships.role} = 'owner' then 0 when ${tenantMemberships.role} = 'admin' then 1 else 2 end`,
          asc(authUsers.createdAt),
        ),
      // Verified domains
      db
        .select({
          tenantId: tenantDomains.tenantId,
          domain: tenantDomains.domain,
        })
        .from(tenantDomains)
        .where(and(inArray(tenantDomains.tenantId, finalTenantIds), eq(tenantDomains.status, 'verified'))),
      // Last photo library update time per tenant
      db
        .select({
          tenantId: photoAssets.tenantId,
          lastUpdatedAt: sql<Date>`max(${photoAssets.updatedAt})`,
        })
        .from(photoAssets)
        .where(
          and(inArray(photoAssets.tenantId, finalTenantIds), inArray(photoAssets.syncStatus, ['synced', 'conflict'])),
        )
        .groupBy(photoAssets.tenantId),
      userId
        ? db
            .select({ tenantId: gallerySubscriptions.targetTenantId })
            .from(gallerySubscriptions)
            .where(
              and(
                eq(gallerySubscriptions.subscriberUserId, userId),
                inArray(gallerySubscriptions.targetTenantId, finalTenantIds),
              ),
            )
        : Promise.resolve([]),
      userId
        ? db
            .select({ tenantId: tenantMemberships.tenantId })
            .from(tenantMemberships)
            .where(
              and(
                eq(tenantMemberships.userId, userId),
                eq(tenantMemberships.status, 'active'),
                inArray(tenantMemberships.tenantId, finalTenantIds),
              ),
            )
        : Promise.resolve([]),
    ])

    // Step 4: Fetch popular tags for top tenants (batch query)
    const tagMap = new Map<string, string[]>()
    for (const tenantId of finalTenantIds) {
      const tagsResult = await db.execute<{ tag: string | null, count: number | null }>(sql`
        select tag, count(*)::int as count
        from (
          select nullif(trim(jsonb_array_elements_text(${photoAssets.manifest}->'data'->'tags')), '') as tag
          from ${photoAssets}
          where ${photoAssets.tenantId} = ${tenantId}
            and ${photoAssets.syncStatus} in ('synced', 'conflict')
        ) as tag_items
        where tag is not null and tag != ''
        group by tag
        order by count desc
        limit 5
      `)

      const tags = tagsResult.rows
        .map((row) => {
          const tag = row.tag?.trim()
          return tag && tag.length > 0 ? tag : null
        })
        .filter((tag): tag is string => tag !== null)

      if (tags.length > 0) {
        tagMap.set(tenantId, tags)
      }
    }

    // Step 5: Build lookup maps
    const settingsMap = new Map<string, Map<string, string | null>>()
    for (const setting of siteSettings) {
      if (!settingsMap.has(setting.tenantId)) {
        settingsMap.set(setting.tenantId, new Map())
      }
      settingsMap.get(setting.tenantId)!.set(setting.key, setting.value)
    }

    const authorMap = new Map<string, { name: string, avatar: string | null }>()
    for (const author of authors) {
      if (!authorMap.has(author.tenantId)) {
        authorMap.set(author.tenantId, {
          name: author.name,
          avatar: author.image ?? null,
        })
      }
    }

    const domainMap = new Map<string, string>()
    const lastUpdatedMap = new Map<string, Date | null>()
    const subscriptionTenantIds = new Set(subscriptions.map(({ tenantId }) => tenantId))
    const ownTenantIds = new Set(ownMemberships.map(({ tenantId }) => tenantId))
    for (const domain of domains) {
      if (!domainMap.has(domain.tenantId)) {
        domainMap.set(domain.tenantId, domain.domain)
      }
    }

    for (const row of lastUpdatedRows) {
      lastUpdatedMap.set(row.tenantId, row.lastUpdatedAt)
    }

    // Step 6: Build response sorted by quality score
    const featuredGalleries = validTenants
      .map((tenant) => {
        const tenantSettings = settingsMap.get(tenant.id) ?? new Map()
        const author = authorMap.get(tenant.id)
        const domain = domainMap.get(tenant.id)
        const tags = tagMap.get(tenant.id) ?? []
        const score = scoreMap.get(tenant.id)

        return {
          id: tenant.id,
          name: tenantSettings.get('site.name') ?? tenant.name,
          slug: tenant.slug,
          domain: domain ?? null,
          description: tenantSettings.get('site.description') ?? null,
          author: author
            ? {
                name: author.name,
                avatar: author.avatar,
              }
            : null,
          photoCount: score?.photoCount ?? 0,
          isSubscribed: subscriptionTenantIds.has(tenant.id),
          isOwnGallery: ownTenantIds.has(tenant.id),
          tags,
          createdAt: normalizeDate(tenant.createdAt),
          lastUpload:
            normalizeDate(lastUpdatedMap.get(tenant.id) ?? undefined)
            ?? lastUpdatedMap.get(tenant.id)
            ?? normalizeDate(tenant.createdAt),
        }
      })
      .filter(gallery => gallery.photoCount > 0)
      .sort((a, b) => {
        if (query) {
          const aDirectory = directoryCandidates.get(a.id)
          const bDirectory = directoryCandidates.get(b.id)
          const rankA = galleryDirectoryMatchRank(query, [a.name, a.slug, a.author?.name, aDirectory?.tenantName])
          const rankB = galleryDirectoryMatchRank(query, [b.name, b.slug, b.author?.name, bDirectory?.tenantName])
          if (rankA !== rankB)
            return rankA - rankB
        }
        const scoreA = scoreMap.get(a.id)?.qualityScore ?? 0
        const scoreB = scoreMap.get(b.id)?.qualityScore ?? 0
        return scoreB - scoreA
      })

    return {
      galleries: featuredGalleries,
    }
  }
}
