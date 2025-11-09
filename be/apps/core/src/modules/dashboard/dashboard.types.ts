import type { photoAssets } from '@afilmory/db'

type PhotoAssetSyncStatus = (typeof photoAssets.$inferSelect)['syncStatus']

export interface DashboardStats {
  totalPhotos: number
  totalStorageBytes: number
  thisMonthUploads: number
  previousMonthUploads: number
  sync: {
    synced: number
    pending: number
    conflicts: number
  }
}

export interface DashboardRecentActivityItem {
  id: string
  photoId: string
  title: string
  description: string | null
  createdAt: string
  takenAt: string | null
  storageProvider: string
  size: number | null
  syncStatus: PhotoAssetSyncStatus
  tags: string[]
  previewUrl: string | null
}

export interface DashboardOverview {
  stats: DashboardStats
  recentActivity: DashboardRecentActivityItem[]
}

export interface DashboardUploadTrendPoint {
  month: string
  uploads: number
}

export interface DashboardStorageProviderUsage {
  provider: string
  bytes: number
  photoCount: number
}

export interface DashboardStorageUsage {
  totalBytes: number
  totalPhotos: number
  currentMonthBytes: number
  previousMonthBytes: number
  providers: DashboardStorageProviderUsage[]
}

export interface DashboardTagStat {
  tag: string
  count: number
}

export interface DashboardDeviceStat {
  device: string
  count: number
}

export interface DashboardAnalytics {
  uploadTrends: DashboardUploadTrendPoint[]
  storageUsage: DashboardStorageUsage
  popularTags: DashboardTagStat[]
  topDevices: DashboardDeviceStat[]
}
