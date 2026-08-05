import Foundation
import SDWebImage

enum CacheLifecycle {
  static let staleFeedCutoffInterval: TimeInterval = 60 * 60 * 24 * 30
  static let imageCacheMaxDiskSize: UInt = 512 * 1024 * 1024
  static let imageCacheMaxDiskAgeInterval: TimeInterval = 60 * 60 * 24 * 60
}

final class CacheLifecycleCoordinator: @unchecked Sendable {
  static let shared = CacheLifecycleCoordinator()

  private let lock = NSLock()
  private var hasRun = false

  func runOnce(
    repository: PhotoCacheRepository = SwiftDataPhotoCacheRepository(container: AfilmoryDatabase.shared),
    imageCache: SDImageCache = .shared,
    now: Date = Date()
  ) {
    let shouldRun = lock.withLock { () -> Bool in
      guard !hasRun else { return false }
      hasRun = true
      return true
    }
    guard shouldRun else { return }

    imageCache.config.maxDiskSize = CacheLifecycle.imageCacheMaxDiskSize
    imageCache.config.maxDiskAge = CacheLifecycle.imageCacheMaxDiskAgeInterval

    let cutoff = now.addingTimeInterval(-CacheLifecycle.staleFeedCutoffInterval)
    Task(priority: .background) {
      await repository.pruneStale(olderThan: cutoff)
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
