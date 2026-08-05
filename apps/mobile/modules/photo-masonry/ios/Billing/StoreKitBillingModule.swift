import ExpoModulesCore
import StoreKit
import UIKit

public final class StoreKitBillingModule: Module {
  private var transactionUpdatesTask: Task<Void, Never>?

  public func definition() -> ModuleDefinition {
    Name("StoreKitBilling")
    Events("onTransaction")

    OnCreate {
      self.transactionUpdatesTask = Task { [weak self] in
        for await verification in Transaction.updates {
          guard !Task.isCancelled else { return }
          guard case .verified(let transaction) = verification else { continue }
          let payload = Self.transactionPayload(transaction, signedTransactionInfo: verification.jwsRepresentation)
          await MainActor.run {
            self?.sendEvent("onTransaction", payload)
          }
        }
      }
    }

    OnDestroy {
      self.transactionUpdatesTask?.cancel()
      self.transactionUpdatesTask = nil
    }

    AsyncFunction("loadProducts") { (productIds: [String]) in
      let requestedIds = Self.uniqueProductIds(productIds)
      let products = try await Product.products(for: requestedIds)
      let productsById = Dictionary(uniqueKeysWithValues: products.map { ($0.id, $0) })
      return requestedIds.compactMap { productId in
        productsById[productId].map(Self.productPayload)
      }
    }

    AsyncFunction("purchase") { (productId: String, appAccountToken: String) in
      guard let token = UUID(uuidString: appAccountToken) else {
        throw StoreKitBillingError.invalidAppAccountToken
      }
      guard let product = try await Product.products(for: [productId]).first(where: { $0.id == productId }) else {
        throw StoreKitBillingError.productUnavailable
      }

      switch try await product.purchase(options: [.appAccountToken(token)]) {
      case .success(let verification):
        switch verification {
        case .verified(let transaction):
          return Self.transactionPayload(transaction, signedTransactionInfo: verification.jwsRepresentation)
            .merging(["status": "success"]) { _, next in next }
        case .unverified:
          throw StoreKitBillingError.unverifiedTransaction
        }
      case .pending:
        return ["status": "pending"]
      case .userCancelled:
        return ["status": "cancelled"]
      @unknown default:
        throw StoreKitBillingError.unknownPurchaseResult
      }
    }

    AsyncFunction("unfinishedTransactions") {
      var transactions: [[String: Any]] = []
      for await verification in Transaction.unfinished {
        guard case .verified(let transaction) = verification else { continue }
        transactions.append(
          Self.transactionPayload(transaction, signedTransactionInfo: verification.jwsRepresentation)
        )
      }
      return transactions
    }

    AsyncFunction("restoreTransactions") { (productIds: [String]) in
      try await AppStore.sync()
      let allowedProductIds = Set(Self.uniqueProductIds(productIds))
      var transactions: [[String: Any]] = []
      for await verification in Transaction.currentEntitlements {
        guard case .verified(let transaction) = verification else { continue }
        guard allowedProductIds.contains(transaction.productID) else { continue }
        transactions.append(
          Self.transactionPayload(transaction, signedTransactionInfo: verification.jwsRepresentation)
        )
      }
      return transactions
    }

    AsyncFunction("finishTransaction") { (transactionId: String) in
      guard let expectedId = UInt64(transactionId) else {
        throw StoreKitBillingError.invalidTransactionIdentifier
      }
      for await verification in Transaction.unfinished {
        guard case .verified(let transaction) = verification else { continue }
        guard transaction.id == expectedId else { continue }
        guard StoreKitBillingFinishGate.allowsFinish(isVerified: true, serverAcknowledged: true) else {
          return false
        }
        await transaction.finish()
        return true
      }
      return false
    }

    AsyncFunction("manageSubscriptions") {
      let windowScene = await MainActor.run {
        UIApplication.shared.connectedScenes
          .compactMap { $0 as? UIWindowScene }
          .first { $0.activationState == .foregroundActive }
      }
      guard let windowScene else {
        throw StoreKitBillingError.windowSceneUnavailable
      }
      try await AppStore.showManageSubscriptions(in: windowScene)
    }
  }

  private static func uniqueProductIds(_ values: [String]) -> [String] {
    var seen = Set<String>()
    return values.compactMap { value in
      let normalized = value.trimmingCharacters(in: .whitespacesAndNewlines)
      guard !normalized.isEmpty, seen.insert(normalized).inserted else { return nil }
      return normalized
    }
  }

  private static func productPayload(_ product: Product) -> [String: Any] {
    var payload: [String: Any] = [
      "displayName": product.displayName,
      "displayPrice": product.displayPrice,
      "id": product.id,
    ]
    if let period = product.subscription?.subscriptionPeriod {
      payload["subscriptionPeriod"] = [
        "unit": subscriptionPeriodUnit(period.unit),
        "value": period.value,
      ]
    }
    return payload
  }

  private static func subscriptionPeriodUnit(_ unit: Product.SubscriptionPeriod.Unit) -> String {
    switch unit {
    case .day: "day"
    case .week: "week"
    case .month: "month"
    case .year: "year"
    @unknown default: "unknown"
    }
  }

  private static func transactionPayload(
    _ transaction: StoreKit.Transaction,
    signedTransactionInfo: String
  ) -> [String: Any] {
    [
      "productId": transaction.productID,
      "signedTransactionInfo": signedTransactionInfo,
      "transactionId": String(transaction.id),
    ]
  }
}

private enum StoreKitBillingError: Error {
  case invalidAppAccountToken
  case invalidTransactionIdentifier
  case productUnavailable
  case unknownPurchaseResult
  case unverifiedTransaction
  case windowSceneUnavailable
}
