import Foundation

enum QuotaWallReason: Equatable {
  case customDomain(current: Int, limit: Int)
  case libraryItems(current: Int, limit: Int)
  case monthlyProcess(used: Int, limit: Int, requested: Int)
  case storage(usedBytes: Int64, incomingBytes: Int64, capacityBytes: Int64)
  case syncObjectSize(actualMb: Double, limitMb: Double)
  case unknown
  case uploadSize(actualMb: Double, limitMb: Double)

  static func parse(details: [String: Any]?) -> QuotaWallReason? {
    guard let details, let reason = details["reason"] as? String else { return nil }
    func int(_ key: String) -> Int { (details[key] as? NSNumber)?.intValue ?? 0 }
    func int64(_ key: String) -> Int64 { (details[key] as? NSNumber)?.int64Value ?? 0 }
    func double(_ key: String) -> Double { (details[key] as? NSNumber)?.doubleValue ?? 0 }

    switch reason {
    case "custom_domain":
      return .customDomain(current: int("current"), limit: int("limit"))
    case "library_items":
      return .libraryItems(current: int("current"), limit: int("limit"))
    case "monthly_process":
      return .monthlyProcess(used: int("used"), limit: int("limit"), requested: int("requested"))
    case "storage":
      return .storage(
        usedBytes: int64("usedBytes"),
        incomingBytes: int64("incomingBytes"),
        capacityBytes: int64("capacityBytes")
      )
    case "sync_object_size":
      return .syncObjectSize(actualMb: double("actualMb"), limitMb: double("limitMb"))
    case "upload_size":
      return .uploadSize(actualMb: double("actualMb"), limitMb: double("limitMb"))
    // A future server dimension must still raise a wall rather than vanish into a generic failure.
    default:
      return .unknown
    }
  }

  static func parse(apiError: APIError) -> QuotaWallReason? {
    guard case .http(_, let body) = apiError,
          let payload = body?.data(using: .utf8),
          let object = try? JSONSerialization.jsonObject(with: payload) as? [String: Any]
    else { return nil }
    return parse(details: object["details"] as? [String: Any])
  }
}

extension QuotaWallReason {
  var title: String {
    switch self {
    case .customDomain: String(localized: "Custom domains are not included")
    case .libraryItems: String(localized: "Library is full")
    case .monthlyProcess: String(localized: "Monthly photo limit reached")
    case .storage: String(localized: "Storage is full")
    case .syncObjectSize, .uploadSize: String(localized: "File is too large")
    case .unknown: String(localized: "Plan limit reached")
    }
  }

  var explanation: String {
    switch self {
    case .customDomain:
      String(localized: "Your plan does not include a custom domain.")
    case .libraryItems(let current, let limit):
      String(localized: "Your library holds \(current) of \(limit) photos.")
    case .monthlyProcess(let used, let limit, let requested):
      String(localized: "You have processed \(used) of \(limit) photos this month, and \(requested) more are queued.")
    case .storage(let used, let incoming, let capacity):
      String(localized: "Uploading needs \(Self.bytes(used + incoming - capacity)) more than your plan allows.")
    case .syncObjectSize(let actual, let limit), .uploadSize(let actual, let limit):
      // The multipart parser aborts the stream at the limit, so the real size is unknowable there.
      actual > 0
        ? String(localized: "This file is \(Self.megabytes(actual)), over the \(Self.megabytes(limit)) limit.")
        : String(localized: "This file is over the \(Self.megabytes(limit)) limit.")
    case .unknown:
      String(localized: "This workspace has reached a limit of its current plan.")
    }
  }

  var secondaryActionTitle: String {
    switch self {
    case .libraryItems, .storage: String(localized: "Free up space instead")
    case .customDomain: String(localized: "Remove an existing domain")
    case .monthlyProcess: String(localized: "Wait for next month's reset")
    case .syncObjectSize, .unknown, .uploadSize: String(localized: "Not now")
    }
  }

  // A per-file ceiling has no running total, so those reasons deliberately show no readout.
  var readout: [(label: String, value: String)] {
    switch self {
    case .storage(let used, let incoming, let capacity):
      [
        (String(localized: "Used"), Self.bytes(used)),
        (String(localized: "After this upload"), Self.bytes(used + incoming)),
        (String(localized: "Plan limit"), Self.bytes(capacity)),
      ]
    case .monthlyProcess(let used, let limit, let requested):
      [
        (String(localized: "Used"), "\(used)"),
        (String(localized: "After this upload"), "\(used + requested)"),
        (String(localized: "Plan limit"), "\(limit)"),
      ]
    case .libraryItems(let current, let limit):
      [(String(localized: "Used"), "\(current)"), (String(localized: "Plan limit"), "\(limit)")]
    case .customDomain(let current, let limit):
      [(String(localized: "Used"), "\(current)"), (String(localized: "Plan limit"), "\(limit)")]
    case .syncObjectSize, .unknown, .uploadSize:
      []
    }
  }

  private static func bytes(_ value: Int64) -> String {
    ByteCountFormatter.string(fromByteCount: max(0, value), countStyle: .file)
  }

  private static func megabytes(_ value: Double) -> String {
    String(format: "%.0f MB", value.rounded())
  }
}
