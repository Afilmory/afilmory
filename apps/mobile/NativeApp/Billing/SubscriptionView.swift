import SwiftUI

struct SubscriptionView: View {
  @Environment(\.dismiss) private var dismiss
  @ObservedObject private var entitlements = EntitlementStore.shared
  @StateObject private var store = SubscriptionStore()
  @State private var message: String?

  let focus: QuotaWallReason?

  init(focus: QuotaWallReason? = nil) {
    self.focus = focus
  }

  var body: some View {
    NavigationStack {
      ScrollViewReader { proxy in
        ScrollView {
          VStack(alignment: .leading, spacing: 22) {
            planSection.id(SectionAnchor.plan)
            if entitlements.snapshot?.managedStorageEnabled == true {
              storageSection.id(SectionAnchor.storage)
            }
            actionsSection
            statusText
          }
          .padding(.horizontal, 20)
          .padding(.vertical, 18)
        }
        .onAppear {
          guard let anchor = focus.map(SectionAnchor.matching) else { return }
          proxy.scrollTo(anchor, anchor: .top)
        }
      }
      .background(Color(uiColor: .systemGroupedBackground))
      .navigationTitle(String(localized: "Plan"))
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .confirmationAction) {
          Button(String(localized: "Done")) { dismiss() }
        }
      }
      .task {
        await store.load()
        await entitlements.refresh()
        await store.reconcileUnfinishedTransactions()
        await store.observeTransactionUpdates()
      }
    }
  }

  private enum SectionAnchor: Hashable {
    case plan
    case storage

    static func matching(_ reason: QuotaWallReason) -> SectionAnchor {
      if case .storage = reason { return .storage }
      return .plan
    }
  }

  private var planSection: some View {
    OfferSectionView(
      title: String(localized: "Plan"),
      dimension: entitlements.dimension(for: "monthly_process"),
      offers: purchasable(.plan),
      currentName: entitlements.snapshot?.applicationPlan.name,
      purchasable: canPurchase,
      managedElsewhereNote: managedElsewhereNote,
      onPurchase: purchase
    )
  }

  private var storageSection: some View {
    OfferSectionView(
      title: String(localized: "Managed storage"),
      dimension: entitlements.dimension(for: "storage"),
      offers: purchasable(.storage),
      currentName: entitlements.snapshot?.storagePlan?.name,
      purchasable: canPurchase,
      managedElsewhereNote: managedElsewhereNote,
      onPurchase: purchase
    )
  }

  private var actionsSection: some View {
    VStack(alignment: .leading, spacing: 8) {
      VStack(spacing: 0) {
        Button(String(localized: "Restore purchases")) { restore() }
          .padding(.horizontal, 16)
          .frame(maxWidth: .infinity, minHeight: 46, alignment: .leading)
          .disabled(store.isBusy || !canPurchase)
        Divider().padding(.leading, 16)
        Button(String(localized: "Manage subscription")) {
          Task { await store.manageSubscriptions() }
        }
        .padding(.horizontal, 16)
        .frame(maxWidth: .infinity, minHeight: 46, alignment: .leading)
      }
      .font(.system(size: 15))
      .background(Color(uiColor: .secondarySystemGroupedBackground))
      .clipShape(.rect(cornerRadius: 12, style: .continuous))

      Text("Billing applies to this workspace. Payment is charged to your Apple ID.")
        .font(.system(size: 12))
        .foregroundStyle(.tertiary)
        .padding(.horizontal, 4)
    }
  }

  @ViewBuilder private var statusText: some View {
    if store.hasUnlinkablePurchase {
      note(String(localized: "A purchase on this Apple ID could not be linked to this workspace. Contact support if you believe this is a mistake."))
    }
    if let message {
      note(message)
    }
  }

  private func note(_ text: String) -> some View {
    Text(text)
      .font(.system(size: 12))
      .foregroundStyle(.secondary)
      .padding(.horizontal, 4)
  }

  private var canPurchase: Bool {
    store.state == .ready && entitlements.snapshot?.subscriptionProvider != "creem"
  }

  private var managedElsewhereNote: String? {
    entitlements.snapshot?.subscriptionProvider == "creem"
      ? String(localized: "This subscription is managed on the web.")
      : nil
  }

  private func purchasable(_ family: OfferFamily) -> [SubscriptionStore.PurchasableOffer] {
    let allowed = Set(family.filter(store.offers.map(\.offer)).map(\.id))
    return store.offers.filter { allowed.contains($0.offer.id) }
  }

  private func purchase(_ offer: BillingOffer) {
    Task { @MainActor in
      message = nil
      switch await store.purchase(offer) {
      case .success(.completed):
        message = String(localized: "Your subscription is active.")
        await entitlements.refresh()
      case .success(.pending):
        message = String(localized: "This purchase is waiting for approval.")
      case .success(.cancelled):
        return
      case .failure(let error):
        if error as? AppStoreBillingError == .subscribedInAnotherWorkspace {
          message = String(localized: "This Apple ID already has a subscription in another workspace. Switch back to that workspace, or use a different Apple ID.")
        } else if AppStoreBillingFailure.isTerminal(error) {
          message = String(localized: "A purchase on this Apple ID could not be linked to this workspace. Contact support if you believe this is a mistake.")
        } else {
          message = String(localized: "The purchase could not be completed. Please try again.")
        }
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
        await entitlements.refresh()
      case .failure:
        message = String(localized: "Purchases could not be restored. Please try again.")
      }
    }
  }
}
