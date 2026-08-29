import type { PhotoManifestItem } from '@afilmory/builder'

import type { BillingUsageTotalsEntry, PhotoAssetListItem, PhotoSyncLogLevel } from '../photos/types'
import type { SchemaFormValue, UiSchema } from '../schema-form/types'
import type { StorageProvider } from '../storage-providers/types'

export type SuperAdminSettingField = string

export type SuperAdminSettings = Record<SuperAdminSettingField, SchemaFormValue | undefined>
export type SuperAdminSettingsWithStorage = SuperAdminSettings & {
  storagePlanCatalog?: Record<string, unknown>
  storagePlanPricing?: Record<string, unknown>
  storagePlanProducts?: Record<string, unknown>
  managedStorageProvider?: string | null
  managedStorageProviders?: StorageProvider[]
}

export interface SuperAdminStats {
  totalUsers: number
  registrationsRemaining: number | null
}

type SuperAdminSettingsResponseShape = {
  schema: UiSchema<SuperAdminSettingField>
  stats: SuperAdminStats
}

export type SuperAdminSettingsResponse
  = | (SuperAdminSettingsResponseShape & {
    values: SuperAdminSettings
    settings?: never
  })
  | (SuperAdminSettingsResponseShape & {
    settings: SuperAdminSettings
    values?: never
  })

export type UpdateSuperAdminSettingsPayload = Partial<{
  managedStorageProvider: string | null
  managedStorageProviders: StorageProvider[]
  storagePlanCatalog: Record<string, unknown>
  storagePlanPricing: Record<string, unknown>
  storagePlanProducts: Record<string, unknown>
}>

export interface ManagedStorageProbeResult {
  providerId: string
  providerType: string
  fileName: string
  objectKey: string
  size: number
  checksum: string
  etag: string | null
  uploadDurationMs: number
  readDurationMs: number
  cleanupDurationMs: number
  cleanupSucceeded: boolean
  cleanupError: string | null
}

export type BuilderDebugProgressEvent
  = | {
    type: 'start'
    payload: {
      storageKey: string
      filename: string
      contentType: string | null
      size: number
    }
  }
  | {
    type: 'log'
    payload: {
      level: PhotoSyncLogLevel
      message: string
      timestamp: string
      details?: Record<string, unknown> | null
    }
  }
  | {
    type: 'complete'
    payload: BuilderDebugResult
  }
  | {
    type: 'error'
    payload: {
      message: string
    }
  }

export interface BuilderDebugResult {
  storageKey: string
  resultType: 'new' | 'processed' | 'skipped' | 'failed'
  manifestItem: PhotoManifestItem | null
  thumbnailUrl: string | null
  filesDeleted: boolean
}

export interface BillingPlanQuota {
  customDomainLimit: number | null
  monthlyAssetProcessLimit: number | null
  libraryItemLimit: number | null
  maxUploadSizeMb: number | null
  maxSyncObjectSizeMb: number | null
}

export interface BillingPlanDefinition {
  id: string
  name: string
  description: string
  quotas: BillingPlanQuota
}

export interface StoragePlanDefinition {
  id: string
  name: string
  description?: string | null
  capacityBytes?: number | null
}

export interface TenantStorageUsageSummary {
  totalBytes: number
  fileCount: number
}

export interface SuperAdminTenantSummary {
  id: string
  name: string
  slug: string
  planId: string
  storagePlanId?: string | null
  storageUsage?: TenantStorageUsageSummary | null
  status: 'active' | 'inactive' | 'suspended'
  banned: boolean
  createdAt: string
  updatedAt: string
  usageTotals?: BillingUsageTotalsEntry[]
}

export interface SuperAdminTenantListResponse {
  tenants: SuperAdminTenantSummary[]
  plans: BillingPlanDefinition[]
  storagePlans: StoragePlanDefinition[]
  total: number
}

export interface SuperAdminTenantListParams {
  page: number
  limit: number
  search?: string
  status?: string
  sortBy?: string
  sortDir?: 'asc' | 'desc'
}

export interface UpdateTenantPlanPayload {
  tenantId: string
  planId: string
}

export interface UpdateTenantStoragePlanPayload {
  tenantId: string
  storagePlanId: string | null
}

export interface UpdateTenantBanPayload {
  tenantId: string
  banned: boolean
}

export interface SuperAdminTenantPhotosResponse {
  photos: PhotoAssetListItem[]
}

export type UserCommercialStatus = 'none' | 'free-owner' | 'paid-owner' | 'paid-member' | 'mixed'

