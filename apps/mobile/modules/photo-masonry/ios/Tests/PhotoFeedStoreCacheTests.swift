import XCTest
@testable import Afilmory

@MainActor
final class PhotoFeedStoreCacheTests: XCTestCase {
  func testColdStartWithCachePublishesCachedPhotosBeforeNetworkCompletes() async throws {
    let repository = RecordingPhotoCacheRepository()
    let key = PhotoFeedKey.manifest("acme")
    let cachedPhotos = [NativeFixtureTestSupport.photo(id: "cached-a")]
    repository.seed(key, photos: cachedPhotos, etag: "etag-cached")

    let transport = FakeManifestTransport(steps: [.notModified])
    let store = PhotoFeedStore(repository: repository, manifestTransport: transport)

    store.load(key)
    let feed = store.feed(for: key)

    XCTAssertEqual(feed.photos.map(\.id), ["cached-a"])
    XCTAssertEqual(feed.loadState, .loaded)

    try await waitUntil { await transport.requestedEtags.count == 1 }
  }

  func testNotModifiedTouchesFeedAndKeepsCachedPhotosUnchanged() async throws {
    let repository = RecordingPhotoCacheRepository()
    let key = PhotoFeedKey.manifest("acme")
    let cachedPhotos = [NativeFixtureTestSupport.photo(id: "a"), NativeFixtureTestSupport.photo(id: "b")]
    repository.seed(key, photos: cachedPhotos, etag: "etag-1")

    let transport = FakeManifestTransport(steps: [.notModified])
    let store = PhotoFeedStore(repository: repository, manifestTransport: transport)

    store.load(key)
    let feed = store.feed(for: key)

    try await waitUntil { repository.touchCalls.count == 1 }

    let requestedEtags = await transport.requestedEtags
    XCTAssertEqual(requestedEtags, ["etag-1"])
    XCTAssertEqual(feed.photos, cachedPhotos)
    XCTAssertEqual(feed.loadState, .loaded)
    XCTAssertEqual(repository.touchCalls, [key])
    XCTAssertTrue(repository.saveCalls.isEmpty)
  }

  func testSuccessPublishesDecodedPhotosAndPersistsNewOrderAndDeletions() async throws {
    let repository = RecordingPhotoCacheRepository()
    let key = PhotoFeedKey.manifest("acme")
    let cachedPhotos = [NativeFixtureTestSupport.photo(id: "a"), NativeFixtureTestSupport.photo(id: "b")]
    repository.seed(key, photos: cachedPhotos, etag: "etag-1")

    let payload = manifestData(ids: ["c", "b"])
    let transport = FakeManifestTransport(steps: [.success(payload, etag: "etag-2")])
    let store = PhotoFeedStore(repository: repository, manifestTransport: transport)

    store.load(key)
    let feed = store.feed(for: key)

    try await waitUntil { feed.photos.map(\.id) == ["c", "b"] }

    XCTAssertEqual(feed.loadState, .loaded)
    XCTAssertEqual(repository.saveCalls.count, 1)
    XCTAssertEqual(repository.saveCalls.first?.key, key)
    XCTAssertEqual(repository.saveCalls.first?.photos.map(\.id), ["c", "b"])
    XCTAssertEqual(repository.saveCalls.first?.etag, "etag-2")
  }

  func testRefreshFailureKeepsCachedPhotosOnScreenAndLogsOnly() async throws {
    let repository = RecordingPhotoCacheRepository()
    let key = PhotoFeedKey.manifest("acme")
    let cachedPhotos = [NativeFixtureTestSupport.photo(id: "a")]
    repository.seed(key, photos: cachedPhotos, etag: "etag-1")

    let transport = FakeManifestTransport(steps: [.failure(APIError.http(status: 500, body: nil))])
    let store = PhotoFeedStore(repository: repository, manifestTransport: transport)

    store.load(key)
    let feed = store.feed(for: key)

    XCTAssertEqual(feed.photos.map(\.id), ["a"])
    XCTAssertEqual(feed.loadState, .loaded)

    try await waitUntil { await transport.requestedEtags.count == 1 }
    try await Task.sleep(nanoseconds: 50_000_000)

    XCTAssertEqual(feed.photos.map(\.id), ["a"])
    XCTAssertEqual(feed.loadState, .loaded)
    XCTAssertTrue(repository.saveCalls.isEmpty)
    XCTAssertTrue(repository.touchCalls.isEmpty)
  }

