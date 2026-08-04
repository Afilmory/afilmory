import type { PhotoManifestItem } from '@afilmory/builder'
import type { ManifestVersion } from '@afilmory/builder/manifest/version.js'
import { CURRENT_MANIFEST_VERSION } from '@afilmory/builder/manifest/version.ts'
import { relations, sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

import { generateId } from './snowflake'

function createSnowflakeId(name: string) {
  return text(name).$defaultFn(() => generateId())
}
const snowflakeId = createSnowflakeId('id').primaryKey()

// =========================
// Better Auth custom schema
// =========================

export const platformRoleEnum = pgEnum('platform_role', ['user', 'superadmin'])
export const tenantMembershipRoleEnum = pgEnum('tenant_membership_role', ['member', 'admin', 'owner'])
export const tenantMembershipStatusEnum = pgEnum('tenant_membership_status', ['active', 'suspended'])

export const tenantStatusEnum = pgEnum('tenant_status', ['pending', 'active', 'inactive', 'suspended'])
export const tenantDomainStatusEnum = pgEnum('tenant_domain_status', ['pending', 'verified', 'disabled'])
export const photoSyncStatusEnum = pgEnum('photo_sync_status', ['pending', 'synced', 'conflict'])
export const commentStatusEnum = pgEnum('comment_status', ['pending', 'approved', 'rejected', 'hidden'])
export const apnsEnvironmentEnum = pgEnum('apns_environment', ['development', 'production'])
export const appleAuthorizationStatusEnum = pgEnum('apple_authorization_status', [
  'active',
  'revoked',
  'revocation_failed',
])
export const accountDeletionStatusEnum = pgEnum('account_deletion_status', [
  'requested',
  'processing',
  'retryable_failure',
  'manual_intervention',
  'completed',
])
export const accountDeletionStageEnum = pgEnum('account_deletion_stage', [
  'revoke_providers',
  'resolve_billing',
  'delete_storage',
  'finalize_database',
  'completed',
])
export const CURRENT_PHOTO_MANIFEST_VERSION: ManifestVersion = CURRENT_MANIFEST_VERSION

export type PhotoAssetConflictType = 'missing-in-storage' | 'metadata-mismatch' | 'photo-id-conflict'
/**
 * For conflict resolution, we use this provider to mark the record as database-only. Mark it as orphan item.
 */
export const DATABASE_ONLY_PROVIDER = 'database-only'

export interface PhotoAssetConflictSnapshot {
  size: number | null
  etag: string | null
  lastModified: string | null
  metadataHash: string | null
}

export interface PhotoAssetConflictPayload {
  type: PhotoAssetConflictType
  storageSnapshot?: PhotoAssetConflictSnapshot | null
  recordSnapshot?: PhotoAssetConflictSnapshot | null
  incomingStorageKey?: string | null
}

export interface PhotoAssetManifest {
  version: ManifestVersion
  data: PhotoManifestItem
}

export interface PhotoSyncRunSummary {
  storageObjects: number
  databaseRecords: number
  inserted: number
  updated: number
  deleted: number
  conflicts: number
  skipped: number
  errors: number
}

export type ManagedStorageMetadata = Record<string, unknown>

export const tenants = pgTable(
  'tenant',
  {
    id: snowflakeId,
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    planId: text('plan_id').notNull().default('free'),
    storagePlanId: text('storage_plan_id'),
    banned: boolean('banned').notNull().default(false),
    status: tenantStatusEnum('status').notNull().default('inactive'),
    createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'string' }).defaultNow().notNull(),
  },
  t => [unique('uq_tenant_slug').on(t.slug)],
)

export const tenantDomains = pgTable(
  'tenant_domain',
  {
    id: snowflakeId,
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    domain: text('domain').notNull(),
    status: tenantDomainStatusEnum('status').notNull().default('pending'),
    verificationToken: text('verification_token').notNull(),
    verifiedAt: timestamp('verified_at', { mode: 'string' }),
    createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'string' }).defaultNow().notNull(),
  },
  t => [unique('uq_tenant_domain_domain').on(t.domain), index('idx_tenant_domain_tenant').on(t.tenantId)],
)

