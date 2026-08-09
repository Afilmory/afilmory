import SwiftUI
import UIKit

final class PhotosHomeController: UIViewController {
  private static let preferredItemWidthKey = "afilmory.home.preferredItemWidth"

  private let onRequestSignIn: () -> Void
  private let onRequestSignOut: () -> Void
  private let onRequestWorkspaceSetup: () -> Void
  private let onRequestAccountSettings: () -> Void
  private let onRequestAccountDeletion: () -> Void
  private let masonryView: PhotoMasonryView
  private let emptyStateView = PageEmptyStateView()
  private var sessionObservation: AfilmorySessionObservationToken?
  private var feedObservation: PhotoFeedObservationToken?
  private var filterObservation: PhotoFeedObservationToken?
  private var feed: PhotoFeed?
  private var gallerySlug: String?
  private var session: AfilmorySession?
  private var visibleRange: (Int, Int)?
  private var displayedPhotos: [GalleryPhoto] = []

  init(
    onRequestSignIn: @escaping () -> Void,
    onRequestSignOut: @escaping () -> Void,
    onRequestWorkspaceSetup: @escaping () -> Void,
    onRequestAccountSettings: @escaping () -> Void,
    onRequestAccountDeletion: @escaping () -> Void
  ) {
    self.onRequestSignIn = onRequestSignIn
    self.onRequestSignOut = onRequestSignOut
    self.onRequestWorkspaceSetup = onRequestWorkspaceSetup
    self.onRequestAccountSettings = onRequestAccountSettings
    self.onRequestAccountDeletion = onRequestAccountDeletion
    masonryView = PhotoMasonryView(frame: .zero)
    super.init(nibName: nil, bundle: nil)
    configureMasonry()
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) is not supported")
  }

  override func loadView() {
    view = masonryView
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .systemBackground
    emptyStateView.translatesAutoresizingMaskIntoConstraints = false
    emptyStateView.isHidden = true
    view.addSubview(emptyStateView)
    NSLayoutConstraint.activate([
      emptyStateView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      emptyStateView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      emptyStateView.topAnchor.constraint(equalTo: view.topAnchor),
      emptyStateView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
    ])
    filterObservation = PhotoFilterStore.shared.observe { [weak self] in
      self?.renderFeed()
    }
    sessionObservation = AfilmorySessionStore.shared.observe { [weak self] state in
      DispatchQueue.main.async {
        self?.handleSession(state)
      }
    }
    AfilmorySessionStore.shared.bootstrap()
  }

  private func configureMasonry() {
    masonryView.chromeVisible = true
    masonryView.contextMenuInfoTitle = String(localized: "Photo information")
    masonryView.contextMenuShareTitle = String(localized: "Share photo")
    masonryView.extraBottomInset = 24
    masonryView.extraTopInset = 60
    masonryView.gap = 4
    masonryView.livePhotoAccessibilityLabel = String(localized: "Live Photo")
    masonryView.preferredItemWidth = preferredItemWidth()
    masonryView.onNativePhotoPress = { [weak self] index in
      self?.presentPhoto(at: index)
    }
    masonryView.onNativeVisibleRangeChange = { [weak self] start, end in
      self?.visibleRange = (start, end)
      self?.updateChrome()
    }
    masonryView.onNativeColumnCountChange = { _, width in
      UserDefaults.standard.set(min(max(width, 92), 640), forKey: Self.preferredItemWidthKey)
    }
    masonryView.onNativeRefresh = { [weak self] in
      guard let slug = self?.gallerySlug else { return }
      PhotoFeedStore.shared.load(.manifest(slug), force: true)
    }
    masonryView.onNativeDatePress = { [weak self] anchor in
      self?.presentFilters(anchor: anchor)
    }
    masonryView.onNativeFilterPress = { [weak self] anchor in
      self?.presentFilters(anchor: anchor)
    }
    masonryView.onNativeQueryHeaderEdit = { [weak self] anchor in
      self?.presentFilters(anchor: anchor)
    }
    masonryView.onNativeQueryHeaderClear = {
      PhotoFilterStore.shared.clear()
    }
    masonryView.onNativeQueryHeaderRemoveConstraint = { [weak self] constraint in
      self?.removeQueryConstraint(constraint)
    }
    masonryView.onNativeProfilePress = { [weak self] anchor in
      self?.presentProfile(anchor: anchor)
    }
    masonryView.onNativeContextMenuAction = { [weak self] action, photoId in
      self?.performContextAction(action, photoId: photoId)
    }
  }

  private func handleSession(_ state: AfilmorySessionState) {
    switch state {
    case .loading:
      showLoading()
    case .signedOut:
      session = nil
      gallerySlug = nil
      feedObservation?.cancel()
      feedObservation = nil
      feed = nil
      PhotoFilterStore.shared.deactivateGallery()
      masonryView.setPhotos([])
      showSignedOut()
    case .failed:
      showSignedOut()
    case .signedIn(let session):
      self.session = session
      guard let workspace = session.activeWorkspace, workspace.status == "active" else {
        gallerySlug = nil
        feedObservation?.cancel()
        feedObservation = nil
        feed = nil
        PhotoFilterStore.shared.deactivateGallery()
        masonryView.setPhotos([])
        showPending()
        return
      }
      if gallerySlug != workspace.slug {
        PhotoFilterStore.shared.activateGallery(workspace.slug)
        gallerySlug = workspace.slug
        ApiEnvironmentStore.shared.activateTenant(slug: workspace.slug)
        let feed = PhotoFeedStore.shared.feed(for: .manifest(workspace.slug))
        self.feed = feed
        feedObservation?.cancel()
        feedObservation = feed.observe { [weak self] in
          self?.renderFeed()
        }
        PhotoFeedStore.shared.load(.manifest(workspace.slug))
      }
      renderFeed()
    }
  }

  private func renderFeed() {
    guard let feed else { return }
    masonryView.setRefreshing(feed.loadState == .loading && !feed.photos.isEmpty)
    if feed.loadState == .loading, feed.photos.isEmpty {
      masonryView.setPhotos([])
      showLoading()
      return
    }
    if feed.loadState == .failed, feed.photos.isEmpty {
      masonryView.setPhotos([])
      showFeedError()
      return
    }
    if feed.photos.isEmpty {
      masonryView.setPhotos([])
      showEmpty()
      return
    }
    let filters = PhotoFilterStore.shared.filters
    displayedPhotos = PhotoFilterEngine.apply(filters, to: feed.photos)
    masonryView.setPhotos(displayedPhotos.map(MasonryPhoto.init(photo:)))
    if displayedPhotos.isEmpty {
      showFilteredEmpty()
    } else {
      clearUnavailableState()
    }
    updateChrome()
  }

  private func updateChrome() {
    guard let feed else { return }
    let filters = PhotoFilterStore.shared.filters
    let filtersActive = PhotoFilterEngine.hasActiveFilters(filters)
    let activeCount = PhotoFilterEngine.countActiveDimensions(filters)
    let dateLabel = visibleRange.flatMap {
      DateRange.visibleMonthAnchor(
        photos: displayedPhotos,
        startIndex: $0.0,
        endIndex: $0.1,
        localeIdentifier: PhotoDateLanguage.activeLocaleIdentifier
      )
    } ?? ""
    let city = visibleRange.flatMap {
      PhotoFilterEngine.cityForRange(displayedPhotos, startIndex: $0.0, endIndex: $0.1)
    } ?? ""
    masonryView.chromeIdentityLabel = session?.activeWorkspace?.name ?? ""
    masonryView.chromeDateLabel = filtersActive
      ? "\(displayedPhotos.count) · \(PhotoFilterEngine.summarize(filters))"
      : dateLabel
    masonryView.chromeDateDetail = filtersActive ? "" : city
    masonryView.chromeDateInteractive = filtersActive
    masonryView.chromeDateVisible = !displayedPhotos.isEmpty
      && (!masonryView.chromeDateLabel.isEmpty || !masonryView.chromeIdentityLabel.isEmpty)
    masonryView.filterActive = filtersActive
    masonryView.filterCount = activeCount
    masonryView.queryHeaderModel = filtersActive && !displayedPhotos.isEmpty
      ? makeQueryHeaderModel(filters: filters, photos: displayedPhotos)
      : nil
    masonryView.filterAccessibilityLabel = filtersActive
      ? String(localized: "Search and filters, \(activeCount) active")
      : String(localized: "Search and filters")
    masonryView.profileImageURL = session?.user.image ?? ""
    masonryView.profileInitial = session?.user.name.first.map { String($0).uppercased() } ?? "?"
    masonryView.profileAccessibilityLabel = session.map {
      String(localized: "Profile, \($0.user.name)")
    } ?? String(localized: "Profile, unknown user")
    if feed.loadState != .loading {
      masonryView.setRefreshing(false)
    }
  }

  private func presentPhoto(at index: Int) {
    guard displayedPhotos.indices.contains(index) else { return }
    let controller = PhotoDetailViewController(
      photos: displayedPhotos,
      initialIndex: index,
      gallerySlug: gallerySlug,
      onRequestSignIn: onRequestSignIn,
      sourceProvider: { [weak masonryView] photoId in
        masonryView?.visibleTransitionSourceView(for: photoId)
      }
    )
    present(controller, animated: true)
  }

  private func presentFilters(
    anchor: UIView,
    presenter: UIViewController? = nil
  ) {
    guard let feed else { return }
    let request = makeFilterRequest(
      filters: PhotoFilterStore.shared.filters,
      options: PhotoFilterEngine.buildOptions(feed.photos)
    )
    let model = PhotoFilterViewModel(request: request)
    let host = UIHostingController(rootView: PhotoFilterSheetView(model: model))
    host.navigationItem.title = String(localized: "Search & Filter")
    host.navigationItem.leftBarButtonItem = UIBarButtonItem(
      title: String(localized: "Cancel"),
      primaryAction: UIAction { [weak host] _ in host?.dismiss(animated: true) }
    )
    host.navigationItem.rightBarButtonItem = UIBarButtonItem(
      title: String(localized: "Done"),
      primaryAction: UIAction { [weak host, weak model] _ in
        guard let model else { return }
        PhotoFilterStore.shared.replace(Self.filters(from: model.makeRecord()))
        host?.dismiss(animated: true)
      }
    )
    let navigation = UINavigationController(rootViewController: host)
    configureSheet(navigation, anchor: anchor, size: CGSize(width: 430, height: 620))
    (presenter ?? self).present(navigation, animated: true)
  }

  private func removeQueryConstraint(_ constraint: PhotoQueryConstraint) {
    var filters = PhotoFilterStore.shared.filters
    switch constraint {
    case .query:
      filters.query = ""
    case .tag(let tag):
      filters.tags.removeAll { $0 == tag }
    case .date:
      filters.datePreset = nil
      filters.dateFrom = nil
      filters.dateTo = nil
    case .camera(let camera):
      filters.cameras.removeAll { $0 == camera }
    case .lens(let lens):
      filters.lenses.removeAll { $0 == lens }
    case .rating:
      filters.minRating = nil
    }
    PhotoFilterStore.shared.replace(filters)
  }

  private func presentProfile(anchor: UIView) {
    guard let session else { return }
    let profile = makeProfile(
      session: session,
      workspace: session.activeWorkspace,
      photos: feed?.photos ?? []
    )
    let host = UIHostingController(
      rootView: ProfileSheetView(
        profile: profile,
        onAccountSettings: { [weak self] in
          self?.dismiss(animated: true) {
            self?.onRequestAccountSettings()
          }
        },
        onDeleteAccount: { [weak self] in
          self?.dismiss(animated: true) {
            self?.onRequestAccountDeletion()
          }
        },
        onSignOut: { [weak self] in
          self?.dismiss(animated: true) {
            self?.onRequestSignOut()
          }
        }
      )
    )
    configureSheet(host, anchor: anchor, size: CGSize(width: 390, height: 620))
    present(host, animated: true)
  }

  private func performContextAction(_ action: String, photoId: String) {
    guard let photo = displayedPhotos.first(where: { $0.id == photoId }) else { return }
    if action == "share", let url = URL(string: photo.originalUrl) {
      let controller = UIActivityViewController(activityItems: [url], applicationActivities: nil)
      controller.popoverPresentationController?.sourceView = masonryView
      controller.popoverPresentationController?.sourceRect = masonryView.bounds
      present(controller, animated: true)
      return
    }
    guard action == "info" else { return }
    let model = PhotoInfoModel.build(
      photo: photo,
      localeIdentifier: PhotoDateLanguage.activeLocaleIdentifier
    )
    let host = UIHostingController(rootView: PhotoInfoSectionsList(info: model))
    host.navigationItem.title = String(localized: "Info")
    host.navigationItem.rightBarButtonItem = UIBarButtonItem(
      title: String(localized: "Done"),
      primaryAction: UIAction { [weak host] _ in host?.dismiss(animated: true) }
    )
    let navigation = UINavigationController(rootViewController: host)
    configureSheet(navigation, anchor: nil, size: CGSize(width: 520, height: 680))
    present(navigation, animated: true)
  }

  private func makeFilterRequest(
    filters: PhotoFilters,
    options: PhotoFilterOptions
  ) -> PhotoFilterSheetRequest {
    var request = PhotoFilterSheetRequest()
    request.filters = Self.record(from: filters)
    var optionRecord = PhotoFilterOptionsRecord()
    optionRecord.tags = options.tags.map(Self.record)
    optionRecord.cameras = options.cameras.map(Self.record)
    optionRecord.lenses = options.lenses.map(Self.record)
    optionRecord.ratedCount = options.ratedCount
    request.options = optionRecord
    return request
  }

  private func makeQueryHeaderModel(
    filters: PhotoFilters,
    photos: [GalleryPhoto]
  ) -> PhotoQueryHeaderModel {
    var chips: [PhotoQueryHeaderChip] = []
    let query = filters.query.trimmingCharacters(in: .whitespacesAndNewlines)
    if !query.isEmpty {
      chips.append(
        PhotoQueryHeaderChip(id: "query", title: "“\(query)”", constraint: .query)
      )
    }
    chips.append(contentsOf: filters.tags.map {
      PhotoQueryHeaderChip(id: "tag-\($0)", title: $0, constraint: .tag($0))
    })
    chips.append(contentsOf: filters.cameras.map {
      PhotoQueryHeaderChip(id: "camera-\($0)", title: $0, constraint: .camera($0))
    })
    chips.append(contentsOf: filters.lenses.map {
      PhotoQueryHeaderChip(id: "lens-\($0)", title: $0, constraint: .lens($0))
    })
    if let minRating = filters.minRating {
      chips.append(
        PhotoQueryHeaderChip(id: "rating", title: "≥\(minRating)★", constraint: .rating)
      )
    }
    if filters.dateFrom != nil || filters.dateTo != nil {
      chips.append(
        PhotoQueryHeaderChip(
          id: "date",
          title: filters.datePreset?.label ?? String(localized: "Dates"),
          constraint: .date
        )
      )
    }

    return PhotoQueryHeaderModel(
      resultText: String(localized: "\(photos.count) matching photos"),
      headline: PhotoFilterEngine.summarize(filters),
      editTitle: String(localized: "Edit"),
      editAccessibilityLabel: String(localized: "Edit search and filters"),
      clearTitle: String(localized: "Clear"),
      clearAccessibilityLabel: String(localized: "Clear search and filters"),
      photos: photos.prefix(12).map {
        PhotoQueryHeaderPhoto(id: $0.id, url: $0.thumbnailUrl, thumbHash: $0.thumbHash)
      },
      chips: chips
    )
  }

  private func makeProfile(
    session: AfilmorySession,
    workspace: AfilmorySessionWorkspace?,
    photos: [GalleryPhoto]
  ) -> ProfileSheetRecord {
    let stats = ProfileStats.collect(photos)
    var statsParts = [String(localized: "\(stats.photoCount) photos")]
    if stats.cameraCount > 0 {
      statsParts.append(String(localized: "\(stats.cameraCount) cameras"))
    }
    if stats.lensCount > 0 {
      statsParts.append(String(localized: "\(stats.lensCount) lenses"))
    }
    if let yearSpan = stats.yearSpan { statsParts.append(yearSpan) }
    var profile = ProfileSheetRecord()
    profile.userName = session.user.name
    profile.avatarUrl = session.user.image ?? ""
    profile.avatarInitial = session.user.name.first.map { String($0).uppercased() } ?? "?"
    profile.tenantLine = workspace.map { "\($0.name) · \($0.slug)" } ?? session.user.email
    profile.webUrl = workspace.flatMap {
      try? ApiEnvironmentStore.shared.galleryOrigin(slug: $0.slug).absoluteString
    } ?? ""
    profile.statsLine = photos.isEmpty ? "" : statsParts.joined(separator: " · ")
    profile.strip = photos.prefix(12).map { photo in
      var item = ProfileStripItemRecord()
      item.url = photo.thumbnailUrl
      item.thumbHash = photo.thumbHash
      item.aspectRatio = photo.aspectRatio
      return item
    }
    return profile
  }

  private func configureSheet(
    _ controller: UIViewController,
    anchor: UIView?,
    size: CGSize
  ) {
    controller.preferredContentSize = size
    if UIDevice.current.userInterfaceIdiom == .pad, let anchor {
      controller.modalPresentationStyle = .popover
      controller.popoverPresentationController?.sourceView = anchor
      controller.popoverPresentationController?.sourceRect = anchor.bounds
    } else {
      controller.modalPresentationStyle = .pageSheet
      controller.sheetPresentationController?.detents = [.medium(), .large()]
      controller.sheetPresentationController?.prefersGrabberVisible = true
    }
  }

  private func showEmptyState(_ content: PageEmptyStateContent) {
    contentUnavailableConfiguration = nil
    emptyStateView.apply(content)
    emptyStateView.isHidden = false
  }

  private func clearUnavailableState() {
    contentUnavailableConfiguration = nil
    emptyStateView.isHidden = true
  }

  private func showLoading() {
    emptyStateView.isHidden = true
    contentUnavailableConfiguration = UIContentUnavailableConfiguration.loading()
  }

  private func showSignedOut() {
    showEmptyState(
      PageEmptyStateContent(
        symbolName: "photo.on.rectangle",
        title: String(localized: "Your gallery"),
        subtitle: String(localized: "Sign in with your workspace to see your own photos here."),
        primaryAction: PageEmptyStateAction(title: String(localized: "Sign in")) { [weak self] in
          self?.onRequestSignIn()
        }
      )
    )
  }

  private func showPending() {
    showEmptyState(
      PageEmptyStateContent(
        symbolName: "clock",
        title: String(localized: "Set up your workspace"),
        subtitle: String(localized: "Create a workspace to publish and manage your gallery, or open account settings."),
        primaryAction: PageEmptyStateAction(title: String(localized: "Create workspace")) { [weak self] in
          self?.onRequestWorkspaceSetup()
        },
        secondaryAction: PageEmptyStateAction(title: String(localized: "Account settings")) { [weak self] in
          self?.onRequestAccountSettings()
        }
      )
    )
  }

  private func showFeedError() {
    showEmptyState(
      PageEmptyStateContent(
        symbolName: "exclamationmark.triangle",
        title: String(localized: "Failed to load photos"),
        subtitle: String(localized: "Check your connection and try again."),
        primaryAction: PageEmptyStateAction(title: String(localized: "Retry")) { [weak self] in
          guard let slug = self?.gallerySlug else { return }
          PhotoFeedStore.shared.load(.manifest(slug), force: true)
        }
      )
    )
  }

  private func showEmpty() {
    emptyStateView.isHidden = true
    var configuration = UIContentUnavailableConfiguration.empty()
    configuration.image = UIImage(systemName: "photo.on.rectangle.angled")
    configuration.text = String(localized: "No photos yet")
    configuration.secondaryText = String(localized: "Upload photos from the web dashboard and they will appear here.")
    contentUnavailableConfiguration = configuration
  }

  private func showFilteredEmpty() {
    showEmptyState(
      PageEmptyStateContent(
        symbolName: "magnifyingglass",
        title: String(localized: "No photos match this search and filters"),
        subtitle: nil,
        primaryAction: PageEmptyStateAction(title: String(localized: "Clear search and filters")) {
          PhotoFilterStore.shared.clear()
        }
      )
    )
  }

  private func preferredItemWidth() -> CGFloat {
    let value = UserDefaults.standard.double(forKey: Self.preferredItemWidthKey)
    return value >= 92 && value <= 640 ? value : 190
  }

  private static func record(from filters: PhotoFilters) -> PhotoFiltersRecord {
    var record = PhotoFiltersRecord()
    record.query = filters.query
    record.tags = filters.tags
    record.tagMode = filters.tagMode.rawValue
    record.datePreset = filters.datePreset?.rawValue
    record.dateFrom = filters.dateFrom
    record.dateTo = filters.dateTo
    record.cameras = filters.cameras
    record.lenses = filters.lenses
    record.minRating = filters.minRating
    return record
  }

  private static func record(_ option: PhotoFilterOption) -> PhotoFilterOptionRecord {
    var record = PhotoFilterOptionRecord()
    record.value = option.value
    record.count = option.count
    return record
  }

  private static func filters(from record: PhotoFiltersRecord) -> PhotoFilters {
    PhotoFilters(
      query: record.query,
      tags: record.tags,
      tagMode: TagMode(rawValue: record.tagMode) ?? .any,
      datePreset: record.datePreset.flatMap(DatePreset.init(rawValue:)),
      dateFrom: record.dateFrom,
      dateTo: record.dateTo,
      cameras: record.cameras,
      lenses: record.lenses,
      minRating: record.minRating
    )
  }
}
