import SDWebImage
import UIKit

extension DarkroomController {
  func wireActions() {
    avatarButton.addAction(UIAction { [weak self] _ in self?.presentAccountSheet() }, for: .primaryActionTriggered)
    stageView.onSelect = { [weak self] in self?.uploadFlow.begin() }
    stageView.onRetry = { id in UploadCenter.shared.retry(id: id) }
    stageView.onSecondary = { [weak self] in self?.stageSecondary() }
    stageView.onPrimary = { [weak self] in self?.stagePrimary() }
    uploadFlow.onInteractionChange = { [weak self] _ in self?.renderStage(animated: true) }
    let routes: [(DarkroomRowButton, StudioHomeRoute)] = [
      (rows.library, .library), (rows.replies, .comments), (rows.data, .analytics),
      (rows.sync, .operations), (rows.site, .site), (rows.domain, .domain),
    ]
    for (row, route) in routes {
      row.addAction(UIAction { [weak self] _ in self?.push(route, animated: true) }, for: .primaryActionTriggered)
    }
    rows.plan.addAction(UIAction { _ in AppNavigator.shared.presentSubscription(focus: nil) }, for: .primaryActionTriggered)
    rows.sponsor.addAction(UIAction { [weak self] _ in self?.sponsor() }, for: .primaryActionTriggered)
    rows.accountSettings.addAction(UIAction { [weak self] _ in self?.presentAccountSheet() }, for: .primaryActionTriggered)
    rows.cache.addAction(UIAction { [weak self] _ in self?.confirmClearCache() }, for: .primaryActionTriggered)
    rows.signOut.addAction(UIAction { [weak self] _ in self?.confirmSignOut() }, for: .primaryActionTriggered)
  }

  func observeUploads() {
    uploadToken = UploadCenter.shared.observe { [weak self] jobs in
      self?.handleJobs(jobs)
    }
  }

  private func handleJobs(_ next: [UploadJobState]) {
    let running = UploadQueueSummary(jobs: next).running
    if !clearedStaleJobs {
      clearedStaleJobs = true
      if !running, !next.isEmpty, next.allSatisfy({ $0.status == .done || $0.status == .cancelled }) {
        UploadCenter.shared.clearFinished()
        return
      }
    }
    jobs = next
    if wasRunning, !running { model.reload() }
    wasRunning = running
    renderStage(animated: true)
    resolveAccent()
  }

  private func resolveAccent() {
    guard let first = jobs.first(where: { $0.status != .cancelled }) else {
      stageView.accent = AFColor.accentFallback
      applyFocusAccent()
      return
    }
    let url = UploadCenter.previewURL(first.id)
    guard FileManager.default.fileExists(atPath: url.path) else { return }
    AccentStore.shared.accent(photoId: "upload:\(first.id)", thumbnailURL: url) { [weak self] color in
      guard let self, self.jobs.first(where: { $0.status != .cancelled })?.id == first.id else { return }
      self.stageView.accent = color
      self.applyFocusAccent()
    }
  }

  func applyFocusAccent() {
    guard view.window != nil, AppNavigator.shared.tabs?.currentTab == .darkroom else { return }
    let developing = jobs.contains { $0.status != .cancelled }
    AppNavigator.shared.setFocusAccent(developing ? stageView.accent : AFColor.accentFallback)
  }

  private func stageSecondary() {
    let stage = DarkroomStage(jobs: jobs)
    if stage.phase == .stalled {
      jobs.filter { $0.status == .failed }.forEach { UploadCenter.shared.cancel(id: $0.id) }
      UploadCenter.shared.clearFinished()
      return
    }
    UploadCenter.shared.clearFinished()
    AppNavigator.shared.switchToTab(.exhibition)
  }

  private func stagePrimary() {
    let stage = DarkroomStage(jobs: jobs)
    if stage.phase == .stalled {
      if let reason = jobs.compactMap(\.quotaReason).first {
        AppNavigator.shared.presentSubscription(focus: reason)
      } else {
        UploadCenter.shared.retryAllFailed()
      }
      return
    }
    UploadCenter.shared.clearFinished()
    uploadFlow.begin()
  }

  func observeAccountStores() {
    EntitlementStore.shared.$snapshot
      .receive(on: DispatchQueue.main)
      .sink { [weak self] _ in self?.render() }
      .store(in: &cancellables)
    guard AfilmoryBuildConfiguration.supportsStoreKitSponsorship else { return }
    let store = SponsorshipStore()
    sponsorship = store
    store.$state
      .receive(on: DispatchQueue.main)
      .sink { [weak self] _ in self?.renderSponsorship() }
      .store(in: &cancellables)
    Task {
      await store.load()
      await store.observeTransactionUpdates()
    }
  }

