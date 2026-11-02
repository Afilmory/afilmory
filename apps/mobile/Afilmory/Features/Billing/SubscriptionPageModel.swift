import Foundation

enum SubscriptionPageModel {
  static let consumable = ["monthly_process", "library_items", "storage"]

  static func usageDimensions(_ dimensions: [BillingOverview.QuotaDimension]) -> [BillingOverview.QuotaDimension] {
    dimensions.filter { consumable.contains($0.reason) && $0.limit != nil }
  }

  struct UsageSegment: Equatable {
    let text: String
    let highlighted: Bool
  }

  static func usageSegments(_ dimensions: [BillingOverview.QuotaDimension], focus: QuotaWallReason?) -> [UsageSegment] {
    let focused = highlightedReason(for: focus)
    return usageDimensions(dimensions).map {
      UsageSegment(text: "\(QuotaFormatter.headline(for: $0)) \(QuotaFormatter.detail(for: $0))", highlighted: $0.reason == focused)
    }
  }

  static func usageLine(_ dimensions: [BillingOverview.QuotaDimension]) -> String {
    usageSegments(dimensions, focus: nil).map(\.text).joined(separator: " · ")
  }

  static func usageRatio(_ dimensions: [BillingOverview.QuotaDimension]) -> Double {
    usageDimensions(dimensions).map(QuotaFormatter.ratio(for:)).max() ?? 0
  }

  static func highlightedReason(for focus: QuotaWallReason?) -> String? {
    switch focus {
    case .storage, .syncObjectSize, .uploadSize: "storage"
    case .libraryItems: "library_items"
    case .monthlyProcess: "monthly_process"
    case .customDomain: "custom_domain"
    case .unknown, nil: nil
    }
  }

  static func defaultSelection(offers: [BillingOffer], focus: QuotaWallReason?, currentName: String?) -> String? {
    let available = offers.filter { $0.name != currentName }
    let family: OfferFamily = highlightedReason(for: focus) == "storage" ? .storage : .plan
    return family.filter(available).first?.id ?? available.first?.id
  }
}
