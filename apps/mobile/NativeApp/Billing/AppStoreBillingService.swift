import Foundation
import StoreKit
import UIKit

enum AppStorePurchaseOutcome: Equatable {
  case cancelled
  case completed
  case pending
}

enum AppStoreBillingError: Error, Equatable {
  case productUnavailable
  case subscribedInAnotherWorkspace
  case unverifiedTransaction
  case windowSceneUnavailable
}

// Apple reuses one originalTransactionId across an Apple ID's whole subscription lineage — including
// a resubscription within 180 days and any cross-grade inside the subscription group — so a second
// workspace buying on the same Apple ID is charged by Apple and then rejected by the server as a
// tenant conflict. Checking ownership before the purchase sheet is the only place that avoids taking
// the customer's money for an entitlement we can never grant.
enum AppStoreOwnership {
  static func conflictsWithAnotherWorkspace(transactionToken: UUID?, workspaceToken: UUID) -> Bool {
    guard let transactionToken else { return false }
    return transactionToken != workspaceToken
  }
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

struct AppStoreReconciliationSummary: Equatable {
  let reconciled: Int
  let unlinkable: Int
}

final class AppStoreBillingService: Sendable {
  static let shared = AppStoreBillingService()

  private let acknowledger: AppStoreTransactionAcknowledger
  private let terminalTransactions: AppStoreTerminalTransactionStore

  init(
    port: AppStoreAcknowledgementPort = LiveAppStoreAcknowledgementPort(),
    terminalTransactions: AppStoreTerminalTransactionStore = UserDefaultsTerminalTransactionStore()
  ) {
    acknowledger = AppStoreTransactionAcknowledger(port: port)
    self.terminalTransactions = terminalTransactions
  }

  func loadProducts(for productIds: [String]) async throws -> [String: Product] {
    let identifiers = Set(productIds.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty })
    guard !identifiers.isEmpty else { return [:] }
    let products = try await Product.products(for: identifiers)
    return Dictionary(uniqueKeysWithValues: products.map { ($0.id, $0) })
  }

  func purchase(offerId: String, knownProductIds: [String] = []) async throws -> AppStorePurchaseOutcome {
    let context = try await AppStoreBillingAPI.purchaseContext(offerId: offerId)
    guard let token = UUID(uuidString: context.appAccountToken) else {
      throw AppStoreBillingError.unverifiedTransaction
    }
    if await foreignOwnedProductId(among: Set(knownProductIds + [context.productId]), workspaceToken: token) != nil {
      throw AppStoreBillingError.subscribedInAnotherWorkspace
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
      do {
        try await acknowledger.acknowledge(
          transactionId: String(transaction.id),
          signedTransactionInfo: verification.jwsRepresentation
        )
      } catch {
        if AppStoreBillingFailure.isTerminal(error) {
          terminalTransactions.record(String(transaction.id))
        }
        throw error
      }
      return .completed
    case .pending:
      return .pending
    case .userCancelled:
      return .cancelled
    @unknown default:
      throw AppStoreBillingError.unverifiedTransaction
    }
  }

  // `latest(for:)` rather than `currentEntitlements`: an expired subscription is exactly the case
  // that still collides, because resubscribing within 180 days keeps the original transaction id.
  private func foreignOwnedProductId(among productIds: Set<String>, workspaceToken: UUID) async -> String? {
    for productId in productIds {
      guard let result = await StoreKit.Transaction.latest(for: productId),
            case .verified(let transaction) = result
      else { continue }
      if AppStoreOwnership.conflictsWithAnotherWorkspace(
        transactionToken: transaction.appAccountToken,
        workspaceToken: workspaceToken
      ) {
        return productId
      }
    }
    return nil
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

  // A transaction the server has permanently refused is never replayed: it stays unfinished so it
  // remains recoverable by support, but it is not resubmitted on every launch.
  @discardableResult
  func reconcileUnfinishedTransactions() async -> AppStoreReconciliationSummary {
    var reconciled = 0
    var unlinkable = 0
    for await result in StoreKit.Transaction.unfinished {
      guard case .verified(let transaction) = result else { continue }
      let transactionId = String(transaction.id)
      if terminalTransactions.contains(transactionId) {
        unlinkable += 1
        continue
      }
      do {
        try await acknowledger.acknowledge(
          transactionId: transactionId,
          signedTransactionInfo: result.jwsRepresentation
        )
        reconciled += 1
      } catch {
        if AppStoreBillingFailure.isTerminal(error) {
          terminalTransactions.record(transactionId)
          unlinkable += 1
        }
        continue
      }
    }
    return AppStoreReconciliationSummary(reconciled: reconciled, unlinkable: unlinkable)
  }

  func observeTransactionUpdates() async {
    for await result in StoreKit.Transaction.updates {
      guard !Task.isCancelled else { return }
      guard case .verified(let transaction) = result else { continue }
      let transactionId = String(transaction.id)
      guard !terminalTransactions.contains(transactionId) else { continue }
      do {
        try await acknowledger.acknowledge(
          transactionId: transactionId,
          signedTransactionInfo: result.jwsRepresentation
        )
      } catch {
        if AppStoreBillingFailure.isTerminal(error) {
          terminalTransactions.record(transactionId)
        }
      }
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