// Platform-global users table (Better Auth: user).
// Workspace permissions live exclusively in tenantMemberships.
export const authUsers = pgTable(
  'auth_user',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull(),
    emailVerified: boolean('email_verified').default(false).notNull(),
    image: text('image'),
    creemCustomerId: text('creem_customer_id'),
    hadTrial: boolean('had_trial').default(false).notNull(),
    role: platformRoleEnum('role').notNull().default('user'),
    createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'string' }).defaultNow().notNull(),
    twoFactorEnabled: boolean('two_factor_enabled').default(false).notNull(),
    username: text('username'),
    displayUsername: text('display_username'),
    banned: boolean('banned').default(false).notNull(),
    banReason: text('ban_reason'),
    banExpires: timestamp('ban_expires_at', { mode: 'string' }),
    deletionRequestedAt: timestamp('deletion_requested_at', { mode: 'string' }),
  },
  t => [uniqueIndex('uq_auth_user_email_normalized').on(sql`lower(trim(${t.email}))`)],
)

export const tenantMemberships = pgTable(
  'tenant_membership',
  {
    id: snowflakeId,
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    role: tenantMembershipRoleEnum('role').notNull().default('member'),
    status: tenantMembershipStatusEnum('status').notNull().default('active'),
    createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'string' }).defaultNow().notNull(),
  },
  t => [
    unique('uq_tenant_membership_tenant_user').on(t.tenantId, t.userId),
    uniqueIndex('uq_tenant_membership_active_owner')
      .on(t.tenantId)
      .where(sql`${t.role} = 'owner' and ${t.status} = 'active'`),
    index('idx_tenant_membership_user_status').on(t.userId, t.status),
    index('idx_tenant_membership_tenant_role_status').on(t.tenantId, t.role, t.status),
  ],
)

export const gallerySubscriptions = pgTable(
  'gallery_subscription',
  {
    id: snowflakeId,
    subscriberUserId: text('subscriber_user_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    targetTenantId: text('target_tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
  },
  t => [
    unique('uq_gallery_subscription_subscriber_target').on(t.subscriberUserId, t.targetTenantId),
    index('idx_gallery_subscription_target').on(t.targetTenantId),
    index('idx_gallery_subscription_subscriber_created').on(t.subscriberUserId, t.createdAt),
  ],
)

export const apnsDevices = pgTable(
  'apns_device',
  {
    id: snowflakeId,
    userId: text('user_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    deviceToken: text('device_token').notNull(),
    environment: apnsEnvironmentEnum('environment').notNull(),
    locale: text('locale'),
    appVersion: text('app_version'),
    enabled: boolean('enabled').notNull().default(true),
    lastSeenAt: timestamp('last_seen_at', { mode: 'string' }).defaultNow().notNull(),
    createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'string' }).defaultNow().notNull(),
  },
  t => [
    unique('uq_apns_device_token_environment').on(t.deviceToken, t.environment),
    index('idx_apns_device_user_enabled').on(t.userId, t.enabled),
  ],
)

// Custom sessions table (Better Auth: session)
export const authSessions = pgTable('auth_session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at', { mode: 'string' }).notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'string' }).defaultNow().notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  activeTenantId: text('active_tenant_id').references(() => tenants.id, { onDelete: 'set null' }),
  userId: text('user_id')
    .notNull()
    .references(() => authUsers.id, { onDelete: 'cascade' }),
})

// Platform-global accounts table (Better Auth: account).
export const authAccounts = pgTable(
  'auth_account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { mode: 'string' }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { mode: 'string' }),
    scope: text('scope'),
    password: text('password'),
    createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'string' }).defaultNow().notNull(),
  },
  t => [
    unique('uq_auth_account_provider').on(t.providerId, t.accountId),
    index('idx_auth_account_user').on(t.userId),
  ],
)

export const authVerifications = pgTable('auth_verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { mode: 'string' }).notNull(),
  createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'string' }).defaultNow().notNull(),
})

