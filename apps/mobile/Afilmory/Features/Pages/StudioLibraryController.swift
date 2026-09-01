import SwiftUI
import UIKit

enum StudioLibraryDeletePolicy {
  static func requiresStorageDeletion(storageProviders: [String]) -> Bool {
    storageProviders.contains { provider in
      provider.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == "managed"
    }
  }
}

final class StudioLibraryController: UIViewController {
  private let onRequestSignIn: () -> Void
  private let masonryView: PhotoMasonryView
  private let uploadFab: UploadFabView
  private var sessionObservation: AfilmorySessionObservationToken?
  private var feedObservation: PhotoFeedObservationToken?
  private var uploadObservation: UUID?
  private var feed: PhotoFeed?
  private var gallerySlug: String?
  private var selectedIds: [String] = []
  private var selectionMode = false
  private var mutating = false
  private var uploadJobs: [UploadJobState] = []
  private var uploadsWereRunning = false

  init(onRequestSignIn: @escaping () -> Void) {
    self.onRequestSignIn = onRequestSignIn
    masonryView = PhotoMasonryView(frame: .zero)
    uploadFab = UploadFabView(frame: .zero)
    super.init(nibName: nil, bundle: nil)
    configureMasonry()
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) is not supported")
  }

  deinit {
    if let uploadObservation {
      UploadCenter.shared.unobserve(uploadObservation)
    }
  }

  override func loadView() {
    let root = UIView()
    root.backgroundColor = .systemBackground
    masonryView.frame = root.bounds
    masonryView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    root.addSubview(masonryView)
    root.addSubview(uploadFab)
    view = root
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    sessionObservation = AfilmorySessionStore.shared.observe { [weak self] state in
      DispatchQueue.main.async {
        self?.handleSession(state)
      }
    }
    uploadObservation = UploadCenter.shared.observe { [weak self] jobs in
      self?.handleUploadJobs(jobs)
    }
    AfilmorySessionStore.shared.bootstrap()
    updateNavigation()
  }

  override func viewDidLayoutSubviews() {
    super.viewDidLayoutSubviews()
    let size: CGFloat = 52
    uploadFab.frame = CGRect(
      x: view.bounds.width - view.safeAreaInsets.right - size - 18,
      y: view.bounds.height - max(view.safeAreaInsets.bottom, 92) - size - 16,
      width: size,
      height: size
    )
  }

  private func configureMasonry() {
    masonryView.contextMenuInfoTitle = String(localized: "Photo information")
    masonryView.contextMenuSelectTitle = String(localized: "Select")
    masonryView.contextMenuShareTitle = String(localized: "Share photo")
    masonryView.extraBottomInset = 20
    masonryView.gap = 2
    masonryView.livePhotoAccessibilityLabel = String(localized: "Live Photo")
    masonryView.selectionEnabled = true
    masonryView.onNativePhotoPress = { [weak self] index in
      self?.presentPhoto(at: index)
    }
    masonryView.onNativeRefresh = { [weak self] in
      self?.reload()
    }
    masonryView.onNativeSelectionChange = { [weak self] ids in
      self?.selectedIds = ids
      self?.updateNavigation()
    }
    masonryView.onNativeSelectionModeChange = { [weak self] active in
      self?.selectionMode = active
      self?.updateNavigation()
    }
    masonryView.onNativeContextMenuAction = { [weak self] action, photoId in
      self?.performContextAction(action, photoId: photoId)
    }
  }

  private func handleSession(_ state: AfilmorySessionState) {
    switch state {
    case .loading:
      contentUnavailableConfiguration = UIContentUnavailableConfiguration.loading()
    case .signedOut, .failed:
      gallerySlug = nil
      feedObservation?.cancel()
      feedObservation = nil
      feed = nil
      masonryView.setPhotos([])
      showAccess(
        title: String(localized: "Sign in to Studio"),
        description: String(localized: "Sign in with the administrator account for your workspace."),
        image: "lock",
        action: String(localized: "Sign in"),
        handler: onRequestSignIn
      )
    case .signedIn(let session):
      let canManage = session.activeMembership.map {
        $0.status == "active" && ($0.role == "admin" || $0.role == "owner")
      } ?? false
      guard canManage,
            let workspace = session.activeWorkspace,
            workspace.status == "active"
      else {
        gallerySlug = nil
        feedObservation?.cancel()
        feedObservation = nil
        feed = nil
        masonryView.setPhotos([])
        showAccess(
          title: String(localized: "Administrator access required"),
          description: String(localized: "Studio is available to an active workspace administrator."),
          image: "person.badge.shield.checkmark",
          action: nil,
          handler: nil
        )
        return
      }
      gallerySlug = workspace.slug
      ApiEnvironmentStore.shared.activateTenant(slug: workspace.slug)
      if feed == nil {
        let feed = PhotoFeedStore.shared.feed(for: .studioLibrary)
        self.feed = feed
        feedObservation = feed.observe { [weak self] in self?.render() }
      }
      PhotoFeedStore.shared.load(.studioLibrary)
      render()
    }
  }

  private func render() {
    guard let feed else { return }
    masonryView.setRefreshing(feed.loadState == .loading && !feed.photos.isEmpty)
    if feed.loadState == .loading, feed.photos.isEmpty {
      contentUnavailableConfiguration = UIContentUnavailableConfiguration.loading()
      return
    }
    if feed.loadState == .failed, feed.photos.isEmpty {
      var configuration = UIContentUnavailableConfiguration.empty()
      configuration.image = UIImage(systemName: "exclamationmark.triangle")
      configuration.text = String(localized: "Unable to load Studio")
      configuration.secondaryText = feed.lastError ?? String(localized: "Check your connection and try again.")
      configuration.button = .filled()
      configuration.button.title = String(localized: "Retry")
      configuration.buttonProperties.primaryAction = UIAction { [weak self] _ in self?.reload() }
      contentUnavailableConfiguration = configuration
      return
    }
    masonryView.setPhotos(feed.photos.map(MasonryPhoto.init(photo:)))
    ShareUploadContextStore.updateSuggestedTags(availableTags())
    masonryView.setRefreshing(false)
    if feed.photos.isEmpty {
      var configuration = UIContentUnavailableConfiguration.empty()
      configuration.image = UIImage(systemName: "photo.on.rectangle.angled")
      configuration.text = String(localized: "No managed photos")
      configuration.secondaryText = String(localized: "Choose photos from the system library to add them to your gallery.")
      configuration.button = .filled()
      configuration.button.title = String(localized: "Upload Photos")
      configuration.buttonProperties.primaryAction = UIAction { [weak self] _ in self?.beginUpload() }
      contentUnavailableConfiguration = configuration
    } else {
      contentUnavailableConfiguration = nil
    }
    updateNavigation()
  }

  private func reload() {
    PhotoFeedStore.shared.load(.studioLibrary, force: true)
  }

  private func presentPhoto(at index: Int) {
    guard !selectionMode, let feed, feed.photos.indices.contains(index) else { return }
    let controller = PhotoDetailViewController(
      photos: feed.photos,
      initialIndex: index,
      gallerySlug: gallerySlug,
      onRequestSignIn: onRequestSignIn,
      sourceProvider: { [weak masonryView] photoId in
        masonryView?.visibleTransitionSourceView(for: photoId)
      }
    )
    present(controller, animated: true)
  }

  private func enterSelection() {
    selectionMode = true
    selectedIds = []
    masonryView.setSelectionMode(true)
    masonryView.setSelectedPhotoIds([])
    updateNavigation()
  }

  private func leaveSelection() {
    selectionMode = false
    selectedIds = []
    masonryView.setSelectionMode(false)
    masonryView.setSelectedPhotoIds([])
    updateNavigation()
  }

  private func updateNavigation() {
    let summary = UploadQueueSummary(jobs: uploadJobs)
    if selectionMode {
      title = String(localized: "\(selectedIds.count) Selected")
      let done = UIBarButtonItem(
        title: String(localized: "Done"),
        primaryAction: UIAction { [weak self] _ in self?.leaveSelection() }
      )
      if #available(iOS 26.0, *) {
        done.style = .prominent
      }
      let tags = UIBarButtonItem(
        image: UIImage(systemName: "tag"),
        primaryAction: UIAction { [weak self] _ in self?.editTags() }
      )
      tags.accessibilityLabel = String(localized: "Tags")
      tags.isEnabled = !selectedIds.isEmpty && !mutating
      let delete = UIBarButtonItem(
        image: UIImage(systemName: "trash"),
        primaryAction: UIAction { [weak self] _ in self?.confirmDelete() }
      )
      delete.tintColor = .systemRed
      delete.accessibilityLabel = String(localized: "Delete")
      delete.isEnabled = !selectedIds.isEmpty && !mutating
      navigationItem.rightBarButtonItems = [done, delete, tags]
    } else {
      title = summary.running
        ? String(localized: "Uploaded \(summary.done) of \(summary.total)")
        : summary.failed > 0
          ? String(localized: "\(summary.failed) failed")
          : String(localized: "Photo Library")
      let select = UIBarButtonItem(
        title: String(localized: "Select"),
        primaryAction: UIAction { [weak self] _ in self?.enterSelection() }
      )
      select.isEnabled = !mutating && !(feed?.photos.isEmpty ?? true)
      let upload = UIBarButtonItem(
        image: UIImage(systemName: "plus"),
        primaryAction: UIAction { [weak self] _ in self?.beginUpload() }
      )
      upload.accessibilityLabel = String(localized: "Upload Photos")
      upload.isEnabled = !mutating
      navigationItem.rightBarButtonItems = [select, upload]
    }
    uploadFab.isHidden = selectionMode || uploadJobs.isEmpty
  }

  private func editTags() {
    guard !mutating, let feed else { return }
    let selected = feed.studioPhotos.filter { selectedIds.contains($0.asset.id) }
    guard !selected.isEmpty else { return }
    let common = commonTags(selected.map(\.asset)).joined(separator: ", ")
    let alert = UIAlertController(
      title: String(localized: "Edit tags"),
      message: String(localized: "Enter comma-separated tags. The result replaces tags on every selected photo."),
      preferredStyle: .alert
    )
    alert.addTextField { $0.text = common }
    alert.addAction(UIAlertAction(title: String(localized: "Cancel"), style: .cancel))
    alert.addAction(UIAlertAction(title: String(localized: "Save"), style: .default) { [weak self, weak alert] _ in
      self?.applyTags(StudioPhotoMutations.parseTags(alert?.textFields?.first?.text ?? ""), to: selected.map(\.asset.id))
    })
    present(alert, animated: true)
  }

  private func applyTags(_ tags: [String], to ids: [String]) {
    mutating = true
    updateNavigation()
    Task { [weak self] in
      do {
        try await StudioPhotoMutations.applyTags(tags, assetIds: ids) { change in
          PhotoFeedStore.shared.applyCommitted(change)
        }
        self?.leaveSelection()
        if let slug = self?.gallerySlug {
          PhotoSyncEngine.shared.ensureSynced(slug: slug, includeStudio: true)
        }
      } catch {
        self?.showError(
          title: String(localized: "Unable to update tags"),
          message: error.localizedDescription
        )
      }
      self?.mutating = false
      self?.updateNavigation()
    }
  }

  private func confirmDelete() {
    guard !selectedIds.isEmpty, !mutating, let feed else { return }
    let selectedProviders = feed.studioPhotos
      .filter { selectedIds.contains($0.asset.id) }
      .map(\.asset.storageProvider)
    let requiresStorageDeletion = StudioLibraryDeletePolicy.requiresStorageDeletion(
      storageProviders: selectedProviders
    )
    let alert = UIAlertController(
      title: String(localized: "Delete selected photos?"),
      message: String(
        localized: "Delete \(selectedIds.count) selected photos. Removing storage files cannot be undone."
      ),
      preferredStyle: .alert
    )
    alert.addAction(UIAlertAction(title: String(localized: "Cancel"), style: .cancel))
    if requiresStorageDeletion {
      alert.addAction(UIAlertAction(
        title: String(localized: "Delete"),
        style: .destructive
      ) { [weak self] _ in self?.deleteSelected(fromStorage: true) })
      present(alert, animated: true)
      return
    }
    alert.addAction(UIAlertAction(
      title: String(localized: "Remove record only"),
      style: .destructive
    ) { [weak self] _ in self?.deleteSelected(fromStorage: false) })
    alert.addAction(UIAlertAction(
      title: String(localized: "Delete files too"),
      style: .destructive
    ) { [weak self] _ in self?.deleteSelected(fromStorage: true) })
    present(alert, animated: true)
  }

  private func deleteSelected(fromStorage: Bool) {
    let ids = selectedIds
    guard !ids.isEmpty else { return }
    mutating = true
    updateNavigation()
    Task { [weak self] in
      do {
        let changes = try await StudioPhotoMutations.delete(assetIds: ids, fromStorage: fromStorage)
        for change in changes {
          PhotoFeedStore.shared.applyCommitted(change)
        }
        self?.leaveSelection()
        if let slug = self?.gallerySlug {
          PhotoSyncEngine.shared.ensureSynced(slug: slug, includeStudio: true)
        }
      } catch {
        self?.showError(
          title: String(localized: "Unable to delete photos"),
          message: error.localizedDescription
        )
      }
      self?.mutating = false
      self?.updateNavigation()
    }
  }

  private func beginUpload() {
    guard !mutating else { return }
    UploadPickerSession.present(from: self) { [weak self] result in
      switch result {
      case .success(let values):
        guard !values.isEmpty else { return }
        self?.presentUploadReview(items: values, tags: [])
      case .failure(let error):
        self?.showError(
          title: String(localized: "Upload failed"),
          message: error.localizedDescription
        )
      }
    }
  }

  private func presentUploadReview(items: [UploadPickedPhoto], tags: [String]) {
    let suggestedTags = availableTags()
    let root = UploadReviewSheetView(
      items: items.map { UploadReviewItem(id: $0.id, isLivePhoto: $0.isLivePhoto) },
      initialTags: tags,
      suggestedTags: suggestedTags
    ) { [weak self] outcome in
      self?.dismiss(animated: true) {
        self?.handleUploadReview(outcome, items: items)
      }
    }
    let host = UIHostingController(rootView: root)
    host.navigationItem.title = String(localized: "Review Upload")
    let navigation = UINavigationController(rootViewController: host)
    navigation.modalPresentationStyle = .pageSheet
    navigation.sheetPresentationController?.detents = [.large()]
    navigation.sheetPresentationController?.prefersGrabberVisible = true
    present(navigation, animated: true)
  }

  private func handleUploadReview(_ outcome: UploadReviewOutcome, items: [UploadPickedPhoto]) {
    switch outcome {
    case .cancel:
      break
    case .start(let itemIds, let tags):
      let kept = items.filter { itemIds.contains($0.id) }
      enqueue(kept, tags: tags)
    case .addMore(let itemIds, let tags):
      let kept = items.filter { itemIds.contains($0.id) }
      UploadPickerSession.present(from: self) { [weak self] result in
        switch result {
        case .success(let values):
          let existing = Set(kept.map(\.id))
          let more = values.filter { !existing.contains($0.id) }
          self?.presentUploadReview(items: kept + more, tags: tags)
        case .failure(let error):
          self?.showError(
            title: String(localized: "Upload failed"),
            message: error.localizedDescription
          )
        }
      }
    }
  }

  private func enqueue(_ items: [UploadPickedPhoto], tags: [String]) {
    guard !items.isEmpty,
          let tenantBaseURL = AfilmorySessionStore.shared.current().tenantBaseURL
    else { return }
    UploadActivityController.shared.setTitle(String(localized: "Uploading photos"))
    _ = UploadCenter.shared.enqueue(
      endpoint: "\(tenantBaseURL)/photos/assets/upload",
      directory: UploadTagPath.directory(from: tags),
      items: items.map { ($0.id, $0.name) }
    )
  }

  private func handleUploadJobs(_ jobs: [UploadJobState]) {
    uploadJobs = jobs
    let running = UploadQueueSummary(jobs: jobs).running
    if uploadsWereRunning, !running {
      reload()
    }
    uploadsWereRunning = running
    updateNavigation()
    view.setNeedsLayout()
  }

  private func availableTags() -> [String] {
    guard let feed else { return [] }
    var seen = Set<String>()
    var values: [String] = []
    for item in feed.studioPhotos {
      guard case .array(let tags) = item.asset.manifest.data["tags"] else { continue }
      for tag in tags.compactMap(\.string) {
        let normalized = tag.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if !normalized.isEmpty, seen.insert(normalized).inserted {
          values.append(normalized)
        }
      }
    }
    return values
  }

  private func performContextAction(_ action: String, photoId: String) {
    guard let photo = feed?.photos.first(where: { $0.id == photoId }) else { return }
    if action == "share" {
      PhotoShareActivity.present(
        photoId: photo.id,
        gallerySlug: gallerySlug,
        from: self,
        sourceView: masonryView
      )
    }
  }

  private func showAccess(
    title: String,
    description: String,
    image: String,
    action: String?,
    handler: (() -> Void)?
  ) {
    var configuration = UIContentUnavailableConfiguration.empty()
    configuration.image = UIImage(systemName: image)
    configuration.text = title
    configuration.secondaryText = description
    if let action, let handler {
      configuration.button = .filled()
      configuration.button.title = action
      configuration.buttonProperties.primaryAction = UIAction { _ in handler() }
    }
    contentUnavailableConfiguration = configuration
  }

  private func showError(title: String, message: String) {
    let alert = UIAlertController(title: title, message: message, preferredStyle: .alert)
    alert.addAction(UIAlertAction(title: String(localized: "Done"), style: .default))
    present(alert, animated: true)
  }

  private func commonTags(_ assets: [StudioAsset]) -> [String] {
    guard let first = assets.first,
          case .array(let firstTags) = first.manifest.data["tags"]
    else { return [] }
    let initial = firstTags.compactMap(\.string)
    return initial.filter { tag in
      assets.dropFirst().allSatisfy { asset in
        guard case .array(let values) = asset.manifest.data["tags"] else { return false }
        return values.compactMap(\.string).contains(tag)
      }
    }
  }

}