  func testNoCachePathShowsLoadingThenLoaded() async throws {
    let repository = RecordingPhotoCacheRepository()
    let key = PhotoFeedKey.manifest("acme")

    let payload = manifestData(ids: ["x"])
    let transport = FakeManifestTransport(steps: [.success(payload, etag: "etag-x")])
    let store = PhotoFeedStore(repository: repository, manifestTransport: transport)

    store.load(key)
    let feed = store.feed(for: key)

    XCTAssertEqual(feed.loadState, .loading)
    XCTAssertTrue(feed.photos.isEmpty)

    try await waitUntil { feed.loadState == .loaded }

    XCTAssertEqual(feed.photos.map(\.id), ["x"])
    XCTAssertEqual(repository.saveCalls.first?.etag, "etag-x")
  }

  func testNoCachePathKeepsExistingErrorStateOnFailure() async throws {
    let repository = RecordingPhotoCacheRepository()
    let key = PhotoFeedKey.manifest("acme")

    let transport = FakeManifestTransport(steps: [.failure(APIError.http(status: 500, body: nil))])
    let store = PhotoFeedStore(repository: repository, manifestTransport: transport)

    store.load(key)
    let feed = store.feed(for: key)

    XCTAssertEqual(feed.loadState, .loading)

    try await waitUntil { feed.loadState == .failed }

    XCTAssertNotNil(feed.lastError)
    XCTAssertTrue(feed.photos.isEmpty)
  }

  func testStudioKeyNeverTouchesRepository() async throws {
    let repository = RecordingPhotoCacheRepository()
    repository.seed(.studioLibrary, photos: [NativeFixtureTestSupport.photo(id: "seed")], etag: "seed-etag")

    let transport = FakeManifestTransport(steps: [])
    let store = PhotoFeedStore(repository: repository, manifestTransport: transport)

    store.load(.studioLibrary)
    let feed = store.feed(for: .studioLibrary)

    XCTAssertEqual(feed.loadState, .loading)
    XCTAssertTrue(feed.photos.isEmpty)
    XCTAssertTrue(repository.loadCalls.isEmpty)

    try await waitUntil { feed.loadState != .loading }

    XCTAssertTrue(repository.loadCalls.isEmpty)
    XCTAssertTrue(repository.saveCalls.isEmpty)
    XCTAssertTrue(repository.touchCalls.isEmpty)
    let requestedEtagsCount = await transport.requestedEtags.count
    XCTAssertEqual(requestedEtagsCount, 0)
  }

  func testStaleCancelledTaskDoesNotClobberTheNewerLoadRegistration() async throws {
    let repository = RecordingPhotoCacheRepository()
    let key = PhotoFeedKey.manifest("acme")

    let gates = OneShotGates()
    repository.touchFeedGate = { index in await gates.wait(index) }

    let transport = FakeManifestTransport(steps: [.notModified, .notModified])
    let store = PhotoFeedStore(repository: repository, manifestTransport: transport)

    store.load(key)
    let feed = store.feed(for: key)
    XCTAssertEqual(feed.loadState, .loading)

    try await waitUntil { repository.touchCalls.count == 1 }

    store.load(key, force: true)

    try await waitUntil { repository.touchCalls.count == 2 }

    await gates.open(1)
    try await Task.sleep(nanoseconds: 50_000_000)

    store.load(key)
    try await Task.sleep(nanoseconds: 50_000_000)

    XCTAssertEqual(
      repository.touchCalls.count,
      2,
      "a stale cancelled task must not clear the in-flight registration for a newer task"
    )

    await gates.open(2)
    await gates.open(3)
  }

