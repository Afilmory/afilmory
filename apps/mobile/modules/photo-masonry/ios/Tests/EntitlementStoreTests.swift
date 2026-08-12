import XCTest

@testable import Afilmory

private final class StubLoader: BillingOverviewLoading, @unchecked Sendable {
  var results: [Result<BillingOverview, Error>] = []
  private(set) var callCount = 0

  func load() async throws -> BillingOverview {
    callCount += 1
    guard !results.isEmpty else { throw APIError.cancelled }
    return try results.removeFirst().get()
  }
}

private func makeOverview(storageUsed: Double) -> BillingOverview {
  BillingOverview(
    applicationPlan: .init(id: "free", name: "Free"),
    storagePlan: nil,
    managedStorageEnabled: true,
    subscriptionProvider: nil,
    dimensions: [
      .init(limit: 100, nearingLimit: storageUsed >= 80, reason: "storage", unit: "bytes", used: storageUsed),
    ]
  )
}

@MainActor
final class EntitlementStoreTests: XCTestCase {
  func testStopsRefreshingAfterTheServerSaysTheCallerIsNotTheOwner() async {
    let loader = StubLoader()
    loader.results = [.failure(APIError.http(status: 403, body: nil))]
    let store = EntitlementStore(loader: loader)

    await store.refresh()
    await store.refresh()

    XCTAssertFalse(store.isAvailable)
    XCTAssertEqual(loader.callCount, 1)
  }

  func testKeepsTheLastSnapshotWhenARefreshFails() async {
    let loader = StubLoader()
    loader.results = [.success(makeOverview(storageUsed: 82)), .failure(APIError.http(status: 500, body: nil))]
    let store = EntitlementStore(loader: loader)

    await store.refresh()
    await store.refresh()

    XCTAssertEqual(store.snapshot?.dimensions.first?.used, 82)
    XCTAssertTrue(store.isAvailable)
    XCTAssertEqual(store.warnings.count, 1)
  }
}

final class OfferFamilyTests: XCTestCase {
  private func offer(_ id: String, plan: String?, storage: String?) -> BillingOffer {
    BillingOffer(
      applicationPlanId: plan,
      description: nil,
      externalProductId: "product.\(id)",
      id: id,
      name: id,
      rank: 0,
      storageCapacityBytes: nil,
      storagePlanId: storage
    )
  }

  func testSplitsOffersByWhatTheyGrant() {
    let offers = [
      offer("plan:pro", plan: "pro", storage: nil),
      offer("storage:50", plan: nil, storage: "managed-50gb"),
    ]

    XCTAssertEqual(OfferFamily.plan.filter(offers).map(\.id), ["plan:pro"])
    XCTAssertEqual(OfferFamily.storage.filter(offers).map(\.id), ["storage:50"])
  }

  func testAnOfferGrantingBothAppearsInBothSections() {
    let bundle = [offer("bundle", plan: "pro", storage: "managed-50gb")]

    XCTAssertEqual(OfferFamily.plan.filter(bundle).count, 1)
    XCTAssertEqual(OfferFamily.storage.filter(bundle).count, 1)
  }
}
