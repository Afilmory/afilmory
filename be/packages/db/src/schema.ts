import type { PhotoManifestItem } from '@afilmory/builder'
import { bigint, boolean, index, jsonb, pgEnum, pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core'

import { generateId } from './snowflake'

function createSnowflakeId(name: string) {
  return text(name).$defaultFn(() => generateId())
}
const snowflakeId = createSnowflakeId('id').primaryKey()

// =========================
// Better Auth custom schema
// =========================

export const userRoleEnum = pgEnum('user_role', ['user', 'admin', 'superadmin'])

export const tenantStatusEnum = pgEnum('tenant_status', ['active', 'inactive', 'suspended'])
export const photoSyncStatusEnum = pgEnum('photo_sync_status', ['pending', 'synced', 'conflict'])
export const CURRENT_PHOTO_MANIFEST_VERSION = 'v7' as const

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
  version: typeof CURRENT_PHOTO_MANIFEST_VERSION
  data: PhotoManifestItem
}

export const tenants = pgTable(
  'tenant',
  {
    id: snowflakeId,
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    status: tenantStatusEnum('status').notNull().default('inactive'),
    createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'string' }).defaultNow().notNull(),
  },
  (t) => [unique('uq_tenant_slug').on(t.slug)],
)

// Custom users table (Better Auth: user)
export const authUsers = pgTable('auth_user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').default(false).notNull(),
  image: text('image'),
  role: userRoleEnum('role').notNull().default('user'),
  tenantId: text('tenant_id').references(() => tenants.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'string' }).defaultNow().notNull(),
  twoFactorEnabled: boolean('two_factor_enabled').default(false).notNull(),
  username: text('username'),
  displayUsername: text('display_username'),
  banned: boolean('banned').default(false).notNull(),
  banReason: text('ban_reason'),
  banExpires: timestamp('ban_expires_at', { mode: 'string' }),
})

// Custom sessions table (Better Auth: session)
export const authSessions = pgTable('auth_session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at', { mode: 'string' }).notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'string' }).defaultNow().notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  tenantId: text('tenant_id').references(() => tenants.id, { onDelete: 'set null' }),
  userId: text('user_id')
    .notNull()
    .references(() => authUsers.id, { onDelete: 'cascade' }),
})

// Custom accounts table (Better Auth: account)
export const authAccounts = pgTable('auth_account', {
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
})

export const authVerifications = pgTable('auth_verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { mode: 'string' }).notNull(),
  createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'string' }).defaultNow().notNull(),
})

export const tenantAuthUsers = pgTable(
  'tenant_auth_user',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    email: text('email').notNull(),
    emailVerified: boolean('email_verified').default(false).notNull(),
    image: text('image'),
    role: text('role').default('guest').notNull(),
    createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'string' }).defaultNow().notNull(),
    twoFactorEnabled: boolean('two_factor_enabled').default(false).notNull(),
    username: text('username'),
    displayUsername: text('display_username'),
    banned: boolean('banned').default(false).notNull(),
    banReason: text('ban_reason'),
    banExpires: timestamp('ban_expires_at', { mode: 'string' }),
  },
  (t) => [unique('uq_tenant_auth_user_tenant_email').on(t.tenantId, t.email)],
)

export const tenantAuthSessions = pgTable('tenant_auth_session', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { mode: 'string' }).notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'string' }).defaultNow().notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id')
    .notNull()
    .references(() => tenantAuthUsers.id, { onDelete: 'cascade' }),
})

export const tenantAuthAccounts = pgTable('tenant_auth_account', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => tenantAuthUsers.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', { mode: 'string' }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { mode: 'string' }),
  scope: text('scope'),
  password: text('password'),
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
  (t) => [unique('uq_settings_tenant_key').on(t.tenantId, t.key)],
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
  (t) => [unique('uq_system_setting_key').on(t.key)],
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
  (t) => [index('idx_reactions_tenant_ref_key').on(t.tenantId, t.refKey)],
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
  (t) => [
    unique('uq_photo_asset_tenant_storage_key').on(t.tenantId, t.storageKey),
    unique('uq_photo_asset_tenant_photo_id').on(t.tenantId, t.photoId),
  ],
)

export const dbSchema = {
  tenants,
  authUsers,
  authSessions,
  authAccounts,
  tenantAuthUsers,
  tenantAuthSessions,
  tenantAuthAccounts,
  settings,
  systemSettings,
  reactions,
  photoAssets,
}

export type DBSchema = typeof dbSchema
