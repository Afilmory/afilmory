@testable import Afilmory
import XCTest

final class SubscriptionPageModelTests: XCTestCase {
  private let library = BillingOverview.QuotaDimension(limit: 20, nearingLimit: true, reason: "library_items", unit: "items", used: 18)
  private let storage = BillingOverview.QuotaDimension(limit: 1_073_741_824, nearingLimit: false, reason: "storage", unit: "bytes", used: 342_884_352)
  private let domains = BillingOverview.QuotaDimension(limit: 0, nearingLimit: false, reason: "custom_domain", unit: "items", used: 0)

  private func offer(_ id: String, plan: Bool) -> BillingOffer {
    BillingOffer(
      applicationPlanId: plan ? "plan-\(id)" : nil,
      description: nil,
      externalProductId: "app.afilmory.\(id)",
      id: id,
      name: id.capitalized,
      rank: 0,
      storageCapacityBytes: plan ? nil : 53_687_091_200,
      storagePlanId: plan ? nil : "storage-\(id)"
    )
  }

  func testUsageLineJoinsTheConsumableDimensions() {
    let line = SubscriptionPageModel.usageLine([library, domains, storage])
    XCTAssertEqual(
      line,
      "\(QuotaFormatter.headline(for: library)) \(QuotaFormatter.detail(for: library)) · \(QuotaFormatter.headline(for: storage)) \(QuotaFormatter.detail(for: storage))"
    )
  }

  func testUsageRatioFollowsTheFullestDimension() {
    XCTAssertEqual(SubscriptionPageModel.usageRatio([library, storage]), 0.9, accuracy: 0.0001)
  }

  func testFocusHighlightsItsDimension() {
    XCTAssertEqual(SubscriptionPageModel.highlightedReason(for: .storage(usedBytes: 1, incomingBytes: 1, capacityBytes: 1)), "storage")
    XCTAssertEqual(SubscriptionPageModel.highlightedReason(for: .libraryItems(current: 20, limit: 20)), "library_items")
    XCTAssertNil(SubscriptionPageModel.highlightedReason(for: nil))
  }

  func testDefaultSelectionPrefersTheFocusedFamilyAndSkipsTheCurrentPlan() {
    let offers = [offer("pro", plan: true), offer("annual", plan: true), offer("space", plan: false)]
    XCTAssertEqual(SubscriptionPageModel.defaultSelection(offers: offers, focus: nil, currentName: "Pro"), "annual")
    XCTAssertEqual(
      SubscriptionPageModel.defaultSelection(offers: offers, focus: .storage(usedBytes: 1, incomingBytes: 1, capacityBytes: 1), currentName: nil),
      "space"
    )
    XCTAssertNil(SubscriptionPageModel.defaultSelection(offers: [], focus: nil, currentName: nil))
  }

  func testFocusedDimensionIsTheOnlyHighlightedSegment() {
    let segments = SubscriptionPageModel.usageSegments([library, domains, storage], focus: .storage(usedBytes: 1, incomingBytes: 1, capacityBytes: 1))
    XCTAssertEqual(segments.map { $0.text }, [
      "\(QuotaFormatter.headline(for: library)) \(QuotaFormatter.detail(for: library))",
      "\(QuotaFormatter.headline(for: storage)) \(QuotaFormatter.detail(for: storage))",
    ])
    XCTAssertEqual(segments.map { $0.highlighted }, [false, true])
    XCTAssertFalse(SubscriptionPageModel.usageSegments([library, storage], focus: nil).contains { $0.highlighted })
  }
}
