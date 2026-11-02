import SDWebImage
import SwiftUI

final class SubscriptionPageController: UIHostingController<SubscriptionView> {
  init(focus: QuotaWallReason?) {
    super.init(rootView: SubscriptionView(focus: focus, onClose: {}))
    rootView = SubscriptionView(focus: focus, onClose: { [weak self] in self?.dismiss(animated: true) })
    modalPresentationStyle = .fullScreen
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) is not supported")
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = AFColor.ground
  }
}

struct SubscriptionView: View {
  @ObservedObject private var entitlements = EntitlementStore.shared
  @StateObject private var store = SubscriptionStore()
  @State private var message: String?
  @State private var selectedId: String?
  @State private var scrollTarget: String?
  @State private var hero = UIImage(named: IntroPage.all[IntroPage.all.count - 1].imageName)
  @State private var accent = AFColor.accentFallback

  let focus: QuotaWallReason?
  let onClose: () -> Void

  var body: some View {
    ZStack(alignment: .topTrailing) {
      Color(AFColor.ground).ignoresSafeArea()
      ScrollViewReader { reader in
      ScrollView {
        VStack(alignment: .leading, spacing: 0) {
          heroView
          VStack(alignment: .leading, spacing: 10) {
            usage
            section(String(localized: "Plan"), offers: purchasable(.plan), currentName: entitlements.snapshot?.applicationPlan.name)
            if entitlements.snapshot?.managedStorageEnabled == true {
              section(String(localized: "Managed storage"), offers: purchasable(.storage), currentName: entitlements.snapshot?.storagePlan?.name)
            }
            notes
          }
          .padding(.horizontal, 20)
          .padding(.top, 4)
          .padding(.bottom, 20)
        }
        .frame(maxWidth: 520)
        .frame(maxWidth: .infinity)
      }
      .ignoresSafeArea(edges: .top)
      .safeAreaInset(edge: .bottom, spacing: 0) { footer }
      .onChange(of: scrollTarget) { _, target in
        guard let target else { return }
        withAnimation(AFMotion.reduceMotion ? nil : .smooth) { reader.scrollTo(target, anchor: .bottom) }
      }
      }

      Button(action: onClose) {
        Image(systemName: "xmark")
          .font(.system(size: 15, weight: .semibold))
          .foregroundStyle(Color(AFColor.textPrimary))
          .frame(width: 44, height: 44)
          .background(Color(AFColor.fill).opacity(0.75), in: Circle())
      }
      .buttonStyle(.plain)
      .accessibilityLabel(String(localized: "Close"))
      .padding(.trailing, 16)
      .padding(.top, 6)
    }
    .preferredColorScheme(.dark)
    .tint(Color(accent))
    .task {
      loadHero()
      await store.load()
      await entitlements.refresh()
      if selectedId == nil {
        selectedId = SubscriptionPageModel.defaultSelection(
          offers: store.offers.map(\.offer),
          focus: focus,
          currentName: entitlements.snapshot?.applicationPlan.name
        )
        if focus != nil { scrollTarget = selectedId }
      }
      await store.reconcileUnfinishedTransactions()
      await store.observeTransactionUpdates()
    }
  }

  private var heroView: some View {
    ZStack(alignment: .bottomLeading) {
      Color(AFColor.filmBase)
        .overlay {
          if let hero {
            Image(uiImage: hero).resizable().scaledToFill()
          }
        }
        .clipped()
      LinearGradient(
        stops: [
          .init(color: Color(AFColor.ground).opacity(0.35), location: 0),
          .init(color: .clear, location: 0.3),
          .init(color: Color(AFColor.ground).opacity(0.6), location: 0.72),
          .init(color: Color(AFColor.ground), location: 1),
        ],
        startPoint: .top,
        endPoint: .bottom
      )
      VStack(alignment: .leading, spacing: 6) {
        HStack(spacing: 8) {
          Circle().fill(Color(accent)).frame(width: 7, height: 7)
          Text("Afilmory Pro").font(Font(AFFont.schola(size: 17, italic: true)))
        }
        Text("Give your gallery more room")
          .font(Font(AFFont.exhibit(size: 34, relativeTo: .largeTitle)))
          .fixedSize(horizontal: false, vertical: true)
      }
      .foregroundStyle(Color(AFColor.textPrimary))
      .padding(.horizontal, 24)
      .padding(.bottom, 14)
    }
    .frame(maxWidth: .infinity)
    .frame(height: 330)
    .clipped()
    .accessibilityElement(children: .combine)
  }

