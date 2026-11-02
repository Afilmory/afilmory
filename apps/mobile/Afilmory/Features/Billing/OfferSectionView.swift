import Foundation

enum QuotaFormatter {
  static func headline(for dimension: BillingOverview.QuotaDimension) -> String {
    switch dimension.reason {
    case "custom_domain": String(localized: "Custom domains")
    case "library_items": String(localized: "Library")
    case "monthly_process": String(localized: "Photos processed this month")
    case "storage": String(localized: "Storage used")
    default: String(localized: "Usage")
    }
  }

  static func warningTitle(for dimension: BillingOverview.QuotaDimension) -> String {
    let exceeded = dimension.limit.map { dimension.used >= $0 } ?? false
    switch dimension.reason {
    case "custom_domain":
      return String(localized: "Custom domain limit reached")
    case "library_items":
      return exceeded ? String(localized: "Library is full") : String(localized: "Library is almost full")
    case "monthly_process":
      return exceeded
        ? String(localized: "Monthly photo limit reached")
        : String(localized: "Monthly photo limit is almost reached")
    case "storage":
      return exceeded ? String(localized: "Storage is full") : String(localized: "Storage is almost full")
    default:
      return exceeded
        ? String(localized: "Plan limit reached")
        : String(localized: "Plan limit is almost reached")
    }
  }

  static func detail(for dimension: BillingOverview.QuotaDimension) -> String {
    guard let limit = dimension.limit else {
      return dimension.unit == "bytes" ? bytes(dimension.used) : "\(Int(dimension.used))"
    }
    if dimension.unit == "bytes" {
      return String(localized: "\(bytes(dimension.used)) of \(bytes(limit))")
    }
    return String(localized: "\(Int(dimension.used)) of \(Int(limit))")
  }

  static func ratio(for dimension: BillingOverview.QuotaDimension) -> Double {
    guard let limit = dimension.limit, limit > 0 else { return 0 }
    return min(max(dimension.used / limit, 0), 1)
  }

  static func bytes(_ value: Double) -> String {
    let formatter = ByteCountFormatter()
    formatter.countStyle = .binary
    formatter.allowsNonnumericFormatting = false
    return formatter.string(fromByteCount: Int64(max(0, value)))
  }
}
