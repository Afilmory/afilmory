import XCTest
@testable import PhotoMasonry

final class CacheLifecycleTests: XCTestCase {
  func testRunOnceCallsPruneStaleExactlyOnce() async throws {
    let repository = SpyCacheRepository()
    let coordinator = CacheLifecycleCoordinator()

    coordinator.runOnce(repository: repository)
    coordinator.runOnce(repository: repository)
    coordinator.runOnce(repository: repository)

    try await waitUntil { repository.pruneCalls.count == 1 }
    try await Task.sleep(nanoseconds: 50_000_000)

    XCTAssertEqual(repository.pruneCalls.count, 1)
  }

  func testRunOncePrunesAThirtyDayCutoff() async throws {
    let repository = SpyCacheRepository()
    let coordinator = CacheLifecycleCoordinator()
    let now = Date()

    coordinator.runOnce(repository: repository, now: now)

    try await waitUntil { repository.pruneCalls.count == 1 }

    let cutoff = try XCTUnwrap(repository.pruneCalls.first)
    let expected = now.addingTimeInterval(-60 * 60 * 24 * 30)
    XCTAssertEqual(cutoff.timeIntervalSince1970, expected.timeIntervalSince1970, accuracy: 0.001)
  }

  private func waitUntil(
    timeout: TimeInterval = 2,
    _ condition: () -> Bool
  ) async throws {
    let deadline = Date().addingTimeInterval(timeout)
    while !condition() {
      if Date() >= deadline {
        XCTFail("Timed out waiting for condition")
        return
      }
      try await Task.sleep(nanoseconds: 10_000_000)
    }
  }
}

private final class SpyCacheRepository: PhotoCacheRepository, @unchecked Sendable {
  private let lock = NSLock()
  private var _pruneCalls: [Date] = []

  var pruneCalls: [Date] {
    lock.withLock { _pruneCalls }
  }

  @MainActor func loadFeed(_ key: PhotoFeedKey) -> (photos: [GalleryPhoto], etag: String?)? { nil }
  func saveFeed(_ key: PhotoFeedKey, photos: [GalleryPhoto], etag: String?) async {}
  func touchFeed(_ key: PhotoFeedKey) async {}

  @MainActor func loadGalleryDirectory() -> Data? { nil }
  func saveGalleryDirectory(_ payload: Data) async {}

  @MainActor func loadSession() -> Data? { nil }
  func saveSession(_ payload: Data) async {}
  func clearSession() async {}

  func wipeAll() async {}

  func pruneStale(olderThan cutoff: Date) async {
    lock.withLock { _pruneCalls.append(cutoff) }
  }
}

private extension NSLock {
  func withLock<T>(_ body: () -> T) -> T {
    lock()
    defer { unlock() }
    return body()
  }
}
