import Foundation
import UserNotifications

enum GalleryPushImageAttachmentError: Error {
  case invalidData
}

enum GalleryPushImageAttachment {
  private static let maxByteCount = 5 * 1024 * 1024

  static func remoteImageURL(from userInfo: [AnyHashable: Any]) -> URL? {
    remoteURL(from: userInfo, key: "imageUrl")
  }

  static func remoteAvatarURL(from userInfo: [AnyHashable: Any]) -> URL? {
    remoteURL(from: userInfo, key: "avatarUrl")
  }

  private static func remoteURL(from userInfo: [AnyHashable: Any], key: String) -> URL? {
    guard let raw = userInfo[key] as? String else { return nil }
    let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
    guard let url = URL(string: trimmed),
          url.scheme?.lowercased() == "https",
          let host = url.host,
          !host.isEmpty
    else { return nil }
    return url
  }

  static func makeAttachment(from data: Data) throws -> UNNotificationAttachment {
    guard !data.isEmpty, data.count <= maxByteCount else {
      throw GalleryPushImageAttachmentError.invalidData
    }
    let directory = FileManager.default.temporaryDirectory
      .appending(path: UUID().uuidString, directoryHint: .isDirectory)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    let filename = data.starts(with: [0xFF, 0xD8, 0xFF]) ? "photo.jpg" : "photo.png"
    let fileURL = directory.appending(path: filename)
    try data.write(to: fileURL, options: .atomic)
    return try UNNotificationAttachment(
      identifier: "photo",
      url: fileURL,
      options: [UNNotificationAttachmentOptionsThumbnailHiddenKey: false]
    )
  }
}
