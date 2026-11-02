import Foundation

enum WorkspaceCustomDomainDecision: Equatable, Sendable {
  case skipped
  case request(String)
  case needsUpgrade(current: Int, limit: Int)
}

enum WorkspaceCustomDomain {
  static func normalize(_ value: String) -> String {
    var host = value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    if let scheme = host.range(of: "://") {
      host = String(host[scheme.upperBound...])
    }
    host = host.split(separator: "/", maxSplits: 1, omittingEmptySubsequences: false)
      .first
      .map(String.init) ?? host
    host = host.split(separator: ":", maxSplits: 1, omittingEmptySubsequences: false)
      .first
      .map(String.init) ?? host
    if host.hasSuffix(".") {
      host.removeLast()
    }
    return host
  }

  static func isValid(_ value: String) -> Bool {
    let host = normalize(value)
    guard host.contains("."),
          host.range(of: "^[a-z0-9.-]+$", options: .regularExpression) != nil,
          !host.hasPrefix("-"),
          !host.hasSuffix("-"),
          !host.hasPrefix("."),
          !host.hasSuffix(".")
    else { return false }
    return true
  }

  static func decision(for raw: String, limit: Int?, used: Int) -> WorkspaceCustomDomainDecision {
    let host = normalize(raw)
    guard !host.isEmpty else { return .skipped }
    if let limit, used >= limit {
      return .needsUpgrade(current: used, limit: limit)
    }
    return .request(host)
  }
}
