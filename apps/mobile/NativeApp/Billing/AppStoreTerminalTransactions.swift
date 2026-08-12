import Foundation

private struct BizErrorBody: Decodable {
  let code: Int
}

// Mirrors ErrorCode.BILLING_TRANSACTION_NOT_ATTRIBUTABLE: the server can never accept this
// transaction from this workspace, so replaying it only reproduces the same rejection.
enum AppStoreBillingFailure {
  static let notAttributableCode = 42

  static func isTerminal(_ error: Error) -> Bool {
    guard case .http(_, let body)? = error as? APIError,
          let payload = body?.data(using: .utf8),
          let decoded = try? JSONDecoder().decode(BizErrorBody.self, from: payload)
    else { return false }
    return decoded.code == notAttributableCode
  }
}

protocol AppStoreTerminalTransactionStore: Sendable {
  func contains(_ transactionId: String) -> Bool
  func record(_ transactionId: String)
}

// UserDefaults is thread-safe; only the compiler cannot see that through the class.
struct UserDefaultsTerminalTransactionStore: AppStoreTerminalTransactionStore, @unchecked Sendable {
  private static let key = "app.afilmory.billing.terminalTransactions"
  private static let limit = 64

  private let defaults: UserDefaults

  init(defaults: UserDefaults = .standard) {
    self.defaults = defaults
  }

  func contains(_ transactionId: String) -> Bool {
    stored().contains(transactionId)
  }

  func record(_ transactionId: String) {
    var ids = stored().filter { $0 != transactionId }
    ids.append(transactionId)
    defaults.set(Array(ids.suffix(Self.limit)), forKey: Self.key)
  }

  private func stored() -> [String] {
    defaults.array(forKey: Self.key) as? [String] ?? []
  }
}
