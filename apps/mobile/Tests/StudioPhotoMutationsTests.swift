import XCTest
@testable import Afilmory

final class StudioPhotoMutationsTests: XCTestCase {
  func testTagsEndpointTargetsAssetAndCarriesTags() throws {
    let endpoint = try StudioPhotoMutations.tagsEndpoint(assetId: "a1", tags: ["film", "tokyo"])

    XCTAssertEqual(endpoint.path, "photos/assets/a1/tags")
    XCTAssertEqual(endpoint.method, .patch)
    let body = try XCTUnwrap(endpoint.body)
    let json = try JSONSerialization.jsonObject(with: body) as? [String: Any]
    XCTAssertEqual(json?["tags"] as? [String], ["film", "tokyo"])
  }

  func testDeleteEndpointCarriesIdsAndStorageFlag() throws {
    let endpoint = try StudioPhotoMutations.deleteEndpoint(assetIds: ["a1", "a2"], fromStorage: true)

    XCTAssertEqual(endpoint.path, "photos/assets")
    XCTAssertEqual(endpoint.method, .delete)
    let body = try XCTUnwrap(endpoint.body)
    let json = try JSONSerialization.jsonObject(with: body) as? [String: Any]
    XCTAssertEqual(json?["ids"] as? [String], ["a1", "a2"])
    XCTAssertEqual(json?["deleteFromStorage"] as? Bool, true)
  }

  func testParseTagsTrimsAndDeduplicates() {
    XCTAssertEqual(
      StudioPhotoMutations.parseTags(" film , tokyo,film, "),
      ["film", "tokyo"]
    )
  }

  func testAssetIdLookupResolvesPhotoIdAndAssetId() throws {
    let repository = PhotoReplicaRepository(store: PhotoReplicaDatabase.makeInMemory())
    let change = PhotoChange(
      tenantId: "t1",
      revision: 1,
      operation: .upsert,
      photoId: "p1",
      assetId: "a1",
      published: true,
      photo: nil,
      asset: PhotoChangeAsset(
        id: "a1",
        photoId: "p1",
        storageKey: "p1.jpg",
        storageProvider: "managed",
        syncStatus: "synced",
        size: 1,
        createdAt: "2026-09-01T00:00:00.000Z",
        updatedAt: "2026-09-01T00:00:00.000Z",
        syncedAt: "2026-09-01T00:00:00.000Z",
        publicUrl: nil
      )
    )
    _ = try repository.apply(slug: "acme", tenantId: "t1", change: change)

    XCTAssertEqual(try repository.assetId(forPhotoId: "p1", slug: "acme"), "a1")
    XCTAssertEqual(try repository.assetId(forPhotoId: "a1", slug: "acme"), "a1")
    XCTAssertNil(try repository.assetId(forPhotoId: "missing", slug: "acme"))
    XCTAssertEqual(try repository.storageProvider(forAssetId: "a1", slug: "acme"), "managed")
  }
}
