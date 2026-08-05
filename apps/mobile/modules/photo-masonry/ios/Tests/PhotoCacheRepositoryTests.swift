import SwiftData
import XCTest
@testable import PhotoMasonry

final class PhotoCacheRepositoryTests: XCTestCase {
  private var container: ModelContainer!
  private var repository: SwiftDataPhotoCacheRepository!

  override func setUp() {
    super.setUp()
    container = AfilmoryDatabase.makeInMemoryContainer()
    repository = SwiftDataPhotoCacheRepository(container: container)
  }

  override func tearDown() {
    repository = nil
    container = nil
    super.tearDown()
  }

  func testFeedRoundTripPreservesOrderAndEtag() async {
    let key = PhotoFeedKey.manifest("acme")
    let photos = [
      NativeFixtureTestSupport.photo(id: "a"),
      NativeFixtureTestSupport.photo(id: "b"),
      NativeFixtureTestSupport.photo(id: "c"),
    ]

    await repository.saveFeed(key, photos: photos, etag: "etag-1")

    let loaded = await repository.loadFeed(key)
    XCTAssertEqual(loaded?.photos.map(\.id), ["a", "b", "c"])
    XCTAssertEqual(loaded?.etag, "etag-1")
  }

  func testLoadFeedReturnsNilWhenNeverSaved() async {
    let loaded = await repository.loadFeed(.manifest("missing"))
    XCTAssertNil(loaded)
  }

  func testSaveFeedUpsertsChangedPayloadsAndDeletesMissingPhotos() async throws {
    let key = PhotoFeedKey.manifest("acme")
    await repository.saveFeed(
      key,
      photos: [
        NativeFixtureTestSupport.photo(id: "a", title: "Original"),
        NativeFixtureTestSupport.photo(id: "b"),
      ],
      etag: "etag-1"
    )

    await repository.saveFeed(
      key,
      photos: [
        NativeFixtureTestSupport.photo(id: "a", title: "Updated"),
        NativeFixtureTestSupport.photo(id: "c"),
      ],
      etag: "etag-2"
    )

    let loaded = await repository.loadFeed(key)
    XCTAssertEqual(loaded?.photos.map(\.id), ["a", "c"])
    XCTAssertEqual(loaded?.photos.first?.title, "Updated")
    XCTAssertEqual(loaded?.etag, "etag-2")

    let remainingRows = try await fetchPhotoRows(feedKey: key.rawValue)
    XCTAssertEqual(remainingRows.count, 2)
  }

  func testLoadFeedDropsAndDeletesCorruptedPayloadRow() async throws {
    let key = PhotoFeedKey.manifest("acme")
    await repository.saveFeed(
      key,
      photos: [NativeFixtureTestSupport.photo(id: "a"), NativeFixtureTestSupport.photo(id: "b")],
      etag: "etag-1"
    )
    try await corruptPayload(photoId: "b", feedKey: key.rawValue)

    let loaded = await repository.loadFeed(key)
    XCTAssertEqual(loaded?.photos.map(\.id), ["a"])
    XCTAssertNil(loaded?.etag)

    let remainingRows = try await waitForPhotoRows(feedKey: key.rawValue, toMatch: ["a"])
    XCTAssertEqual(remainingRows.map(\.photoId), ["a"])
  }

  func testLoadFeedReturnsNilWhenAllPayloadRowsAreCorrupted() async throws {
    let key = PhotoFeedKey.manifest("acme")
    await repository.saveFeed(
      key,
      photos: [NativeFixtureTestSupport.photo(id: "a"), NativeFixtureTestSupport.photo(id: "b")],
      etag: "etag-1"
    )
    try await corruptPayload(photoId: "a", feedKey: key.rawValue)
    try await corruptPayload(photoId: "b", feedKey: key.rawValue)

    let loaded = await repository.loadFeed(key)
    XCTAssertNil(loaded)

    let remainingRows = try await waitForPhotoRows(feedKey: key.rawValue, toMatch: [])
    XCTAssertTrue(remainingRows.isEmpty)
  }

