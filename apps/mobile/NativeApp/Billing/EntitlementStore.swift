import Combine
import Foundation

@MainActor
final class EntitlementStore: ObservableObject {
  static let shared = EntitlementStore()

  @Published private(set) var snapshot: BillingOverview?
  @Published private(set) var isAvailable = true

  private let loader: BillingOverviewLoading
  private var refreshing = false

  init(loader: BillingOverviewLoading = LiveBillingOverviewLoader()) {
    self.loader = loader
  }

  var warnings: [BillingOverview.QuotaDimension] {
    snapshot?.dimensions.filter(\.nearingLimit) ?? []
  }

  func dimension(for reason: String) -> BillingOverview.QuotaDimension? {
    snapshot?.dimensions.first { $0.reason == reason }
  }

  func refresh() async {
    guard isAvailable, !refreshing else { return }
    refreshing = true
    defer { refreshing = false }
    do {
      snapshot = try await loader.load()
    } catch {
      // A 403 means this member is not the billing owner. That never becomes true by retrying, and
      // every retry is a request the workspace cannot act on.
      if case .http(403, _)? = error as? APIError {
        isAvailable = false
        snapshot = nil
      }
    }
  }
}
