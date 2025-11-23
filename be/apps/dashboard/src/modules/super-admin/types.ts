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

export type SuperAdminSettingsResponse =
  | (SuperAdminSettingsResponseShape & {
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

export type BuilderDebugProgressEvent =
  | {
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

export interface SuperAdminTenantSummary {
  id: string
  name: string
  slug: string
  planId: string
  status: 'active' | 'inactive' | 'suspended'
  banned: boolean
  createdAt: string
  updatedAt: string
  usageTotals?: BillingUsageTotalsEntry[]
}

export interface SuperAdminTenantListResponse {
  tenants: SuperAdminTenantSummary[]
  plans: BillingPlanDefinition[]
}

export interface UpdateTenantPlanPayload {
  tenantId: string
  planId: string
}

export interface UpdateTenantBanPayload {
  tenantId: string
  banned: boolean
}

export interface SuperAdminTenantPhotosResponse {
  photos: PhotoAssetListItem[]
}
