import SwiftUI

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

struct OfferSectionView: View {
  let title: String
  let dimension: BillingOverview.QuotaDimension?
  let offers: [SubscriptionStore.PurchasableOffer]
  let currentName: String?
  let purchasable: Bool
  let managedElsewhereNote: String?
  let onPurchase: (BillingOffer) -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text(title)
        .font(.system(size: 12.5))
        .textCase(.uppercase)
        .foregroundStyle(.secondary)
        .padding(.horizontal, 4)

      VStack(spacing: 0) {
        if let dimension {
          usageRow(dimension)
          if !offers.isEmpty {
            Divider().padding(.leading, 16)
          }
        }
        ForEach(Array(offers.enumerated()), id: \.element.id) { index, purchasableOffer in
          if index > 0 {
            Divider().padding(.leading, 16)
          }
          offerRow(purchasableOffer)
        }
      }
      .background(Color(uiColor: .secondarySystemGroupedBackground))
      .clipShape(.rect(cornerRadius: 12, style: .continuous))

      if let managedElsewhereNote {
        Text(managedElsewhereNote)
          .font(.system(size: 12))
          .foregroundStyle(.tertiary)
          .padding(.horizontal, 4)
      }
    }
  }

  private func usageRow(_ dimension: BillingOverview.QuotaDimension) -> some View {
    VStack(alignment: .leading, spacing: 6) {
      Text(QuotaFormatter.headline(for: dimension))
        .font(.system(size: 15))
      Text(QuotaFormatter.detail(for: dimension))
        .font(.system(size: 12.5))
        .foregroundStyle(.secondary)
      ProgressView(value: QuotaFormatter.ratio(for: dimension))
        .tint(dimension.nearingLimit ? .orange : .accentColor)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(.horizontal, 16)
    .padding(.vertical, 12)
  }

  private func offerRow(_ purchasableOffer: SubscriptionStore.PurchasableOffer) -> some View {
    let isCurrent = purchasableOffer.offer.name == currentName
    return Button {
      onPurchase(purchasableOffer.offer)
    } label: {
      HStack(spacing: 12) {
        VStack(alignment: .leading, spacing: 3) {
          Text(purchasableOffer.offer.name)
            .font(.system(size: 15, weight: .semibold))
          if let description = purchasableOffer.offer.description {
            Text(description)
              .font(.system(size: 12.5))
              .foregroundStyle(.secondary)
          }
        }
        Spacer()
        if isCurrent {
          Text("Current")
            .font(.system(size: 11, weight: .semibold))
            .foregroundStyle(.tint)
        } else if purchasable, let price = purchasableOffer.displayPrice {
          Text(price)
            .font(.system(size: 14))
            .foregroundStyle(.secondary)
        }
      }
      .padding(.horizontal, 16)
      .padding(.vertical, 12)
      .contentShape(.rect)
    }
    .buttonStyle(.plain)
    .disabled(!purchasable || purchasableOffer.product == nil || isCurrent)
  }
}
