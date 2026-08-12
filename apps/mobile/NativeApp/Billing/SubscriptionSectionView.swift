import SwiftUI

struct SubscriptionSectionView: View {
  @StateObject private var store = SubscriptionStore()
  @State private var message: String?

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      Text("Subscription")
        .font(.system(size: 14, weight: .bold))

      switch store.state {
      case .idle, .loading:
        HStack(spacing: 10) {
          ProgressView()
          Text("Loading plans…")
            .font(.system(size: 13))
            .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(Color(uiColor: .secondarySystemGroupedBackground))
        .clipShape(.rect(cornerRadius: 16, style: .continuous))
      case .ready:
        offerList
        actionRow
      case .unavailable, .unconfigured:
        Text("Subscriptions are not available right now.")
          .font(.system(size: 13))
          .foregroundStyle(.secondary)
          .frame(maxWidth: .infinity, alignment: .leading)
          .padding(16)
          .background(Color(uiColor: .secondarySystemGroupedBackground))
          .clipShape(.rect(cornerRadius: 16, style: .continuous))
      }

      if let message {
        Text(message)
          .font(.system(size: 12))
          .foregroundStyle(.secondary)
      }
    }
    .task {
      await store.load()
      await store.reconcileUnfinishedTransactions()
      await store.observeTransactionUpdates()
    }
  }

  private var offerList: some View {
    VStack(spacing: 0) {
      ForEach(Array(store.offers.enumerated()), id: \.element.id) { index, purchasable in
        if index > 0 {
          Divider().padding(.leading, 16)
        }
        offerRow(purchasable)
      }
    }
    .background(Color(uiColor: .secondarySystemGroupedBackground))
    .clipShape(.rect(cornerRadius: 16, style: .continuous))
  }

  private func offerRow(_ purchasable: SubscriptionStore.PurchasableOffer) -> some View {
    Button {
      purchase(purchasable.offer)
    } label: {
      HStack(spacing: 12) {
        VStack(alignment: .leading, spacing: 3) {
          Text(purchasable.offer.name)
            .font(.system(size: 15, weight: .semibold))
          if let description = purchasable.offer.description {
            Text(description)
              .font(.system(size: 12))
              .foregroundStyle(.secondary)
          }
        }
        Spacer()
        if store.purchasingOfferId == purchasable.offer.id {
          ProgressView()
        } else if let displayPrice = purchasable.displayPrice {
          Text(displayPrice)
            .font(.system(size: 14, weight: .medium))
            .foregroundStyle(.secondary)
        }
      }
      .padding(.horizontal, 16)
      .padding(.vertical, 14)
      .contentShape(.rect)
    }
    .buttonStyle(.plain)
    .disabled(purchasable.product == nil || store.isBusy)
    .opacity(purchasable.product == nil ? 0.45 : 1)
  }

  private var actionRow: some View {
    HStack(spacing: 16) {
      Button(String(localized: "Restore purchases")) {
        restore()
      }
      .disabled(store.isBusy)
      Button(String(localized: "Manage subscription")) {
        Task { await store.manageSubscriptions() }
      }
      .disabled(store.isBusy)
      Spacer()
      if store.restoring { ProgressView() }
    }
    .font(.system(size: 13))
    .padding(.horizontal, 4)
  }

  private func purchase(_ offer: BillingOffer) {
    Task { @MainActor in
      message = nil
      switch await store.purchase(offer) {
      case .success(.completed):
        message = String(localized: "Your subscription is active.")
      case .success(.pending):
        message = String(localized: "This purchase is waiting for approval.")
      case .success(.cancelled):
        return
      case .failure:
        message = String(localized: "The purchase could not be completed. Please try again.")
      }
    }
  }

  private func restore() {
    Task { @MainActor in
      message = nil
      switch await store.restore() {
      case .success(let restored):
        message = restored > 0
          ? String(localized: "Restored \(restored) purchases.")
          : String(localized: "No purchases were found to restore.")
      case .failure:
        message = String(localized: "Purchases could not be restored. Please try again.")
      }
    }
  }
}