  func testTouchFeedUpdatesFetchedAtWithoutChangingPhotosOrEtag() async throws {
    let key = PhotoFeedKey.manifest("acme")
    await repository.saveFeed(key, photos: [NativeFixtureTestSupport.photo(id: "a")], etag: "etag-1")
    let backdated = Date(timeIntervalSinceNow: -1000)
    try await backdateFeed(feedKey: key.rawValue, to: backdated)

    await repository.touchFeed(key)

    let updatedFetchedAt = try await feedFetchedAt(feedKey: key.rawValue)
    XCTAssertNotNil(updatedFetchedAt)
    XCTAssertGreaterThan(updatedFetchedAt!, backdated)

    let loaded = await repository.loadFeed(key)
    XCTAssertEqual(loaded?.etag, "etag-1")
    XCTAssertEqual(loaded?.photos.map(\.id), ["a"])
  }

  func testPruneStaleRemovesOnlyStaleFeedsAndTheirPhotos() async throws {
    let freshKey = PhotoFeedKey.manifest("fresh")
    let staleKey = PhotoFeedKey.manifest("stale")

    await repository.saveFeed(freshKey, photos: [NativeFixtureTestSupport.photo(id: "fresh-1")], etag: nil)
    await repository.saveFeed(staleKey, photos: [NativeFixtureTestSupport.photo(id: "stale-1")], etag: nil)
    try await backdateFeed(feedKey: staleKey.rawValue, to: Date(timeIntervalSinceNow: -60 * 60 * 24 * 40))

    await repository.pruneStale(olderThan: Date(timeIntervalSinceNow: -60 * 60 * 24 * 30))

    let freshLoaded = await repository.loadFeed(freshKey)
    let staleLoaded = await repository.loadFeed(staleKey)
    XCTAssertNotNil(freshLoaded)
    XCTAssertNil(staleLoaded)
    let remainingStaleRows = try await fetchPhotoRows(feedKey: staleKey.rawValue)
    XCTAssertTrue(remainingStaleRows.isEmpty)
  }

  func testWipeAllEmptiesFeedsDirectoryAndSession() async throws {
    let key = PhotoFeedKey.manifest("acme")
    await repository.saveFeed(key, photos: [NativeFixtureTestSupport.photo(id: "a")], etag: "etag-1")
    await repository.saveGalleryDirectory(Data("directory".utf8))
    await repository.saveSession(Data("session".utf8))

    await repository.wipeAll()

    let loadedFeed = await repository.loadFeed(key)
    let loadedDirectory = await repository.loadGalleryDirectory()
    let loadedSession = await repository.loadSession()
    XCTAssertNil(loadedFeed)
    XCTAssertNil(loadedDirectory)
    XCTAssertNil(loadedSession)
    let remainingRows = try await fetchPhotoRows(feedKey: key.rawValue)
    XCTAssertTrue(remainingRows.isEmpty)
  }

  func testGalleryDirectoryRoundTrip() async {
    let initial = await repository.loadGalleryDirectory()
    XCTAssertNil(initial)

    let payload = Data("directory-payload".utf8)
    await repository.saveGalleryDirectory(payload)
    let loaded = await repository.loadGalleryDirectory()
    XCTAssertEqual(loaded, payload)

    let updated = Data("updated-directory-payload".utf8)
    await repository.saveGalleryDirectory(updated)
    let reloaded = await repository.loadGalleryDirectory()
    XCTAssertEqual(reloaded, updated)
  }

  func testSessionRoundTripAndClear() async {
    let initial = await repository.loadSession()
    XCTAssertNil(initial)

    let payload = Data("session-payload".utf8)
    await repository.saveSession(payload)
    let loaded = await repository.loadSession()
    XCTAssertEqual(loaded, payload)

    await repository.clearSession()
    let cleared = await repository.loadSession()
    XCTAssertNil(cleared)
  }