export const appleAuthorizations = pgTable(
  'apple_authorization',
  {
    id: snowflakeId,
    userId: text('user_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    accountId: text('account_id')
      .notNull()
      .references(() => authAccounts.id, { onDelete: 'cascade' }),
    subject: text('subject').notNull(),
    clientId: text('client_id').notNull(),
    encryptedRefreshToken: text('encrypted_refresh_token').notNull(),
    authorizationCodeHash: text('authorization_code_hash'),
    status: appleAuthorizationStatusEnum('status').notNull().default('active'),
    lastRevocationError: text('last_revocation_error'),
    revokedAt: timestamp('revoked_at', { mode: 'string' }),
    createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'string' }).defaultNow().notNull(),
  },
  t => [
    unique('uq_apple_authorization_account').on(t.accountId),
    unique('uq_apple_authorization_subject_client').on(t.subject, t.clientId),
    uniqueIndex('uq_apple_authorization_code_hash').on(t.authorizationCodeHash),
    index('idx_apple_authorization_user_status').on(t.userId, t.status),
  ],
)

export const accountDeletionRequests = pgTable(
  'account_deletion_request',
  {
    id: snowflakeId,
    subjectUserId: text('subject_user_id'),
    statusTokenHash: text('status_token_hash').notNull(),
    status: accountDeletionStatusEnum('status').notNull().default('requested'),
    stage: accountDeletionStageEnum('stage').notNull().default('revoke_providers'),
    impactSnapshot: jsonb('impact_snapshot').$type<Record<string, unknown>>().notNull(),
    attempts: integer('attempts').notNull().default(0),
    nextAttemptAt: timestamp('next_attempt_at', { mode: 'string' }),
    lastErrorCode: text('last_error_code'),
    accessRevokedAt: timestamp('access_revoked_at', { mode: 'string' }),
    completedAt: timestamp('completed_at', { mode: 'string' }),
    createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'string' }).defaultNow().notNull(),
  },
  t => [
    unique('uq_account_deletion_status_token_hash').on(t.statusTokenHash),
    uniqueIndex('uq_account_deletion_active_user')
      .on(t.subjectUserId)
      .where(sql`${t.subjectUserId} is not null and ${t.status} <> 'completed'`),
    index('idx_account_deletion_retry').on(t.status, t.nextAttemptAt),
  ],
)

export const creemSubscriptions = pgTable('creem_subscription', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').references(() => tenants.id, { onDelete: 'set null' }),
  productId: text('product_id').notNull(),
  referenceId: text('reference_id').notNull(),
  creemCustomerId: text('creem_customer_id'),
  creemSubscriptionId: text('creem_subscription_id'),
  creemOrderId: text('creem_order_id'),
  status: text('status').notNull().default('pending'),
  periodStart: timestamp('period_start', { mode: 'string' }),
  periodEnd: timestamp('period_end', { mode: 'string' }),
  cancelAtPeriodEnd: boolean('cancel_at_period_end').default(false).notNull(),
  createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'string' }).defaultNow().notNull(),
})

export const settings = pgTable(
  'settings',
  {
    id: snowflakeId,

    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    value: text('value').notNull(),

    isSensitive: boolean('is_sensitive').notNull().default(false),
    createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'string' }).defaultNow().notNull(),
  },
  t => [unique('uq_settings_tenant_key').on(t.tenantId, t.key)],
)

export const systemSettings = pgTable(
  'system_setting',
  {
    id: snowflakeId,
    key: text('key').notNull(),
    value: jsonb('value').$type<unknown | null>().default(null),
    isSensitive: boolean('is_sensitive').notNull().default(false),
    description: text('description'),
    createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'string' }).defaultNow().notNull(),
  },
  t => [unique('uq_system_setting_key').on(t.key)],
)

export const reactions = pgTable(
  'reactions',
  {
    id: snowflakeId,
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
    refKey: text('ref_key').notNull(),
    reaction: text('reaction').notNull(),
  },
  t => [index('idx_reactions_tenant_ref_key').on(t.tenantId, t.refKey)],
)

