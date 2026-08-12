import Foundation

enum UploadJobStatus: String, Codable, Sendable {
  case queued
  case uploading
  case processing
  case done
  case failed
  case cancelled

  var isActive: Bool {
    self == .queued || self == .uploading || self == .processing
  }

  var label: String {
    switch self {
    case .queued: String(localized: "QUEUED")
    case .uploading: String(localized: "UPLOADING")
    case .processing: String(localized: "PROCESSING")
    case .done: String(localized: "DONE")
    case .failed: String(localized: "FAILED")
    case .cancelled: String(localized: "CANCELLED")
    }
  }
}

struct UploadServerLogLine: Codable, Hashable, Sendable {
  var message: String
  var level: String
}

struct UploadStagedFile: Sendable {
  let url: URL
  let name: String
  let mimeType: String
}

struct UploadStagedAsset: Sendable {
  let id: String
  let photo: UploadStagedFile
  let pairedVideo: UploadStagedFile?

  init(id: String, photo: UploadStagedFile, pairedVideo: UploadStagedFile? = nil) throws {
    if let pairedVideo {
      let photoBase = Self.normalizedBaseName(photo.name)
      let videoBase = Self.normalizedBaseName(pairedVideo.name)
      guard !photoBase.isEmpty, photoBase == videoBase else {
        throw UploadPrepareError.mismatchedLivePhotoResources
      }
    }
    self.id = id
    self.photo = photo
    self.pairedVideo = pairedVideo
  }

  var files: [UploadStagedFile] {
    if let pairedVideo {
      return [photo, pairedVideo]
    }
    return [photo]
  }

  private static func normalizedBaseName(_ filename: String) -> String {
    let leaf = (filename as NSString).lastPathComponent
    return (leaf as NSString)
      .deletingPathExtension
      .trimmingCharacters(in: .whitespacesAndNewlines)
      .lowercased()
  }
}

struct UploadJobState: Codable, Sendable {
  let id: String
  let assetId: String
  var name: String
  var bytes: Int64
  var status: UploadJobStatus
  var progress: Double
  var attempt: Int
  var error: String?
  var quotaDetails: String?
  var serverLogs: [UploadServerLogLine]?
  var endpoint: String
  var directory: String?
  var boundary: String

  var latestServerLog: String? {
    serverLogs?.last?.message
  }

  var quotaReason: QuotaWallReason? {
    guard let payload = quotaDetails?.data(using: .utf8),
          let details = try? JSONSerialization.jsonObject(with: payload) as? [String: Any]
    else { return nil }
    return QuotaWallReason.parse(details: details)
  }
}

struct UploadEnqueueItemRecord {
  var id: String = ""
  var name: String = ""
}

struct UploadEnqueueRecord {
  var endpoint: String = ""
  var directory: String?
  var activityTitle: String = ""
  var items: [UploadEnqueueItemRecord] = []
}