  func renderSponsorship() {
    guard let store = sponsorship else { return }
    rows.sponsor.isBusy = store.state == .loading || store.state == .purchasing || store.state == .idle
    rows.sponsor.detail = switch store.state {
    case .ready: store.displayPrice
    case .pending: String(localized: "Awaiting approval")
    case .purchased: String(localized: "Thank you")
    case .unavailable: String(localized: "Unavailable")
    case .idle, .loading, .purchasing: nil
    }
  }

  private func sponsor() {
    guard let store = sponsorship else { return }
    Task { [weak self] in
      if store.state == .unavailable {
        await store.load()
        return
      }
      switch await store.purchase() {
      case .purchased:
        UINotificationFeedbackGenerator().notificationOccurred(.success)
      case .failed:
        self?.showAlert(title: String(localized: "Sponsorship failed"), message: String(localized: "The purchase could not be completed. Please try again."))
      case .cancelled, .pending:
        break
      }
    }
  }

  func renderQuota() {
    var warnings = EntitlementStore.shared.warnings
    #if DEBUG
      if let debugQuotaWarnings { warnings = debugQuotaWarnings }
    #endif
    quotaStack.arrangedSubviews.forEach { $0.removeFromSuperview() }
    quotaStack.isHidden = warnings.isEmpty || !model.canManage
    for dimension in warnings {
      let row = DarkroomQuotaRow(title: QuotaFormatter.warningTitle(for: dimension), detail: QuotaFormatter.detail(for: dimension))
      row.addAction(UIAction { _ in
        AppNavigator.shared.presentSubscription(focus: DarkroomUploadFlow.quotaReason(for: dimension))
      }, for: .primaryActionTriggered)
      quotaStack.addArrangedSubview(row)
    }
  }

  func workspaceMenu() -> UIMenu {
    let current = model.session?.activeWorkspace?.id
    let actions = model.manageableWorkspaces.map { workspace in
      UIAction(
        title: workspace.name,
        subtitle: workspace.slug,
        state: workspace.id == current ? .on : .off
      ) { [weak self] _ in self?.model.switchWorkspace(to: workspace.id) }
    }
    return UIMenu(title: String(localized: "Switch workspace"), children: actions)
  }

  func presentAccountSheet() {
    let session = model.session
    let parts = [model.galleryHost, DarkroomAccountSheetController.roleName(session?.activeMembership?.role)].compactMap { $0 }
    let sheet = DarkroomAccountSheetController(user: session?.user, subtitle: parts.joined(separator: " · "))
    sheet.onRow = { [weak self] row in
      switch row {
      case .manageSubscription: AppNavigator.shared.presentSubscription(focus: nil)
      case .replayIntro: AppNavigator.shared.presentIntro()
      case .signOut: self?.confirmSignOut()
      case .deleteAccount: AppNavigator.shared.presentAccountSettings(startsDeletion: true)
      }
    }
    present(sheet, animated: true)
  }

  func refreshCacheSize() {
    SDImageCache.shared.calculateSize { [weak self] _, total in
      DispatchQueue.main.async {
        self?.cacheBytes = total
        self?.rows.cache.detail = Int64(total).formatted(.byteCount(style: .file))
      }
    }
  }

  private func confirmClearCache() {
    let size = Int64(cacheBytes ?? 0).formatted(.byteCount(style: .file))
    let alert = UIAlertController(
      title: String(localized: "Clear image cache?"),
      message: String(localized: "Frees \(size). Photos download again when you view them."),
      preferredStyle: .actionSheet
    )
    alert.addAction(UIAlertAction(title: String(localized: "Clear cache"), style: .destructive) { [weak self] _ in
      SDImageCache.shared.clearMemory()
      SDImageCache.shared.clearDisk {
        DispatchQueue.main.async {
          UIImpactFeedbackGenerator(style: .light).impactOccurred()
          self?.refreshCacheSize()
        }
      }
    })
    alert.addAction(UIAlertAction(title: String(localized: "Cancel"), style: .cancel))
    alert.popoverPresentationController?.sourceView = rows.cache
    present(alert, animated: true)
  }

  func confirmSignOut() {
    let alert = UIAlertController(title: String(localized: "Sign out of your gallery?"), message: nil, preferredStyle: .actionSheet)
    alert.addAction(UIAlertAction(title: String(localized: "Sign out"), style: .destructive) { _ in AppNavigator.shared.signOut() })
    alert.addAction(UIAlertAction(title: String(localized: "Cancel"), style: .cancel))
    alert.popoverPresentationController?.sourceView = rows.signOut
    present(alert, animated: true)
  }
}