  private func manifestData(ids: [String]) -> Data {
    let photos = ids.map { id in ["id": id, "thumbnailUrl": "https://example.com/\(id).jpg"] }
    return try! JSONSerialization.data(withJSONObject: ["data": photos])
  }

  private func waitUntil(
    timeout: TimeInterval = 2,
    _ condition: () async -> Bool
  ) async throws {
    let deadline = Date().addingTimeInterval(timeout)
    while await !condition() {
      if Date() >= deadline {
        XCTFail("Timed out waiting for condition")
        return
      }
      try await Task.sleep(nanoseconds: 10_000_000)
    }
  }
}

private actor OneShotGates {
  private var opened: Set<Int> = []
  private var waiters: [Int: CheckedContinuation<Void, Never>] = [:]

  func wait(_ index: Int) async {
    if opened.contains(index) { return }
    await withCheckedContinuation { waiters[index] = $0 }
  }

  func open(_ index: Int) {
    opened.insert(index)
    waiters.removeValue(forKey: index)?.resume()
  }
}

private actor FakeManifestTransport: ManifestTransport {
  enum Step {
    case notModified
    case success(Data, etag: String?)
    case failure(Error)
  }

  private var steps: [Step]
  private(set) var requestedEtags: [String?] = []

  init(steps: [Step]) {
    self.steps = steps
  }

  func fetchManifest(slug: String, etag: String?) async throws -> ManifestFetchOutcome {
    requestedEtags.append(etag)
    let step = steps.isEmpty ? Step.notModified : steps.removeFirst()
    switch step {
    case .notModified:
      return .notModified
    case .success(let data, let responseEtag):
      return .success(data, etag: responseEtag)
    case .failure(let error):
      throw error
    }
  }
}

private final class RecordingPhotoCacheRepository: PhotoCacheRepository, @unchecked Sendable {
  private struct Record {
    var photos: [GalleryPhoto]
    var etag: String?
  }

  private let lock = NSLock()
  private var feeds: [PhotoFeedKey: Record] = [:]
  private var _loadCalls: [PhotoFeedKey] = []
  private var _saveCalls: [(key: PhotoFeedKey, photos: [GalleryPhoto], etag: String?)] = []
  private var _touchCalls: [PhotoFeedKey] = []

  var touchFeedGate: (@Sendable (Int) async -> Void)?

  var loadCalls: [PhotoFeedKey] { lock.withLock { _loadCalls } }
  var saveCalls: [(key: PhotoFeedKey, photos: [GalleryPhoto], etag: String?)] { lock.withLock { _saveCalls } }
  var touchCalls: [PhotoFeedKey] { lock.withLock { _touchCalls } }

  func seed(_ key: PhotoFeedKey, photos: [GalleryPhoto], etag: String?) {
    lock.withLock { feeds[key] = Record(photos: photos, etag: etag) }
  }

  @MainActor
  func loadFeed(_ key: PhotoFeedKey) -> (photos: [GalleryPhoto], etag: String?)? {
    lock.withLock {
      _loadCalls.append(key)
      guard let record = feeds[key] else { return nil }
      return (record.photos, record.etag)
    }
  }

  func saveFeed(_ key: PhotoFeedKey, photos: [GalleryPhoto], etag: String?) async {
    lock.withLock {
      _saveCalls.append((key, photos, etag))
      feeds[key] = Record(photos: photos, etag: etag)
    }
  }

  func touchFeed(_ key: PhotoFeedKey) async {
    let callIndex: Int = lock.withLock {
      _touchCalls.append(key)
      return _touchCalls.count
    }
    if let touchFeedGate {
      await touchFeedGate(callIndex)
    }
  }

  @MainActor
  func loadGalleryDirectory() -> Data? { nil }

  func saveGalleryDirectory(_ payload: Data) async {}

  @MainActor
  func loadSession() -> Data? { nil }

  func saveSession(_ payload: Data) async {}

  func clearSession() async {}

  func wipeAll() async {}

  func pruneStale(olderThan cutoff: Date) async {}
}

private extension NSLock {
  func withLock<T>(_ body: () -> T) -> T {
    lock()
    defer { unlock() }
    return body()
  }
}
