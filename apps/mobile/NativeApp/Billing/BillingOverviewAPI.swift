import Foundation

struct BillingOverview: Decodable, Sendable, Equatable {
  struct PlanRef: Decodable, Sendable, Equatable {
    let id: String
    let name: String
  }

  struct StoragePlanRef: Decodable, Sendable, Equatable {
    let capacityBytes: Double?
    let id: String
    let name: String
  }

  struct QuotaDimension: Decodable, Sendable, Equatable {
    let limit: Double?
    let nearingLimit: Bool
    let reason: String
    let unit: String
    let used: Double
  }

  let applicationPlan: PlanRef
  let storagePlan: StoragePlanRef?
  let managedStorageEnabled: Bool
  let subscriptionProvider: String?
  let dimensions: [QuotaDimension]
}

protocol BillingOverviewLoading: Sendable {
  func load() async throws -> BillingOverview
}

struct LiveBillingOverviewLoader: BillingOverviewLoading {
  func load() async throws -> BillingOverview {
    try await AfilmoryAPI.shared.request(APIEndpoint(baseURL: .tenant, path: "billing/overview"))
  }
}