export const comments = pgTable(
  'comment',
  {
    id: snowflakeId,
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    photoId: text('photo_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    parentId: text('parent_id'),
    content: text('content').notNull(),
    status: commentStatusEnum('status').notNull().default('approved'),
    userAgent: text('user_agent'),
    clientIp: text('client_ip'),
    createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'string' }).defaultNow().notNull(),
    deletedAt: timestamp('deleted_at', { mode: 'string' }),
  },
  t => [
    foreignKey({
      name: 'fk_comment_parent',
      columns: [t.parentId],
      foreignColumns: [t.id],
    }).onDelete('set null'),
    index('idx_comment_tenant_photo').on(t.tenantId, t.photoId),
    index('idx_comment_parent').on(t.parentId),
    index('idx_comment_user').on(t.userId),
  ],
)

export const commentsRelations = relations(comments, ({ one, many }) => ({
  parent: one(comments, {
    fields: [comments.parentId],
    references: [comments.id],
  }),
  children: many(comments),
}))

export const commentReactions = pgTable(
  'comment_reaction',
  {
    id: snowflakeId,
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    commentId: text('comment_id')
      .notNull()
      .references(() => comments.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    reaction: text('reaction').notNull(),
    createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
  },
  t => [
    unique('uq_comment_reaction_user').on(t.tenantId, t.commentId, t.userId, t.reaction),
    index('idx_comment_reaction_comment').on(t.tenantId, t.commentId),
  ],
)

export const managedStorageUsages = pgTable(
  'managed_storage_usage',
  {
    id: snowflakeId,
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    providerKey: text('provider_key').notNull(),
    operation: text('operation'),
    totalBytes: bigint('total_bytes', { mode: 'number' }).notNull().default(0),
    fileCount: integer('file_count').notNull().default(0),
    periodStart: timestamp('period_start', { mode: 'string' }),
    periodEnd: timestamp('period_end', { mode: 'string' }),
    recordedAt: timestamp('recorded_at', { mode: 'string' }).defaultNow().notNull(),
    createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'string' }).defaultNow().notNull(),
  },
  t => [
    index('idx_managed_storage_usage_tenant_recorded').on(t.tenantId, t.recordedAt),
    index('idx_managed_storage_usage_provider').on(t.providerKey),
  ],
)

export const managedStorageFileReferences = pgTable(
  'managed_storage_file_reference',
  {
    id: snowflakeId,
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    providerKey: text('provider_key').notNull(),
    storageKey: text('storage_key').notNull(),
    storageProvider: text('storage_provider'),
    size: bigint('size', { mode: 'number' }),
    contentType: text('content_type'),
    etag: text('etag'),
    referenceType: text('reference_type'),
    referenceId: text('reference_id'),
    metadata: jsonb('metadata').$type<ManagedStorageMetadata | null>().default(null),
    createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'string' }).defaultNow().notNull(),
  },
  t => [
    unique('uq_managed_storage_file_ref_tenant_key').on(t.tenantId, t.storageKey),
    index('idx_managed_storage_file_ref_provider').on(t.providerKey),
    index('idx_managed_storage_file_ref_reference').on(t.referenceType, t.referenceId),
  ],
)

export const photoAssets = pgTable(
  'photo_asset',
  {
    id: snowflakeId,
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    photoId: text('photo_id').notNull(),
    storageKey: text('storage_key').notNull(),
    storageProvider: text('storage_provider').notNull(),
    size: bigint('size', { mode: 'number' }),
    etag: text('etag'),
    lastModified: timestamp('last_modified', { mode: 'string' }),
    metadataHash: text('metadata_hash'),
    manifestVersion: text('manifest_version').notNull().default(CURRENT_PHOTO_MANIFEST_VERSION),
    manifest: jsonb('manifest').$type<PhotoAssetManifest>().notNull(),
    syncStatus: photoSyncStatusEnum('sync_status').notNull().default('pending'),
    conflictReason: text('conflict_reason'),
    conflictPayload: jsonb('conflict_payload').$type<PhotoAssetConflictPayload | null>().default(null),
    syncedAt: timestamp('synced_at', { mode: 'string' }).defaultNow().notNull(),
    createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'string' }).defaultNow().notNull(),
  },
  t => [
    unique('uq_photo_asset_tenant_storage_key').on(t.tenantId, t.storageKey),
    unique('uq_photo_asset_tenant_photo_id').on(t.tenantId, t.photoId),
  ],
)

