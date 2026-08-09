import XCTest
@testable import Afilmory

@MainActor
final class GalleryDirectoryStoreCacheTests: XCTestCase {
  func testCachedDirectoryRendersBeforeNetworkResponds() async throws {
    let repository = InMemoryPhotoCacheRepository()
    let cached = [Self.makeGallery(id: "cached-a")]
    await repository.saveGalleryDirectory(try Self.encode(cached))

    let transport = FakeGalleryDirectoryTransport(steps: [.success([Self.makeGallery(id: "fresh-a")])])
    let store = GalleryDirectoryStore(repository: repository, transport: transport)

    XCTAssertEqual(store.loadCached()?.map(\.id), ["cached-a"])
    let requestCount = await transport.requestCount
    XCTAssertEqual(requestCount, 0)
  }

  func testFetchOverwritesTheCachedPayloadOnSuccess() async throws {
    let repository = InMemoryPhotoCacheRepository()
    await repository.saveGalleryDirectory(try Self.encode([Self.makeGallery(id: "stale")]))

    let transport = FakeGalleryDirectoryTransport(steps: [.success([Self.makeGallery(id: "fresh")])])
    let store = GalleryDirectoryStore(repository: repository, transport: transport)

    let fetched = try await store.fetch(query: "", limit: 30)

    XCTAssertEqual(fetched.map(\.id), ["fresh"])
    XCTAssertEqual(store.loadCached()?.map(\.id), ["fresh"])
  }

  func testFetchWithNonEmptyQueryDoesNotPersistToCache() async throws {
    let repository = InMemoryPhotoCacheRepository()
    await repository.saveGalleryDirectory(try Self.encode([Self.makeGallery(id: "cached")]))

    let transport = FakeGalleryDirectoryTransport(steps: [.success([Self.makeGallery(id: "search-result")])])
    let store = GalleryDirectoryStore(repository: repository, transport: transport)

    let fetched = try await store.fetch(query: "sunset", limit: 30)

    XCTAssertEqual(fetched.map(\.id), ["search-result"])
    XCTAssertEqual(store.loadCached()?.map(\.id), ["cached"])
  }

  func testFetchFailureLeavesTheCachedPayloadInPlace() async throws {
    let repository = InMemoryPhotoCacheRepository()
    await repository.saveGalleryDirectory(try Self.encode([Self.makeGallery(id: "cached")]))

    let transport = FakeGalleryDirectoryTransport(steps: [.failure(APIError.http(status: 500, body: nil))])
    let store = GalleryDirectoryStore(repository: repository, transport: transport)

    do {
      _ = try await store.fetch(query: "", limit: 30)
      XCTFail("Expected the fetch to throw")
    } catch {}

    XCTAssertEqual(store.loadCached()?.map(\.id), ["cached"])
  }

  func testCorruptedCachedPayloadIsIgnored() async throws {
    let repository = InMemoryPhotoCacheRepository()
    await repository.saveGalleryDirectory(Data("not-json".utf8))

    let transport = FakeGalleryDirectoryTransport(steps: [])
    let store = GalleryDirectoryStore(repository: repository, transport: transport)

    XCTAssertNil(store.loadCached())
  }

  private static func makeGallery(id: String) -> FeaturedGallery {
    FeaturedGallery(
      id: id,
      name: id,
      slug: id,
      domain: nil,
      description: nil,
      author: nil,
      photoCount: 0,
      isSubscribed: false,
      isOwnGallery: false,
      tags: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      lastUpload: nil
    )
  }

  private static func encode(_ galleries: [FeaturedGallery]) throws -> Data {
    try JSONEncoder().encode(FeaturedGalleriesEnvelope(galleries: galleries))
  }
}

private actor FakeGalleryDirectoryTransport: GalleryDirectoryTransport {
  enum Step {
    case success([FeaturedGallery])
    case failure(Error)
  }

  private var steps: [Step]
  private(set) var requestCount = 0

  init(steps: [Step]) {
    self.steps = steps
  }

  func fetchGalleryDirectory(query: String, limit: Int) async throws -> FeaturedGalleriesEnvelope {
    requestCount += 1
    guard !steps.isEmpty else { throw APIError.cancelled }
    switch steps.removeFirst() {
    case .success(let galleries):
      return FeaturedGalleriesEnvelope(galleries: galleries)
    case .failure(let error):
      throw error
    }
  }
}

private func XCTAssertThrowsErrorAsync(
  _ expression: @autoclosure () async throws -> some Any,
  file: StaticString = #filePath,
  line: UInt = #line
) async {
  do {
    _ = try await expression()
    XCTFail("Expected an error to be thrown", file: file, line: line)
  } catch {}
}