  @MainActor
  private func fetchPhotoRows(feedKey: String) throws -> [CachedPhoto] {
    let descriptor = FetchDescriptor<CachedPhoto>(predicate: #Predicate<CachedPhoto> { $0.feedKey == feedKey })
    return try container.mainContext.fetch(descriptor)
  }

  private func waitForPhotoRows(
    feedKey: String,
    toMatch expectedPhotoIds: [String],
    timeout: TimeInterval = 2
  ) async throws -> [CachedPhoto] {
    let deadline = Date().addingTimeInterval(timeout)
    while true {
      let rows = try await fetchPhotoRows(feedKey: feedKey)
      if rows.map(\.photoId).sorted() == expectedPhotoIds.sorted() {
        return rows
      }
      if Date() >= deadline {
        return rows
      }
      try await Task.sleep(nanoseconds: 20_000_000)
    }
  }

  @MainActor
  private func feedFetchedAt(feedKey: String) throws -> Date? {
    let descriptor = FetchDescriptor<CachedFeed>(predicate: #Predicate<CachedFeed> { $0.feedKey == feedKey })
    return try container.mainContext.fetch(descriptor).first?.fetchedAt
  }

  @MainActor
  private func backdateFeed(feedKey: String, to date: Date) throws {
    let descriptor = FetchDescriptor<CachedFeed>(predicate: #Predicate<CachedFeed> { $0.feedKey == feedKey })
    guard let feed = try container.mainContext.fetch(descriptor).first else {
      XCTFail("expected a CachedFeed row for \(feedKey)")
      return
    }
    feed.fetchedAt = date
    try container.mainContext.save()
  }

  @MainActor
  private func corruptPayload(photoId: String, feedKey: String) throws {
    let descriptor = FetchDescriptor<CachedPhoto>(
      predicate: #Predicate<CachedPhoto> { $0.feedKey == feedKey && $0.photoId == photoId }
    )
    guard let row = try container.mainContext.fetch(descriptor).first else {
      XCTFail("expected a CachedPhoto row for \(photoId)")
      return
    }
    row.payload = Data("not-json".utf8)
    try container.mainContext.save()
  }
}

final class InMemoryPhotoCacheRepositoryTests: XCTestCase {
  private var repository: InMemoryPhotoCacheRepository!

  override func setUp() {
    super.setUp()
    repository = InMemoryPhotoCacheRepository()
  }

  override func tearDown() {
    repository = nil
    super.tearDown()
  }

  func testFeedRoundTripAndUpsert() async {
    let key = PhotoFeedKey.manifest("acme")
    await repository.saveFeed(
      key,
      photos: [NativeFixtureTestSupport.photo(id: "a"), NativeFixtureTestSupport.photo(id: "b")],
      etag: "etag-1"
    )
    let loaded = await repository.loadFeed(key)
    XCTAssertEqual(loaded?.photos.map(\.id), ["a", "b"])
    XCTAssertEqual(loaded?.etag, "etag-1")

    await repository.saveFeed(key, photos: [NativeFixtureTestSupport.photo(id: "c")], etag: "etag-2")
    let updated = await repository.loadFeed(key)
    XCTAssertEqual(updated?.photos.map(\.id), ["c"])
    XCTAssertEqual(updated?.etag, "etag-2")
  }

  func testWipeAllAndSessionDirectoryRoundTrip() async {
    let key = PhotoFeedKey.manifest("acme")
    await repository.saveFeed(key, photos: [NativeFixtureTestSupport.photo(id: "a")], etag: "etag-1")
    await repository.saveGalleryDirectory(Data("directory".utf8))
    await repository.saveSession(Data("session".utf8))

    let loadedDirectory = await repository.loadGalleryDirectory()
    let loadedSession = await repository.loadSession()
    XCTAssertEqual(loadedDirectory, Data("directory".utf8))
    XCTAssertEqual(loadedSession, Data("session".utf8))

    await repository.wipeAll()

    let wipedFeed = await repository.loadFeed(key)
    let wipedDirectory = await repository.loadGalleryDirectory()
    let wipedSession = await repository.loadSession()
    XCTAssertNil(wipedFeed)
    XCTAssertNil(wipedDirectory)
    XCTAssertNil(wipedSession)
  }

  func testPruneStaleRemovesOnlyOldFeeds() async throws {
    let staleKey = PhotoFeedKey.manifest("stale")
    await repository.saveFeed(staleKey, photos: [NativeFixtureTestSupport.photo(id: "stale-1")], etag: nil)
    try await Task.sleep(nanoseconds: 50_000_000)
    let cutoff = Date()
    try await Task.sleep(nanoseconds: 50_000_000)

    let freshKey = PhotoFeedKey.manifest("fresh")
    await repository.saveFeed(freshKey, photos: [NativeFixtureTestSupport.photo(id: "fresh-1")], etag: nil)

    await repository.pruneStale(olderThan: cutoff)

    let staleLoaded = await repository.loadFeed(staleKey)
    let freshLoaded = await repository.loadFeed(freshKey)
    XCTAssertNil(staleLoaded)
    XCTAssertNotNil(freshLoaded)
  }
}
