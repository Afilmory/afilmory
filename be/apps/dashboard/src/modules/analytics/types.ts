export interface UploadTrendPoint {
  month: string
  uploads: number
}

export interface StorageProviderUsage {
  provider: string
  bytes: number
  photoCount: number
}

export interface StorageUsageSummary {
  totalBytes: number
  totalPhotos: number
  currentMonthBytes: number
  previousMonthBytes: number
  providers: StorageProviderUsage[]
}

export interface PopularTagStat {
  tag: string
  count: number
}

export interface DeviceStat {
  device: string
  count: number
}

export interface DashboardAnalyticsResponse {
  uploadTrends: UploadTrendPoint[]
  storageUsage: StorageUsageSummary
  popularTags: PopularTagStat[]
  topDevices: DeviceStat[]
}