export const photoAccessLogs = pgTable(
  'photo_access_log',
  {
    id: snowflakeId,
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    photoAssetId: text('photo_asset_id')
      .notNull()
      .references(() => photoAssets.id, { onDelete: 'cascade' }),
    photoId: text('photo_id').notNull(),
    storageKey: text('storage_key').notNull(),
    provider: text('provider').notNull(),
    intent: text('intent').notNull().default('original'),
    tokenId: text('token_id').notNull(),
    signedUrl: text('signed_url').notNull(),
    status: text('status').notNull().default('issued'),
    clientIp: text('client_ip'),
    userAgent: text('user_agent'),
    referer: text('referer'),
    expiresAt: timestamp('expires_at', { mode: 'string' }),
    createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'string' }).defaultNow().notNull(),
  },
  t => [
    index('idx_photo_access_log_tenant').on(t.tenantId),
    index('idx_photo_access_log_asset').on(t.photoAssetId),
    index('idx_photo_access_log_token').on(t.tokenId),
  ],
)

export const photoAccessStats = pgTable(
  'photo_access_stat',
  {
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    photoAssetId: text('photo_asset_id')
      .notNull()
      .references(() => photoAssets.id, { onDelete: 'cascade' }),
    photoId: text('photo_id').notNull(),
    viewCount: bigint('view_count', { mode: 'number' }).notNull().default(0),
    lastViewedAt: timestamp('last_viewed_at', { mode: 'string' }),
    createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'string' }).defaultNow().notNull(),
  },
  t => [
    primaryKey({ name: 'pk_photo_access_stat', columns: [t.tenantId, t.photoAssetId] }),
    index('idx_photo_access_stat_photo').on(t.tenantId, t.photoId),
  ],
)

export const photoSyncRuns = pgTable(
  'photo_sync_run',
  {
    id: snowflakeId,
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    dryRun: boolean('dry_run').notNull().default(false),
    summary: jsonb('summary').$type<PhotoSyncRunSummary>().notNull(),
    actionsCount: integer('actions_count').notNull().default(0),
    startedAt: timestamp('started_at', { mode: 'string' }).defaultNow().notNull(),
    completedAt: timestamp('completed_at', { mode: 'string' }).defaultNow().notNull(),
    createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'string' }).defaultNow().notNull(),
  },
  t => [index('idx_photo_sync_run_tenant').on(t.tenantId)],
)

export type BillingUsageMetadata = Record<string, unknown>

export const billingUsageEvents = pgTable(
  'billing_usage_event',
  {
    id: snowflakeId,
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    eventType: text('event_type').notNull(),
    quantity: integer('quantity').notNull().default(1),
    unit: text('unit').notNull().default('count'),
    metadata: jsonb('metadata').$type<BillingUsageMetadata | null>().default(null),
    occurredAt: timestamp('occurred_at', { mode: 'string' }).defaultNow().notNull(),
    createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'string' }).defaultNow().notNull(),
  },
  t => [
    index('idx_billing_usage_event_tenant').on(t.tenantId),
    index('idx_billing_usage_event_type').on(t.eventType),
  ],
)

export const dbSchema = {
  tenants,
  tenantDomains,
  authUsers,
  tenantMemberships,
  gallerySubscriptions,
  apnsDevices,
  authSessions,
  authAccounts,
  authVerifications,
  appleAuthorizations,
  accountDeletionRequests,
  creemSubscriptions,

  settings,
  systemSettings,
  reactions,
  comments,
  commentReactions,
  managedStorageUsages,
  managedStorageFileReferences,
  photoAssets,
  photoAccessLogs,
  photoAccessStats,
  photoSyncRuns,
  billingUsageEvents,
}

export type DBSchema = typeof dbSchema
