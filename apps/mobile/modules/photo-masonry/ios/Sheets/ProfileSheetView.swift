import SDWebImage
import SwiftUI
import UIKit

struct ProfileSheetView: View {
  let profile: ProfileSheetRecord
  let onAccountSettings: () -> Void
  let onDeleteAccount: () -> Void
  let onSignOut: () -> Void

  @StateObject private var sponsorshipStore = SponsorshipStore()
  @State private var cacheBytes: UInt = 0
  @State private var cacheCleared = false
  @State private var confirmingSignOut = false
  @State private var confirmingDeleteAccount = false
  @State private var showingSponsorshipError = false

  private let stripHeight: CGFloat = 132
  private let avatarSize: CGFloat = 72

  var body: some View {
    ScrollView {
      VStack(spacing: 0) {
        header
        identity
        actions
      }
      .padding(.bottom, 24)
    }
    .background(Color(.systemGroupedBackground).ignoresSafeArea())
    .onAppear(perform: readCacheSize)
    .task {
      guard AfilmoryBuildConfiguration.supportsStoreKitSponsorship else { return }
      await sponsorshipStore.load()
      await sponsorshipStore.observeTransactionUpdates()
    }
    .alert(String(localized: "Sponsorship failed"), isPresented: $showingSponsorshipError) {
      Button(String(localized: "Done"), role: .cancel) {}
    } message: {
      Text("The purchase could not be completed. Please try again.")
    }
    .confirmationDialog(
      String(localized: "Sign out of your gallery?"),
      isPresented: $confirmingSignOut,
      titleVisibility: .visible
    ) {
      Button(String(localized: "Sign out"), role: .destructive, action: onSignOut)
      Button(String(localized: "Cancel"), role: .cancel) {}
    }
    .confirmationDialog(
      String(localized: "Delete account"),
      isPresented: $confirmingDeleteAccount,
      titleVisibility: .visible
    ) {
      Button(String(localized: "Delete account"), role: .destructive, action: onDeleteAccount)
      Button(String(localized: "Cancel"), role: .cancel) {}
    }
  }

  @ViewBuilder private var header: some View {
    if profile.strip.isEmpty {
      avatar.padding(.top, 28)
    } else {
      ZStack(alignment: .bottom) {
        stripView
        avatar.offset(y: avatarSize / 2)
      }
      .padding(.bottom, avatarSize / 2)
    }
  }

  private var stripView: some View {
    GeometryReader { proxy in
      let tiles = tileCount(for: proxy.size.width)
      HStack(spacing: 2) {
        ForEach(0..<tiles, id: \.self) { index in
          RemoteImage(
            url: profile.strip[index].url,
            thumbHash: profile.strip[index].thumbHash,
            pixelSize: CGSize(width: 320, height: 400)
          )
          .frame(maxWidth: .infinity)
          .frame(height: stripHeight)
          .clipped()
        }
      }
    }
    .frame(height: stripHeight)
  }

  private func tileCount(for width: CGFloat) -> Int {
    guard width > 0 else { return min(profile.strip.count, 5) }
    return max(1, min(profile.strip.count, Int(width / 56)))
  }

  private var avatar: some View {
    ZStack {
      if profile.avatarUrl.isEmpty {
        Circle().fill(Color.accentColor.opacity(0.18))
        Text(profile.avatarInitial)
          .font(.system(size: 28, weight: .bold))
          .foregroundStyle(Color.accentColor)
      } else {
        RemoteImage(
          url: profile.avatarUrl,
          thumbHash: nil,
          pixelSize: CGSize(width: 216, height: 216)
        )
      }
    }
    .frame(width: avatarSize, height: avatarSize)
    .clipShape(Circle())
    .padding(3)
    .background(Circle().fill(Color(.systemGroupedBackground)))
  }

  private var identity: some View {
    VStack(spacing: 4) {
      Text(profile.userName)
        .font(.headline)
      Text(profile.tenantLine)
        .font(.subheadline)
        .foregroundStyle(.secondary)
      if !profile.statsLine.isEmpty {
        Text(profile.statsLine)
          .font(.footnote)
          .foregroundStyle(.tertiary)
          .padding(.top, 2)
      }
    }
    .multilineTextAlignment(.center)
    .padding(.horizontal, 24)
    .padding(.top, 14)
  }

  private var actions: some View {
    VStack(spacing: 0) {
      if !profile.webUrl.isEmpty {
        actionRow(icon: "safari", title: String(localized: "Open gallery on web"), tint: .primary) {
          guard let url = URL(string: profile.webUrl) else { return }
          UIApplication.shared.open(url)
        }
        rowDivider
      }
      actionRow(icon: "person.crop.circle", title: String(localized: "Account settings"), tint: .primary) {
        onAccountSettings()
      }
      rowDivider
      if AfilmoryBuildConfiguration.supportsStoreKitSponsorship {
        sponsorshipRow
        rowDivider
      }
      cacheRow
      rowDivider
      actionRow(icon: "person.crop.circle.badge.minus", title: String(localized: "Delete account"), tint: .red) {
        confirmingDeleteAccount = true
      }
      rowDivider
      actionRow(
        icon: "rectangle.portrait.and.arrow.right",
        title: String(localized: "Sign out"),
        tint: .red
      ) {
        confirmingSignOut = true
      }
    }
    .background(
      Color(.secondarySystemGroupedBackground),
      in: RoundedRectangle(cornerRadius: 14, style: .continuous)
    )
    .padding(.horizontal, 20)
    .padding(.top, 24)
  }

