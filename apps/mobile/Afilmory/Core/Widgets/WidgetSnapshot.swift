import Foundation

struct WidgetSnapshot: Codable, Equatable, Sendable {
  struct Entry: Codable, Equatable, Sendable {
    var date: Date
    var photoId: String
    var gallerySlug: String
    var imageFileName: String
    var aspectRatio: Double
  }

  var entries: [Entry]
}

enum WidgetSnapshotContract {
  static let appGroupIdentifier = "group.app.afilmory"
  static let directoryName = "Widgets"
  static let fileName = "widget-snapshot.json"

  static func directoryURL(appGroupIdentifier: String = appGroupIdentifier) -> URL? {
    FileManager.default
      .containerURL(forSecurityApplicationGroupIdentifier: appGroupIdentifier)?
      .appendingPathComponent(directoryName, isDirectory: true)
  }

  static func snapshotURL(appGroupIdentifier: String = appGroupIdentifier) -> URL? {
    directoryURL(appGroupIdentifier: appGroupIdentifier)?
      .appendingPathComponent(fileName, isDirectory: false)
  }
}
