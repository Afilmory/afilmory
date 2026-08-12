import Foundation
import StoreKit
import UIKit

enum AppStorePurchaseOutcome: Equatable {
  case cancelled
  case completed
  case pending
}

enum AppStoreBillingError: Error {
  case productUnavailable
  case unverifiedTransaction
  case windowSceneUnavailable
}

struct LiveAppStoreAcknowledgementPort: AppStoreAcknowledgementPort {
  func acknowledge(signedTransactionInfo: String) async throws -> String {
    try await AppStoreBillingAPI.acknowledge(signedTransactionInfo: signedTransactionInfo).transactionId
  }

  func finish(transactionId: String) async throws -> Bool {
    guard let expectedId = UInt64(transactionId) else { return false }
    for await result in StoreKit.Transaction.unfinished {
      guard case .verified(let transaction) = result, transaction.id == expectedId else { continue }
      await transaction.finish()
      return true
    }
    return false
  }
}

final class AppStoreBillingService: Sendable {
  static let shared = AppStoreBillingService()

  private let acknowledger: AppStoreTransactionAcknowledger

  init(port: AppStoreAcknowledgementPort = LiveAppStoreAcknowledgementPort()) {
    acknowledger = AppStoreTransactionAcknowledger(port: port)
  }

  func loadProducts(for productIds: [String]) async throws -> [String: Product] {
    let identifiers = Set(productIds.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty })
    guard !identifiers.isEmpty else { return [:] }
    let products = try await Product.products(for: identifiers)
    return Dictionary(uniqueKeysWithValues: products.map { ($0.id, $0) })
  }

  func purchase(offerId: String) async throws -> AppStorePurchaseOutcome {
    let context = try await AppStoreBillingAPI.purchaseContext(offerId: offerId)
    guard let token = UUID(uuidString: context.appAccountToken) else {
      throw AppStoreBillingError.unverifiedTransaction
    }
    guard let product = try await Product.products(for: [context.productId]).first(where: { $0.id == context.productId })
    else {
      throw AppStoreBillingError.productUnavailable
    }

    switch try await product.purchase(options: [.appAccountToken(token)]) {
    case .success(let verification):
      guard case .verified(let transaction) = verification else {
        throw AppStoreBillingError.unverifiedTransaction
      }
      try await acknowledger.acknowledge(
        transactionId: String(transaction.id),
        signedTransactionInfo: verification.jwsRepresentation
      )
      return .completed
    case .pending:
      return .pending
    case .userCancelled:
      return .cancelled
    @unknown default:
      throw AppStoreBillingError.unverifiedTransaction
    }
  }

  func restore(productIds: [String]) async throws -> Int {
    try await AppStore.sync()
    let allowedProductIds = Set(productIds)
    var signedTransactions: [String: String] = [:]
    for await result in StoreKit.Transaction.currentEntitlements {
      guard case .verified(let transaction) = result, allowedProductIds.contains(transaction.productID) else { continue }
      signedTransactions[String(transaction.id)] = result.jwsRepresentation
    }
    guard !signedTransactions.isEmpty else { return 0 }

    let response = try await AppStoreBillingAPI.restore(signedTransactions: Array(signedTransactions.values))
    let acceptedIds = Set(response.results.map(\.transactionId))
    let port = LiveAppStoreAcknowledgementPort()
    for transactionId in signedTransactions.keys where acceptedIds.contains(transactionId) {
      _ = try await port.finish(transactionId: transactionId)
    }
    return acceptedIds.count
  }

  @discardableResult
  func reconcileUnfinishedTransactions() async -> Int {
    var reconciled = 0
    for await result in StoreKit.Transaction.unfinished {
      guard case .verified(let transaction) = result else { continue }
      do {
        try await acknowledger.acknowledge(
          transactionId: String(transaction.id),
          signedTransactionInfo: result.jwsRepresentation
        )
        reconciled += 1
      } catch {
        continue
      }
    }
    return reconciled
  }

  func observeTransactionUpdates() async {
    for await result in StoreKit.Transaction.updates {
      guard !Task.isCancelled else { return }
      guard case .verified(let transaction) = result else { continue }
      try? await acknowledger.acknowledge(
        transactionId: String(transaction.id),
        signedTransactionInfo: result.jwsRepresentation
      )
    }
  }

  @MainActor
  func showManageSubscriptions() async throws {
    let windowScene = UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .first { $0.activationState == .foregroundActive }
    guard let windowScene else {
      throw AppStoreBillingError.windowSceneUnavailable
    }
    try await AppStore.showManageSubscriptions(in: windowScene)
  }
}
