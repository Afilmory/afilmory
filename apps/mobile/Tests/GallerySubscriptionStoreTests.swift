import XCTest

@testable import Afilmory

@MainActor
final class GallerySubscriptionStoreTests: XCTestCase {
  private enum TransportFailure: Error {
    case offline
  }

  private func makeHeader(tenantId: String = "tenant-1") -> GalleryHeaderModel {
    GalleryHeaderModel(
      tenantId: tenantId,
      name: "Innei Gallery",
      slug: "innei",
      authorName: "Innei",
      authorAvatar: nil,
      photoCount: 42,
      lastUpload: "2026-08-30T10:00:00Z",
      domain: nil
    )
  }

  func testSubscribeAddsTheGalleryOptimisticallyAndKeepsItOnSuccess() async throws {
    let store = GallerySubscriptionStore()
    try await store.subscribe(makeHeader()) { tenantId in
      XCTAssertTrue(store.isSubscribed(tenantId: tenantId))
      return GallerySubscriptionMutationResponse(subscribed: true, tenantId: tenantId)
    }

    XCTAssertTrue(store.isSubscribed(tenantId: "tenant-1"))
    XCTAssertEqual(store.subscriptions.count, 1)
    XCTAssertEqual(store.subscriptions.first?.gallery.name, "Innei Gallery")
  }

  func testSubscribeFailureRevertsTheOptimisticInsert() async {
    let store = GallerySubscriptionStore()
    do {
      try await store.subscribe(makeHeader()) { _ in throw TransportFailure.offline }
      XCTFail("subscribe should rethrow the transport failure")
    } catch {
      XCTAssertTrue(error is TransportFailure)
    }

    XCTAssertFalse(store.isSubscribed(tenantId: "tenant-1"))
    XCTAssertTrue(store.subscriptions.isEmpty)
  }

  func testSubscribeRevertsWhenTheServerReportsNotSubscribed() async throws {
    let store = GallerySubscriptionStore()
    try await store.subscribe(makeHeader()) { tenantId in
      GallerySubscriptionMutationResponse(subscribed: false, tenantId: tenantId)
    }

    XCTAssertFalse(store.isSubscribed(tenantId: "tenant-1"))
  }

  func testUnsubscribeFailureRestoresTheGalleryAtItsOriginalPosition() async throws {
    let store = GallerySubscriptionStore()
    for tenantId in ["tenant-1", "tenant-2", "tenant-3"] {
      try await store.subscribe(makeHeader(tenantId: tenantId)) { id in
        GallerySubscriptionMutationResponse(subscribed: true, tenantId: id)
      }
    }
    let ordered = store.subscriptions.map(\.tenantId)
    XCTAssertEqual(ordered, ["tenant-3", "tenant-2", "tenant-1"])

    do {
      try await store.unsubscribe(tenantId: "tenant-2") { _ in throw TransportFailure.offline }
      XCTFail("unsubscribe should rethrow the transport failure")
    } catch {
      XCTAssertTrue(error is TransportFailure)
    }

    XCTAssertEqual(store.subscriptions.map(\.tenantId), ordered)
    XCTAssertTrue(store.isSubscribed(tenantId: "tenant-2"))
  }

  func testUnsubscribeSuccessRemovesTheGallery() async throws {
    let store = GallerySubscriptionStore()
    try await store.subscribe(makeHeader()) { tenantId in
      GallerySubscriptionMutationResponse(subscribed: true, tenantId: tenantId)
    }
    try await store.unsubscribe(tenantId: "tenant-1") { tenantId in
      GallerySubscriptionMutationResponse(subscribed: false, tenantId: tenantId)
    }

    XCTAssertFalse(store.isSubscribed(tenantId: "tenant-1"))
    XCTAssertTrue(store.subscriptions.isEmpty)
  }
}
