import UIKit

@MainActor
final class DarkroomUploadFlow {
  private weak var host: UIViewController?
  private let availableTags: () -> [String]
  private(set) var interaction: DarkroomInteraction = .none {
    didSet { onInteractionChange?(interaction) }
  }

  var onInteractionChange: ((DarkroomInteraction) -> Void)?
  var onEnqueued: (() -> Void)?

  init(host: UIViewController, availableTags: @escaping () -> [String]) {
    self.host = host
    self.availableTags = availableTags
  }

  func begin() {
    guard interaction == .none, let host else { return }
    if let reason = Self.blockingQuota() {
      AppNavigator.shared.presentSubscription(focus: reason)
      return
    }
    #if DEBUG
      if FixtureMode.isOn {
        review(DarkroomFixturePicks.picks())
        return
      }
    #endif
    interaction = .selecting
    UploadPickerSession.present(from: host) { [weak self] result in
      guard let self else { return }
      switch result {
      case .success(let picked):
        guard !picked.isEmpty else {
          self.interaction = .none
          return
        }
        self.review(DarkroomPick.fromLibrary(picked))
      case .failure(let error):
        self.interaction = .none
        self.showError(error.localizedDescription)
      }
    }
  }

  func review(_ picks: [DarkroomPick]) {
    guard let host, !picks.isEmpty else {
      interaction = .none
      return
    }
    interaction = .reviewing
    let sheet = DarkroomReviewSheetController(picks: picks, availableTags: availableTags())
    sheet.onStart = { [weak self] chosen, tags in
      self?.interaction = .none
      self?.enqueue(chosen, tags: tags)
      self?.onEnqueued?()
    }
    sheet.onCancel = { [weak self] in self?.interaction = .none }
    host.present(sheet, animated: true)
  }

  private func enqueue(_ picks: [DarkroomPick], tags: [String]) {
    guard let endpoint = Self.uploadEndpoint() else {
      showError(String(localized: "Your workspace is not ready yet. Try again in a moment."))
      return
    }
    let directory = UploadTagPath.directory(from: tags)
    UploadActivityController.shared.setTitle(String(localized: "Developing photos"))
    let library = picks.filter { if case .library = $0.source { true } else { false } }
    if !library.isEmpty {
      _ = UploadCenter.shared.enqueue(endpoint: endpoint, directory: directory, items: library.map { ($0.id, $0.name) })
    }
    let files: [UploadStagedAsset] = picks.compactMap { pick in
      guard case .file(let url) = pick.source else { return nil }
      let mime = url.pathExtension.lowercased() == "png" ? "image/png" : "image/jpeg"
      return try? UploadStagedAsset(id: UUID().uuidString, photo: UploadStagedFile(url: url, name: pick.name, mimeType: mime))
    }
    guard !files.isEmpty else { return }
    Task.detached(priority: .userInitiated) {
      do {
        _ = try UploadCenter.shared.enqueuePreparedAssets(endpoint: endpoint, directory: directory, items: files)
      } catch {
        let message = error.localizedDescription
        await MainActor.run { [weak self] in self?.showError(message) }
      }
    }
  }

  static func uploadEndpoint() -> String? {
    if let tenant = AfilmorySessionStore.shared.current().tenantBaseURL {
      return "\(tenant)/photos/assets/upload"
    }
    #if DEBUG
      if FixtureMode.isOn { return "https://\(FixtureMode.host)/api/photos/assets/upload" }
    #endif
    return nil
  }

  static func blockingQuota() -> QuotaWallReason? {
    guard let snapshot = EntitlementStore.shared.snapshot else { return nil }
    let blocking = ["library_items", "monthly_process", "storage"]
    let exceeded = snapshot.dimensions.first { dimension in
      guard blocking.contains(dimension.reason), let limit = dimension.limit else { return false }
      return dimension.used >= limit
    }
    return exceeded.map(quotaReason(for:))
  }

  static func quotaReason(for dimension: BillingOverview.QuotaDimension) -> QuotaWallReason {
    let used = NSNumber(value: dimension.used)
    let limit = NSNumber(value: dimension.limit ?? 0)
    let details: [String: Any] = [
      "reason": dimension.reason,
      "current": used, "used": used, "usedBytes": used,
      "limit": limit, "capacityBytes": limit,
    ]
    return QuotaWallReason.parse(details: details) ?? .unknown
  }

  #if DEBUG
    func debugDevelopFixtures() {
      enqueue(DarkroomFixturePicks.picks(), tags: [])
    }
  #endif

  private func showError(_ message: String) {
    let alert = UIAlertController(title: String(localized: "Upload failed"), message: message, preferredStyle: .alert)
    alert.addAction(UIAlertAction(title: String(localized: "Done"), style: .default))
    host?.present(alert, animated: true)
  }
}