  @ViewBuilder private var usage: some View {
    let dimensions = entitlements.snapshot?.dimensions ?? []
    let segments = SubscriptionPageModel.usageSegments(dimensions, focus: focus)
    if !segments.isEmpty {
      VStack(alignment: .leading, spacing: 8) {
        Text(usageText(segments))
          .font(Font(AFFont.mono(size: 12)))
        GeometryReader { proxy in
          ZStack(alignment: .leading) {
            Capsule().fill(Color(AFColor.fill))
            Capsule().fill(Color(accent)).frame(width: proxy.size.width * SubscriptionPageModel.usageRatio(dimensions))
          }
        }
        .frame(height: 3)
      }
      .padding(.horizontal, 6)
      .padding(.bottom, 10)
      .accessibilityElement(children: .combine)
    }
  }

  private func usageText(_ segments: [SubscriptionPageModel.UsageSegment]) -> AttributedString {
    var line = AttributedString()
    for (index, segment) in segments.enumerated() {
      if index > 0 {
        var separator = AttributedString(" · ")
        separator.foregroundColor = Color(AFColor.textTertiary)
        line += separator
      }
      var run = AttributedString(segment.text)
      run.foregroundColor = Color(segment.highlighted ? accent : AFColor.textSecondary)
      line += run
    }
    return line
  }

  private func section(_ title: String, offers: [SubscriptionStore.PurchasableOffer], currentName: String?) -> some View {
    VStack(alignment: .leading, spacing: 10) {
      Text(title.uppercased())
        .font(Font(AFFont.mono(size: 11)))
        .tracking(0.6)
        .foregroundStyle(Color(AFColor.textTertiary))
        .padding(.horizontal, 6)
        .padding(.top, 6)
      if offers.isEmpty, store.state == .loading || store.state == .idle {
        ProgressView().frame(maxWidth: .infinity).padding(.vertical, 12)
      }
      ForEach(offers) { offer in
        OfferCard(
          offer: offer,
          isCurrent: offer.offer.name == currentName,
          isSelected: selectedId == offer.id,
          accent: accent,
          purchasable: canPurchase
        ) { selectedId = offer.id }
        .id(offer.id)
      }
    }
  }

  @ViewBuilder private var notes: some View {
    if let managedElsewhereNote {
      note(managedElsewhereNote)
    }
    if store.hasUnlinkablePurchase {
      note(String(localized: "A purchase on this Apple ID could not be linked to this workspace. Contact support if you believe this is a mistake."))
    }
    if let message {
      note(message)
    }
    note(String(localized: "Billing applies to this workspace. Payment is charged to your Apple ID."))
  }

  private func note(_ text: String) -> some View {
    Text(text)
      .font(.system(size: 12))
      .foregroundStyle(Color(AFColor.textTertiary))
      .fixedSize(horizontal: false, vertical: true)
      .padding(.horizontal, 6)
      .padding(.top, 4)
  }

  private var footer: some View {
    VStack(spacing: 10) {
      Button {
        if let offer = selectedOffer { purchase(offer.offer) }
      } label: {
        if store.purchasingOfferId != nil {
          ProgressView().tint(Color(AFColor.onLight))
        } else {
          Text(selectedOffer.map { String(localized: "Subscribe to \($0.offer.name)") } ?? String(localized: "Subscribe"))
        }
      }
      .buttonStyle(.afPrimary)
      .disabled(!canPurchase || selectedOffer?.product == nil || store.purchasingOfferId != nil)

      HStack(spacing: 14) {
        Button(String(localized: "Restore purchases")) { restore() }
          .disabled(store.isBusy || !canPurchase)
        Button(String(localized: "Manage subscription")) {
          Task { await store.manageSubscriptions() }
        }
      }
      .font(Font(AFFont.mono(size: 11)))
      .foregroundStyle(Color(AFColor.textSecondary))
      HStack(spacing: 14) {
        Link(String(localized: "Terms of Use"), destination: URL(string: "https://afilmory.art/terms/")!)
        Link(String(localized: "Privacy Policy"), destination: URL(string: "https://afilmory.art/privacy/")!)
      }
      .font(Font(AFFont.mono(size: 11)))
      .foregroundStyle(Color(AFColor.textTertiary))
    }
    .buttonStyle(.plain)
    .padding(.horizontal, 24)
    .padding(.top, 12)
    .padding(.bottom, 8)
    .frame(maxWidth: 520)
    .frame(maxWidth: .infinity)
    .background(Color(AFColor.ground))
  }

