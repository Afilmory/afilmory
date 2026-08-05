import Foundation

protocol PhotoCacheRepository: Sendable {
  @MainActor func loadFeed(_ key: PhotoFeedKey) -> (photos: [GalleryPhoto], etag: String?)?
  func saveFeed(_ key: PhotoFeedKey, photos: [GalleryPhoto], etag: String?) async
  func touchFeed(_ key: PhotoFeedKey) async

  @MainActor func loadGalleryDirectory() -> Data?
  func saveGalleryDirectory(_ payload: Data) async

  @MainActor func loadSession() -> Data?
  func saveSession(_ payload: Data) async
  func clearSession() async

  func wipeAll() async
  func pruneStale(olderThan cutoff: Date) async
}
