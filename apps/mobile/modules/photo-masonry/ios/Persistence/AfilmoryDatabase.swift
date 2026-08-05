import Foundation
import SwiftData

enum AfilmoryDatabase {
  static let schema = Schema([
    CachedPhoto.self,
    CachedFeed.self,
    CachedGalleryDirectory.self,
    CachedSession.self,
  ])

  static let shared: ModelContainer = makeContainer(at: storeURL())

  static func makeInMemoryContainer() -> ModelContainer {
    let configuration = ModelConfiguration(schema: schema, isStoredInMemoryOnly: true)
    return try! ModelContainer(for: schema, configurations: [configuration])
  }

  static func makeContainer(at url: URL) -> ModelContainer {
    let configuration = ModelConfiguration(schema: schema, url: url)
    if let container = try? ModelContainer(for: schema, configurations: [configuration]) {
      return container
    }
    NSLog("[AfilmoryDatabase] Cache store failed to open, recreating: %@", url.path)
    removeStoreFiles(at: url)
    if let container = try? ModelContainer(for: schema, configurations: [configuration]) {
      return container
    }
    NSLog("[AfilmoryDatabase] Cache store still unusable after recreation, falling back to in-memory: %@", url.path)
    return makeInMemoryContainer()
  }

  static func storeURL(
    in directory: URL = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
  ) -> URL {
    let folder = directory.appending(path: "AfilmoryCache", directoryHint: .isDirectory)
    try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    return folder.appending(path: "AfilmoryCache.store")
  }

  private static func removeStoreFiles(at url: URL) {
    let fileManager = FileManager.default
    for suffix in ["", "-wal", "-shm"] {
      try? fileManager.removeItem(atPath: url.path + suffix)
    }
  }
}
