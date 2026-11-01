import Foundation

enum StudioHomeRoute: String, CaseIterable, Sendable {
  case analytics = "/studio/analytics"
  case comments = "/studio/comments"
  case library = "/studio/library"
  case operations = "/studio/operations"
  case site = "/studio/site"
  case domain = "/studio/domain"
}

enum StudioPhotoSyncStatus: String, Decodable, Sendable {
  case conflict
  case pending
  case synced
}

struct StudioDashboardSyncStats: Decodable, Sendable {
  let pending: Int
  let conflicts: Int
}

struct StudioDashboardStats: Decodable, Sendable {
  let totalPhotos: Int
  let totalStorageBytes: Int64
  let thisMonthUploads: Int
  let sync: StudioDashboardSyncStats
}

struct StudioRecentActivity: Decodable, Sendable {
  let id: String
  let title: String
  let createdAt: String
  let storageProvider: String
  let syncStatus: StudioPhotoSyncStatus
}

struct StudioDashboardOverview: Decodable, Sendable {
  let stats: StudioDashboardStats
  let recentActivity: [StudioRecentActivity]
}

struct StudioPendingComment: Decodable, Sendable {
  let id: String
}

struct StudioPendingCommentsPage: Decodable, Sendable {
  let comments: [StudioPendingComment]
  let nextCursor: String?
}

struct StudioDataSyncRun: Decodable, Sendable {
  let completedAt: String
}

struct StudioDataSyncStatus: Decodable, Sendable {
  let lastRun: StudioDataSyncRun?
}

struct StudioHomeSnapshot: Sendable {
  let overview: StudioDashboardOverview
  let pendingComments: Int
  let pendingCommentsHasMore: Bool
  let syncStatus: StudioDataSyncStatus
}

private struct StudioWorkspaceSwitchBody: Encodable {
  let tenantId: String
}

private struct StudioWorkspaceSwitchResponse: Decodable {
  let activeWorkspace: AfilmorySessionWorkspace
}