export interface SuperAdminUserStats {
  totalUsers: number
  newUsers7d: number
  newUsers30d: number
  activeUsers7d: number
  activeUsers30d: number
  dormantUsers90d: number
  verifiedUsers: number
  bannedUsers: number
  deletingUsers: number
}

export interface SuperAdminUserSummary {
  id: string
  name: string
  email: string
  image: string | null
  emailVerified: boolean
  role: 'user' | 'superadmin'
  banned: boolean
  banReason: string | null
  banExpires: string | null
  twoFactorEnabled: boolean
  hadTrial: boolean
  deletionRequestedAt: string | null
  createdAt: string
  updatedAt: string
  lastSignedInAt: string | null
  lastActiveAt: string | null
  lastActiveSurface: string | null
  membershipCount: number
  mobileDeviceCount: number
  mobileLastSeenAt: string | null
  latestAppVersion: string | null
  commercialStatus: UserCommercialStatus
}

export interface SuperAdminUserListParams {
  page: number
  limit: number
  search?: string
  status?: 'active' | 'banned' | 'deleting'
  emailVerified?: boolean
  hasMobileDevice?: boolean
  commercialStatus?: UserCommercialStatus
  sortBy?: 'createdAt' | 'lastSignedInAt' | 'lastActiveAt' | 'name'
  sortDir?: 'asc' | 'desc'
}

export interface SuperAdminUserListResponse {
  users: SuperAdminUserSummary[]
  total: number
  stats: SuperAdminUserStats
}

export interface SuperAdminUserDetailResponse {
  user: SuperAdminUserSummary & {
    username?: string | null
    displayUsername?: string | null
    creemCustomerId?: string | null
  }
  memberships: Array<{
    id: string
    tenantId: string
    tenantName: string
    tenantSlug: string
    role: string
    status: string
    planId: string
    storagePlanId: string | null
    tenantStatus: string
    createdAt: string
  }>
  accounts: Array<{ providerId: string, createdAt: string, updatedAt: string }>
  sessions: Array<{
    id: string
    activeTenantId: string | null
    ipAddress: string | null
    userAgent: string | null
    createdAt: string
    updatedAt: string
    expiresAt: string
  }>
  activities: Array<{
    id: string
    tenantId: string | null
    eventType: string
    surface: string
    appVersion: string | null
    occurredAt: string
    metadata: Record<string, unknown> | null
  }>
  devices: Array<{
    id: string
    environment: string
    locale: string | null
    appVersion: string | null
    enabled: boolean
    lastSeenAt: string
    createdAt: string
  }>
  mobileSummary: {
    activityCount: number
    deviceCount: number
    lastSeenAt: string | null
    latestAppVersion: string | null
  }
  subscriptions: Array<{
    tenantId: string
    tenantName: string
    tenantSlug: string
    planId: string
    subscriptionId: string | null
    productId: string | null
    status: string | null
    periodStart: string | null
    periodEnd: string | null
    cancelAtPeriodEnd: boolean | null
  }>
  social: { comments: number, commentReactions: number, gallerySubscriptions: number }
}

export type CleanupSubjectType = 'tenant' | 'user'
export type CleanupMode = 'suspend' | 'delete'

export interface CleanupCriteria {
  inactiveMonths: number
  maxPhotos: number
  maxStorageMb: number
  onlyReported: boolean
  minSuspendedDays: number
}

export interface CleanupCandidate {
  subjectType: CleanupSubjectType
  id: string
  label: string
  secondaryLabel: string | null
  ownerName: string | null
  ownerEmail: string | null
  workspaceCount: number | null
  createdAt: string
  lastActivityAt: string
  photoCount: number
  storageBytes: number
  reportCount: number
}

export interface CleanupCandidatesResponse {
  subjectType: CleanupSubjectType
  criteria: CleanupCriteria
  candidates: CleanupCandidate[]
  total: number
  cutoff: string
  suspendConfirmation: string
  deleteConfirmation: string
}

export interface CleanupPendingItem {
  id: string
  batchId: string
  subjectType: CleanupSubjectType
  tenantId: string | null
  userId: string | null
  subjectLabel: string | null
  tenantSlug: string | null
  suspendedAt: string
  minSuspendedDays: number
  dueAt: string
}

export interface CleanupResult {
  batchId: string
  suspendedCount: number
  deletedCount: number
  skippedCount: number
  failedCount: number
  completedAt: string
}

export interface SuperAdminAuditLog {
  id: string
  actorUserId: string | null
  action: string
  targetType: string
  targetId: string
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
  requestId: string | null
  batchId: string | null
  result: string
  errorCode: string | null
  occurredAt: string
}

export interface SuperAdminAuditLogResponse {
  logs: SuperAdminAuditLog[]
  total: number
}