  private var rowDivider: some View {
    Divider().padding(.leading, 52)
  }

  private var sponsorshipRow: some View {
    Button(action: handleSponsorship) {
      HStack(spacing: 12) {
        Image(systemName: "heart.fill")
          .foregroundStyle(.pink)
          .frame(width: 24)
        Text("Sponsor Afilmory")
          .foregroundStyle(.primary)
        Spacer()
        sponsorshipStatus
      }
      .padding(.horizontal, 16)
      .frame(minHeight: 48)
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .disabled(!sponsorshipStore.canPurchase && sponsorshipStore.state != .unavailable)
    .accessibilityLabel(sponsorshipAccessibilityLabel)
    .accessibilityHint(String(localized: "A one-time contribution that supports continued development. It does not unlock app features."))
  }

  private var sponsorshipAccessibilityLabel: String {
    let status: String? = switch sponsorshipStore.state {
    case .ready: sponsorshipStore.displayPrice
    case .pending: String(localized: "Awaiting approval")
    case .purchased: String(localized: "Thank you")
    case .unavailable: String(localized: "Unavailable")
    case .idle, .loading, .purchasing: nil
    }
    return [String(localized: "Sponsor Afilmory"), status]
      .compactMap { $0 }
      .joined(separator: ", ")
  }

  @ViewBuilder private var sponsorshipStatus: some View {
    switch sponsorshipStore.state {
    case .idle, .loading, .purchasing:
      ProgressView()
        .controlSize(.small)
        .accessibilityLabel(String(localized: "Sponsor Afilmory"))
    case .ready:
      if let displayPrice = sponsorshipStore.displayPrice {
        Text(displayPrice)
          .font(.subheadline.monospacedDigit())
          .foregroundStyle(.secondary)
      }
    case .pending:
      Text("Awaiting approval")
        .font(.subheadline)
        .foregroundStyle(.secondary)
    case .purchased:
      Label(String(localized: "Thank you"), systemImage: "checkmark")
        .font(.subheadline)
        .foregroundStyle(.green)
    case .unavailable:
      Text("Unavailable")
        .font(.subheadline)
        .foregroundStyle(.secondary)
    }
  }

  private func actionRow(
    icon: String,
    title: String,
    tint: Color,
    action: @escaping () -> Void
  ) -> some View {
    Button(action: action) {
      HStack(spacing: 12) {
        Image(systemName: icon)
          .frame(width: 24)
        Text(title)
        Spacer()
      }
      .foregroundStyle(tint)
      .padding(.horizontal, 16)
      .frame(height: 48)
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
  }

  private var cacheRow: some View {
    Button(action: clearCache) {
      HStack(spacing: 12) {
        Image(systemName: "trash")
          .frame(width: 24)
        Text("Clear image cache")
        Spacer()
        if cacheCleared {
          HStack(spacing: 4) {
            Image(systemName: "checkmark")
            Text("Cleared")
          }
          .font(.subheadline)
          .foregroundStyle(.secondary)
        } else {
          Text(Int64(cacheBytes).formatted(.byteCount(style: .file, spellsOutZero: false)))
            .font(.subheadline.monospacedDigit())
            .foregroundStyle(.secondary)
        }
      }
      .foregroundStyle(Color.primary)
      .padding(.horizontal, 16)
      .frame(height: 48)
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .disabled(cacheCleared)
  }

  private func handleSponsorship() {
    if sponsorshipStore.state == .unavailable {
      Task {
        await sponsorshipStore.load()
      }
      return
    }

    Task {
      switch await sponsorshipStore.purchase() {
      case .purchased:
        UINotificationFeedbackGenerator().notificationOccurred(.success)
      case .failed:
        showingSponsorshipError = true
      case .cancelled, .pending:
        break
      }
    }
  }

  private func readCacheSize() {
    SDImageCache.shared.calculateSize { _, totalSize in
      DispatchQueue.main.async {
        cacheBytes = totalSize
      }
    }
  }

  private func clearCache() {
    SDImageCache.shared.clearMemory()
    SDImageCache.shared.clearDisk {
      DispatchQueue.main.async {
        withAnimation(.easeOut(duration: 0.2)) {
          cacheBytes = 0
          cacheCleared = true
        }
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
      }
    }
  }
}

private struct RemoteImage: UIViewRepresentable {
  let url: String
  let thumbHash: String?
  let pixelSize: CGSize

  func makeUIView(context: Context) -> UIImageView {
    let view = UIImageView()
    view.contentMode = .scaleAspectFill
    view.clipsToBounds = true
    view.setContentHuggingPriority(.init(1), for: .horizontal)
    view.setContentHuggingPriority(.init(1), for: .vertical)
    view.setContentCompressionResistancePriority(.init(1), for: .horizontal)
    view.setContentCompressionResistancePriority(.init(1), for: .vertical)
    return view
  }

  func updateUIView(_ view: UIImageView, context: Context) {
    view.sd_setImage(
      with: URL(string: url),
      placeholderImage: ThumbHashCache.image(forHex: thumbHash),
      options: [.retryFailed],
      context: [.imageThumbnailPixelSize: NSValue(cgSize: pixelSize)]
    )
  }
}
