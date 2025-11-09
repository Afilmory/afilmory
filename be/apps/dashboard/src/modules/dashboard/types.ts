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
  syncStatus: 'pending' | 'synced' | 'conflict'
  tags: string[]
  previewUrl: string | null
}

export interface DashboardOverviewResponse {
  stats: DashboardStats
  recentActivity: DashboardRecentActivityItem[]
}
