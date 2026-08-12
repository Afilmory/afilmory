import Foundation

struct BillingOffer: Codable, Sendable, Identifiable, Equatable {
  let applicationPlanId: String?
  let description: String?
  let externalProductId: String
  let id: String
  let name: String
  let rank: Int
  let storageCapacityBytes: Int64?
  let storagePlanId: String?
}

struct AppStoreOffersResponse: Codable, Sendable {
  let configured: Bool
  let offers: [BillingOffer]
}

struct AppStorePurchaseContext: Codable, Sendable {
  let appAccountToken: String
  let environment: String
  let offer: BillingOffer
  let productId: String
}

struct AppStoreTransactionAcknowledgement: Codable, Sendable {
  let status: String?
  let transactionId: String
}

struct AppStoreRestoreResponse: Codable, Sendable {
  let restored: Int
  let results: [AppStoreTransactionAcknowledgement]
}

private struct PurchaseContextBody: Encodable {
  let offerId: String
}

private struct TransactionBody: Encodable {
  let signedTransactionInfo: String
}

private struct RestoreBody: Encodable {
  let signedTransactions: [String]
}

enum AppStoreBillingAPI {
  static func offers() async throws -> AppStoreOffersResponse {
    try await AfilmoryAPI.shared.request(
      APIEndpoint(baseURL: .tenant, path: "billing/app-store/offers")
    )
  }

  static func purchaseContext(offerId: String) async throws -> AppStorePurchaseContext {
    try await AfilmoryAPI.shared.request(
      APIEndpoint(
        baseURL: .tenant,
        path: "billing/app-store/purchase-context",
        method: .post,
        body: try APIEndpoint.jsonBody(PurchaseContextBody(offerId: offerId))
      )
    )
  }

  static func acknowledge(signedTransactionInfo: String) async throws -> AppStoreTransactionAcknowledgement {
    try await AfilmoryAPI.shared.request(
      APIEndpoint(
        baseURL: .tenant,
        path: "billing/app-store/transactions",
        method: .post,
        body: try APIEndpoint.jsonBody(TransactionBody(signedTransactionInfo: signedTransactionInfo))
      )
    )
  }

  static func restore(signedTransactions: [String]) async throws -> AppStoreRestoreResponse {
    try await AfilmoryAPI.shared.request(
      APIEndpoint(
        baseURL: .tenant,
        path: "billing/app-store/restore",
        method: .post,
        body: try APIEndpoint.jsonBody(RestoreBody(signedTransactions: signedTransactions))
      )
    )
  }
}
