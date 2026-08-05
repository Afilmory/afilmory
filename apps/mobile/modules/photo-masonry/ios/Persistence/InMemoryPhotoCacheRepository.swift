import Foundation

final class InMemoryPhotoCacheRepository: PhotoCacheRepository, @unchecked Sendable {
  private struct FeedRecord {
    var photos: [GalleryPhoto]
    var etag: String?
    var fetchedAt: Date
  }

  private let lock = NSLock()
  private var feeds: [String: FeedRecord] = [:]
  private var galleryDirectory: Data?
  private var session: Data?

  @MainActor
  func loadFeed(_ key: PhotoFeedKey) -> (photos: [GalleryPhoto], etag: String?)? {
    lock.withLock {
      guard let record = feeds[key.rawValue] else { return nil }
      return (record.photos, record.etag)
    }
  }

  func saveFeed(_ key: PhotoFeedKey, photos: [GalleryPhoto], etag: String?) async {
    lock.withLock {
      feeds[key.rawValue] = FeedRecord(photos: photos, etag: etag, fetchedAt: Date())
    }
  }

  func touchFeed(_ key: PhotoFeedKey) async {
    lock.withLock {
      feeds[key.rawValue]?.fetchedAt = Date()
    }
  }

  @MainActor
  func loadGalleryDirectory() -> Data? {
    lock.withLock { galleryDirectory }
  }

  func saveGalleryDirectory(_ payload: Data) async {
    lock.withLock { galleryDirectory = payload }
  }

  @MainActor
  func loadSession() -> Data? {
    lock.withLock { session }
  }

  func saveSession(_ payload: Data) async {
    lock.withLock { session = payload }
  }

  func clearSession() async {
    lock.withLock { session = nil }
  }

  func wipeAll() async {
    lock.withLock {
      feeds.removeAll()
      galleryDirectory = nil
      session = nil
    }
  }

  func pruneStale(olderThan cutoff: Date) async {
    lock.withLock {
      feeds = feeds.filter { $0.value.fetchedAt >= cutoff }
    }
  }
}

private extension NSLock {
  func withLock<T>(_ body: () -> T) -> T {
    lock()
    defer { unlock() }
    return body()
  }
}
