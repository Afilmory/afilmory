import { generateId } from '@afilmory/be-utils'
import {
  bigint,
  boolean,
  doublePrecision,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core'

function createSnowflakeId(name: string) {
  return text(name).$defaultFn(() => generateId())
}
const snowflakeId = createSnowflakeId('id').primaryKey()

type JsonRecord = Record<string, unknown>

export type PhotoManifestJson = {
  id: string
  title: string
  description: string
  dateTaken: string
  tags: string[]
  originalUrl: string
  thumbnailUrl: string
  thumbHash: string | null
  width: number
  height: number
  aspectRatio: number
  s3Key: string
  lastModified: string
  size: number
  exif: JsonRecord | null
  toneAnalysis: JsonRecord | null
  isLivePhoto?: boolean
  isHDR?: boolean
  livePhotoVideoUrl?: string | null
  livePhotoVideoS3Key?: string | null
}

type CameraInfoJson = {
  make: string
  model: string
  displayName: string
}

type LensInfoJson = {
  make?: string | null
  model: string
  displayName: string
}

// =========================
// Better Auth custom schema
// =========================

export const userRoleEnum = pgEnum('user_role', ['user', 'admin', 'superadmin'])

export const tenantStatusEnum = pgEnum('tenant_status', ['active', 'inactive', 'suspended'])

export const tenants = pgTable(
  'tenant',
  {
    id: snowflakeId,
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    status: tenantStatusEnum('status').notNull().default('inactive'),
    primaryDomain: text('primary_domain'),
    createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'string' }).defaultNow().notNull(),
  },
  (t) => [unique('uq_tenant_slug').on(t.slug)],
)

export const tenantDomains = pgTable(
  'tenant_domain',
  {
    id: snowflakeId,
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    domain: text('domain').notNull(),
    isPrimary: boolean('is_primary').notNull().default(false),
    createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'string' }).defaultNow().notNull(),
  },
  (t) => [unique('uq_tenant_domain_domain').on(t.domain)],
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

export const photos = pgTable(
  'photo',
  {
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    id: text('id').notNull(),
    storageKey: text('storage_key').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull(),
    dateTaken: timestamp('date_taken', { mode: 'string' }).notNull(),
    tags: jsonb('tags').notNull().$type<string[]>(),
    originalUrl: text('original_url').notNull(),
    thumbnailUrl: text('thumbnail_url').notNull(),
    thumbHash: text('thumb_hash'),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    aspectRatio: doublePrecision('aspect_ratio').notNull(),
    size: bigint('size', { mode: 'number' }).notNull(),
    lastModified: timestamp('last_modified', { mode: 'string' }).notNull(),
    manifest: jsonb('manifest').notNull().$type<PhotoManifestJson>(),
    exif: jsonb('exif').$type<JsonRecord | null>(),
    toneAnalysis: jsonb('tone_analysis').$type<JsonRecord | null>(),
    isLivePhoto: boolean('is_live_photo').notNull().default(false),
    isHdr: boolean('is_hdr').notNull().default(false),
    livePhotoVideoUrl: text('live_photo_video_url'),
    livePhotoVideoKey: text('live_photo_video_key'),
    syncedAt: timestamp('synced_at', { mode: 'string' }).defaultNow().notNull(),
    createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'string' }).defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.tenantId, table.id], name: 'pk_photo_tenant' }),
    storageKeyUnique: unique('uq_photo_storage').on(table.tenantId, table.storageKey),
  }),
)

export const photoManifests = pgTable(
  'photo_manifest',
  {
    id: snowflakeId,
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    version: text('version').notNull(),
    totalPhotos: integer('total_photos').notNull().default(0),
    cameras: jsonb('cameras').notNull().$type<CameraInfoJson[]>(),
    lenses: jsonb('lenses').notNull().$type<LensInfoJson[]>(),
    syncedAt: timestamp('synced_at', { mode: 'string' }).defaultNow().notNull(),
    createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'string' }).defaultNow().notNull(),
  },
  (table) => [unique('uq_photo_manifest_tenant').on(table.tenantId)],
)

export const dbSchema = {
  tenants,
  tenantDomains,
  authUsers,
  authSessions,
  authAccounts,
  settings,
  photos,
  photoManifests,
}

export type DBSchema = typeof dbSchema
