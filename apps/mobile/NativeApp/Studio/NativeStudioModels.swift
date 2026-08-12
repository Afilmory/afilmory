import Foundation

struct StudioAnalyticsResponse: Decodable, Sendable {
  struct UploadTrend: Decodable, Identifiable, Sendable {
    let month: String
    let uploads: Int

    var id: String { month }
  }

  struct Provider: Decodable, Identifiable, Sendable {
    let provider: String
    let bytes: Double
    let photoCount: Int

    var id: String { provider }
  }

  struct StorageUsage: Decodable, Sendable {
    let totalBytes: Double
    let totalPhotos: Int
    let currentMonthBytes: Double
    let previousMonthBytes: Double
    let providers: [Provider]
  }

  struct RankedValue: Decodable, Identifiable, Sendable {
    let tag: String?
    let device: String?
    let count: Int

    var id: String { tag ?? device ?? UUID().uuidString }
    var label: String { tag ?? device ?? "" }
  }

  let uploadTrends: [UploadTrend]
  let storageUsage: StorageUsage
  let popularTags: [RankedValue]
  let topDevices: [RankedValue]
}

struct StudioCommentRecord: Decodable, Identifiable, Sendable {
  let id: String
  let photoId: String
  let parentId: String?
  let userId: String
  let content: String
  let status: String
  let createdAt: String
  let updatedAt: String
  @FlexibleReactionCounts var reactionCounts: [String: Int]
  let viewerReactions: [String]
}

struct StudioCommentUserRecord: Decodable, Sendable {
  let id: String
  let name: String
  let image: String?
}

struct StudioCommentsPage: Decodable, Sendable {
  let comments: [StudioCommentRecord]
  let relations: [String: StudioCommentRecord]
  let users: [String: StudioCommentUserRecord]
  let nextCursor: String?
}

struct StudioDataSyncSummary: Decodable, Sendable {
  let storageObjects: Int
  let databaseRecords: Int
  let inserted: Int
  let updated: Int
  let deleted: Int
  let conflicts: Int
  let skipped: Int
  let errors: Int
}

struct StudioDataSyncRunRecord: Decodable, Sendable {
  let id: String
  let dryRun: Bool
  let summary: StudioDataSyncSummary
  let actionsCount: Int
  let startedAt: String
  let completedAt: String
}

struct StudioDataSyncStatusResponse: Decodable, Sendable {
  let lastRun: StudioDataSyncRunRecord?
}

struct StudioDataSyncConflictRecord: Decodable, Identifiable, Sendable {
  let id: String
  let storageKey: String
  let photoId: String?
  let reason: String?
  let storageProvider: String
  let updatedAt: String
}

struct StudioQuotaDetails: Decodable, Sendable {
  let reason: String?
  let actualMb: Double?
  let capacityBytes: Double?
  let current: Double?
  let incomingBytes: Double?
  let limit: Double?
  let limitMb: Double?
  let requested: Double?
  let used: Double?
  let usedBytes: Double?

  var dictionary: [String: Any] {
    var values: [String: Any] = [:]
    if let reason { values["reason"] = reason }
    let numbers: [String: Double?] = [
      "actualMb": actualMb,
      "capacityBytes": capacityBytes,
      "current": current,
      "incomingBytes": incomingBytes,
      "limit": limit,
      "limitMb": limitMb,
      "requested": requested,
      "used": used,
      "usedBytes": usedBytes,
    ]
    for (key, value) in numbers {
      if let value { values[key] = NSNumber(value: value) }
    }
    return values
  }
}

struct StudioQuotaRejection: Error {
  let message: String
  let reason: QuotaWallReason
}

struct StudioDataSyncProgressEvent: Decodable, Sendable {
  struct Payload: Decodable, Sendable {
    let summary: StudioDataSyncSummary?
    let processed: Int?
    let total: Int?
    let index: Int?
    let message: String?
    let details: StudioQuotaDetails?
  }

  let type: String
  let payload: Payload
}

struct StudioSiteSchemaResponse: Decodable, Sendable {
  struct Schema: Decodable, Sendable {
    let version: String
    let title: String
    let description: String?
    let sections: [Node]
  }

  struct Component: Decodable, Sendable {
    let type: String
    let placeholder: String?
    let inputType: String?
    let autoCapitalize: String?
    let autoCorrect: Bool?
    let minRows: Int?
    let maxRows: Int?
    let options: [String]?
    let allowCustom: Bool?
    let presentation: String?
    let supportsOpacity: Bool?
    let trueLabel: String?
    let falseLabel: String?
    let revealable: Bool?
    let name: String?
  }

  struct Node: Decodable, Identifiable, Sendable {
    let type: String
    let id: String
    let title: String
    let description: String?
    let helperText: String?
    let key: String?
    let component: Component?
    let required: Bool?
    let hidden: Bool?
    let children: [Node]?
  }

  let schema: Schema
  let values: [String: String?]
}

struct StudioSiteSettingsUpdateBody: Encodable {
  struct Entry: Encodable {
    let key: String
    let value: String
  }

  let entries: [Entry]
}