  private var selectedOffer: SubscriptionStore.PurchasableOffer? {
    store.offers.first { $0.id == selectedId }
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

  private func loadHero() {
    if let image = hero { accent = AccentExtractor.accent(for: image) }
    guard let slug = AfilmorySessionStore.shared.current().state.session?.activeWorkspace?.slug,
          let photo = PhotoFeedStore.shared.feed(for: .manifest(slug)).photos.first,
          let url = URL(string: photo.thumbnailUrl)
    else { return }
    SDWebImageManager.shared.loadImage(with: url, progress: nil) { image, _, _, _, _, _ in
      guard let image else { return }
      Task { @MainActor in
        hero = image
        accent = AccentExtractor.accent(for: image)
      }
    }
  }

  private func purchase(_ offer: BillingOffer) {
    Task { @MainActor in
      message = nil
      switch await store.purchase(offer) {
      case .success(.completed):
        message = String(localized: "Your subscription is active.")
        await entitlements.refresh()
      case .success(.testCompleted):
        message = String(localized: "App Store test transaction completed. This is a test environment, so your workspace plan was not changed.")
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
      case .success(let outcome):
        if outcome.tested > 0 {
          message = String(localized: "App Store test transaction completed. This is a test environment, so your workspace plan was not changed.")
        } else {
          message = outcome.restored > 0
            ? String(localized: "Restored \(outcome.restored) purchases.")
            : String(localized: "No purchases were found to restore.")
        }
        await entitlements.refresh()
      case .failure:
        message = String(localized: "Purchases could not be restored. Please try again.")
      }
    }
  }
}

private struct OfferCard: View {
  let offer: SubscriptionStore.PurchasableOffer
  let isCurrent: Bool
  let isSelected: Bool
  let accent: UIColor
  let purchasable: Bool
  let onSelect: () -> Void

  var body: some View {
    Button(action: onSelect) {
      HStack(spacing: 12) {
        VStack(alignment: .leading, spacing: 3) {
          Text(offer.offer.name)
            .font(Font(AFFont.exhibitUser(size: 20)))
            .foregroundStyle(Color(AFColor.textPrimary))
          if let description = offer.offer.description {
            Text(description)
              .font(.system(size: 13))
              .foregroundStyle(Color(AFColor.textSecondary))
          }
        }
        Spacer(minLength: 8)
        VStack(alignment: .trailing, spacing: 3) {
          if isCurrent {
            Text("Current")
              .font(Font(AFFont.mono(size: 11)))
              .foregroundStyle(Color(accent))
          } else if let price = offer.displayPrice {
            Text(price)
              .font(Font(AFFont.mono(size: 15)))
              .foregroundStyle(Color(AFColor.textPrimary))
          }
        }
      }
      .padding(.horizontal, 18)
      .padding(.vertical, 16)
      .background(Color(AFColor.raised), in: .rect(cornerRadius: 22, style: .continuous))
      .overlay(
        RoundedRectangle(cornerRadius: 22, style: .continuous)
          .stroke(Color(isSelected ? accent : AFColor.fill), lineWidth: isSelected ? 1.5 : 1)
      )
      .contentShape(.rect)
    }
    .buttonStyle(.plain)
    .disabled(isCurrent || !purchasable)
    .accessibilityAddTraits(isSelected ? .isSelected : [])
  }
}
