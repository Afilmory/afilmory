import ExpoModulesCore
import SwiftUI
import UIKit

final class PhotosHomeController: UIViewController {
  private static let preferredItemWidthKey = "afilmory.home.preferredItemWidth"

  private let appContext: AppContext?
  private let localization = Localization.shared
  private let onRequestSignIn: () -> Void
  private let onRequestSignOut: () -> Void
  private let onRequestWorkspaceSetup: () -> Void
  private let onRequestAccountSettings: () -> Void
  private let onRequestAccountDeletion: () -> Void
  private let masonryView: PhotoMasonryView
  private let sidebarModel = PhotoSidebarModel()
  private weak var sidebarController: UITabBarController?
  private var sidebarBottomView: UIView?
  private var sessionObservation: AfilmorySessionObservationToken?
  private var feedObservation: PhotoFeedObservationToken?
  private var filterObservation: PhotoFeedObservationToken?
  private var feed: PhotoFeed?
  private var gallerySlug: String?
  private var session: AfilmorySession?
  private var visibleRange: (Int, Int)?
  private var displayedPhotos: [GalleryPhoto] = []

  init(
    appContext: AppContext?,
    onRequestSignIn: @escaping () -> Void,
    onRequestSignOut: @escaping () -> Void,
    onRequestWorkspaceSetup: @escaping () -> Void,
    onRequestAccountSettings: @escaping () -> Void,
    onRequestAccountDeletion: @escaping () -> Void
  ) {
    self.appContext = appContext
    self.onRequestSignIn = onRequestSignIn
    self.onRequestSignOut = onRequestSignOut
    self.onRequestWorkspaceSetup = onRequestWorkspaceSetup
    self.onRequestAccountSettings = onRequestAccountSettings
    self.onRequestAccountDeletion = onRequestAccountDeletion
    masonryView = PhotoMasonryView(appContext: appContext)
    super.init(nibName: nil, bundle: nil)
    configureMasonry()
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) is not supported")
  }

  deinit {
    removeSidebar()
  }

  override func loadView() {
    view = masonryView
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .systemBackground
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

  override func viewDidAppear(_ animated: Bool) {
    super.viewDidAppear(animated)
    updateSidebar()
  }

  private func configureMasonry() {
    masonryView.chromeVisible = true
    masonryView.contextMenuInfoTitle = localization.value("photo.info")
    masonryView.contextMenuShareTitle = localization.value("photo.share")
    masonryView.extraBottomInset = 24
    masonryView.extraTopInset = 60
    masonryView.gap = 4
    masonryView.livePhotoAccessibilityLabel = localization.value("photo.livePhoto")
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
      PhotoFilterStore.shared.clear()
      masonryView.setPhotos([])
      removeSidebar()
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
        masonryView.setPhotos([])
        removeSidebar()
        showPending()
        return
      }
      if gallerySlug != workspace.slug {
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
    masonryView.setPhotos(displayedPhotos.map { MasonryPhoto(photo: $0, localization: localization) })
    if displayedPhotos.isEmpty {
      showFilteredEmpty()
    } else {
      contentUnavailableConfiguration = nil
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
        localeIdentifier: localization.language.localeIdentifier
      )
    } ?? ""
    let city = visibleRange.flatMap {
      PhotoFilterEngine.cityForRange(displayedPhotos, startIndex: $0.0, endIndex: $0.1)
    } ?? ""
    masonryView.chromeIdentityLabel = session?.activeWorkspace?.name ?? ""
    masonryView.chromeDateLabel = filtersActive
      ? "\(displayedPhotos.count) · \(PhotoFilterEngine.summarize(filters, localization: localization))"
      : dateLabel
    masonryView.chromeDateDetail = filtersActive ? "" : city
    masonryView.chromeDateInteractive = filtersActive
    masonryView.chromeDateVisible = !displayedPhotos.isEmpty
      && (!masonryView.chromeDateLabel.isEmpty || !masonryView.chromeIdentityLabel.isEmpty)
    masonryView.filterActive = filtersActive
    masonryView.filterCount = activeCount
    masonryView.filterAccessibilityLabel = filtersActive
      ? localization.value("accessibility.filtersActive", count: activeCount)
      : localization.value("accessibility.filters")
    masonryView.profileImageURL = session?.user.image ?? ""
    masonryView.profileInitial = session?.user.name.first.map { String($0).uppercased() } ?? "?"
    masonryView.profileAccessibilityLabel = session.map {
      localization.value("accessibility.profile", arguments: ["name": $0.user.name])
    } ?? localization.value("accessibility.profileUnknown")
    if feed.loadState != .loading {
      masonryView.setRefreshing(false)
    }
    updateSidebar()
  }

  private func presentPhoto(at index: Int) {
    guard displayedPhotos.indices.contains(index) else { return }
    let controller = PhotoDetailViewController(
      photos: displayedPhotos,
      initialIndex: index,
      gallerySlug: gallerySlug,
      appContext: appContext,
      localization: localization,
      onRequestSignIn: onRequestSignIn,
      sourceProvider: { [weak masonryView] photoId in
        masonryView?.visibleTransitionSourceView(for: photoId)
      }
    )
    present(controller, animated: true)
  }

  private func presentFilters(
    anchor: UIView,
    presenter: UIViewController? = nil,
    revealAfterChange: Bool = false
  ) {
    guard let feed else { return }
    let request = makeFilterRequest(
      filters: PhotoFilterStore.shared.filters,
      options: PhotoFilterEngine.buildOptions(feed.photos)
    )
    let model = PhotoFilterViewModel(request: request)
    let host = UIHostingController(rootView: PhotoFilterSheetView(model: model))
    host.navigationItem.title = request.localization.title
    host.navigationItem.leftBarButtonItem = UIBarButtonItem(
      title: request.localization.cancel,
      primaryAction: UIAction { [weak host] _ in host?.dismiss(animated: true) }
    )
    host.navigationItem.rightBarButtonItem = UIBarButtonItem(
      title: request.localization.done,
      primaryAction: UIAction { [weak host, weak model] _ in
        guard let model else { return }
        PhotoFilterStore.shared.replace(Self.filters(from: model.makeRecord()))
        if revealAfterChange {
          self.revealFilteredGallery()
        }
        host?.dismiss(animated: true)
      }
    )
    let navigation = UINavigationController(rootViewController: host)
    configureSheet(navigation, anchor: anchor, size: CGSize(width: 430, height: 620))
    (presenter ?? self).present(navigation, animated: true)
  }

  private func updateSidebar() {
    guard UIDevice.current.userInterfaceIdiom == .pad, let feed else { return }
    guard let controller = tabBarController else { return }
    if sidebarController !== controller {
      removeSidebar()
      sidebarController = controller
    }
    controller.sidebar.preferredLayout = .tile

    let filters = PhotoFilterStore.shared.filters
    let options = PhotoFilterEngine.buildOptions(feed.photos)
    let quickFilters = PhotoSidebarSectionModel.quickFilters(
      photos: feed.photos,
      filters: filters,
      labels: PhotoSidebarQuickFilterLabels(
        rating4: localization.value("filter.ratingOrBetter", count: 4),
        thisMonth: localization.value("action.date.preset.thisMonth"),
        thisYear: localization.value("action.date.preset.thisYear")
      )
    )
    let tags = PhotoSidebarSectionModel.tags(
      options: options.tags,
      selectedTags: filters.tags
    )
    sidebarModel.update(
      sidebarRequest(
        filters: filters,
        quickFilters: quickFilters,
        tags: tags
      )
    )

    let footer = UIHostingConfiguration {
      PhotoSidebarFooterView(
        model: sidebarModel,
        onFiltersPress: { [weak self] in self?.presentSidebarFilters() },
        onQuickFilterPress: { [weak self] id in self?.toggleSidebarQuickFilter(id) },
        onTagPress: { [weak self] tag in self?.toggleSidebarTag(tag) }
      )
    }
    .margins(.all, 0)
    .background(Color.clear)
    controller.sidebar.footerContentConfiguration = footer

    let bottom = UIHostingConfiguration {
      PhotoSidebarBottomBarView(
        model: sidebarModel,
        onClearFilters: { [weak self] in
          PhotoFilterStore.shared.clear()
          self?.revealFilteredGallery()
        },
        onFiltersPress: { [weak self] in self?.presentSidebarFilters() }
      )
    }
    .margins(.all, 0)
    .background(Color.clear)
    let bottomView = bottom.makeContentView()
    bottomView.backgroundColor = .clear
    controller.sidebar.bottomBarView = bottomView
    sidebarBottomView = bottomView
  }

  private func removeSidebar() {
    guard let sidebarController else {
      sidebarBottomView = nil
      return
    }
    sidebarController.sidebar.footerContentConfiguration = nil
    if sidebarController.sidebar.bottomBarView === sidebarBottomView {
      sidebarController.sidebar.bottomBarView = nil
    }
    sidebarBottomView = nil
    self.sidebarController = nil
  }

  private func sidebarRequest(
    filters: PhotoFilters,
    quickFilters: [PhotoSidebarItem],
    tags: PhotoSidebarTagItems
  ) -> PhotoSidebarRequest {
    let request = PhotoSidebarRequest()
    request.activeFilterCount = PhotoFilterEngine.countActiveDimensions(filters)
    request.ownerID = "native-photos"
    request.quickFilters = quickFilters.map(Self.sidebarRecord)
    request.showsMoreTags = tags.hasMore
    request.tags = tags.items.map(Self.sidebarRecord)
    let copy = PhotoSidebarLocalizationRecord()
    copy.clearFilters = localization.value("common.clearFilters")
    copy.filters = localization.value("action.filter.title")
    copy.moreTags = localization.value("sidebar.moreTags")
    copy.notSelected = localization.value("filter.notSelected")
    copy.quickFilters = localization.value("sidebar.quickFilters")
    copy.selected = localization.value("filter.selected")
    copy.tags = localization.value("exif.tags")
    request.localization = copy
    return request
  }

  private static func sidebarRecord(_ item: PhotoSidebarItem) -> PhotoSidebarItemRecord {
    let record = PhotoSidebarItemRecord()
    record.id = item.id
    record.label = item.label
    record.count = item.count
    record.selected = item.selected
    return record
  }

  private func toggleSidebarQuickFilter(_ id: String) {
    var filters = PhotoFilterStore.shared.filters
    switch PhotoSidebarQuickFilterID(rawValue: id) {
    case .thisMonth:
      if filters.datePreset == .thisMonth {
        filters.datePreset = nil
        filters.dateFrom = nil
        filters.dateTo = nil
      } else {
        filters.datePreset = .thisMonth
      }
    case .thisYear:
      if filters.datePreset == .thisYear {
        filters.datePreset = nil
        filters.dateFrom = nil
        filters.dateTo = nil
      } else {
        filters.datePreset = .thisYear
      }
    case .rating4:
      filters.minRating = filters.minRating == 4 ? nil : 4
    case nil:
      return
    }
    PhotoFilterStore.shared.replace(filters)
    revealFilteredGallery()
  }

  private func toggleSidebarTag(_ tag: String) {
    var filters = PhotoFilterStore.shared.filters
    if let index = filters.tags.firstIndex(of: tag) {
      filters.tags.remove(at: index)
    } else {
      filters.tags.append(tag)
    }
    PhotoFilterStore.shared.replace(filters)
    revealFilteredGallery()
  }

  private func presentSidebarFilters() {
    guard let anchor = sidebarBottomView else { return }
    let selectedIndex = sidebarController?.selectedIndex ?? 0
    if selectedIndex > 1 {
      sidebarController?.selectedIndex = 0
    }
    DispatchQueue.main.async { [weak self, weak anchor] in
      guard let self, let anchor else { return }
      let presenter = appContext?.utilities?.currentViewController()
      presentFilters(
        anchor: anchor,
        presenter: presenter,
        revealAfterChange: true
      )
    }
  }

  private func revealFilteredGallery() {
    guard let sidebarController, sidebarController.selectedIndex > 1 else { return }
    sidebarController.selectedIndex = 0
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
    guard action == "info", let appContext else { return }
    let model = PhotoInfoModel.build(
      photo: photo,
      localization: localization,
      localeIdentifier: localization.language.localeIdentifier
    )
    guard let info = PhotoInfoSheetRecord.decode(
      json: model.detailJSON(localization: localization),
      appContext: appContext
    ) else { return }
    let host = UIHostingController(rootView: PhotoInfoSectionsList(info: info))
    host.navigationItem.title = info.localization.title
    host.navigationItem.rightBarButtonItem = UIBarButtonItem(
      title: info.localization.done,
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
    let request = PhotoFilterSheetRequest()
    request.filters = Self.record(from: filters)
    let optionRecord = PhotoFilterOptionsRecord()
    optionRecord.tags = options.tags.map(Self.record)
    optionRecord.cameras = options.cameras.map(Self.record)
    optionRecord.lenses = options.lenses.map(Self.record)
    optionRecord.ratedCount = options.ratedCount
    request.options = optionRecord
    let copy = PhotoFilterLocalizationRecord()
    copy.all = localization.value("filter.all")
    copy.any = localization.value("filter.any")
    copy.anyDate = localization.value("filter.anyDate")
    copy.anyRating = localization.value("filter.anyRating")
    copy.camera = localization.value("exif.camera")
    copy.cancel = localization.value("common.cancel")
    copy.customRange = localization.value("filter.customRange")
    copy.date = localization.value("action.date.label")
    copy.datePresets = DatePreset.allCases.map { preset in
      let record = PhotoFilterDatePresetRecord()
      record.value = preset.rawValue
      record.label = localization.value(Self.datePresetKey(preset))
      return record
    }
    copy.done = localization.value("common.done")
    copy.from = localization.value("action.date.from")
    copy.lens = localization.value("exif.lens")
    copy.match = localization.value("filter.match")
    copy.minimumRating = localization.value("filter.minimumRating")
    copy.notSelected = localization.value("filter.notSelected")
    copy.range = localization.value("filter.range")
    copy.rating = localization.value("exif.rating")
    copy.ratingOptions = (1...5).map {
      localization.value("filter.ratingOrBetter", count: $0)
    }
    copy.reset = localization.value("filter.reset")
    copy.selected = localization.value("filter.selected")
    copy.tags = localization.value("exif.tags")
    copy.title = localization.value("action.filter.title")
    copy.to = localization.value("action.date.to")
    request.localization = copy
    return request
  }

  private func makeProfile(
    session: AfilmorySession,
    workspace: AfilmorySessionWorkspace?,
    photos: [GalleryPhoto]
  ) -> ProfileSheetRecord {
    let stats = ProfileStats.collect(photos)
    var statsParts = [localization.value("profile.stats.photos", count: stats.photoCount)]
    if stats.cameraCount > 0 {
      statsParts.append(localization.value("profile.stats.cameras", count: stats.cameraCount))
    }
    if stats.lensCount > 0 {
      statsParts.append(localization.value("profile.stats.lenses", count: stats.lensCount))
    }
    if let yearSpan = stats.yearSpan { statsParts.append(yearSpan) }
    let profile = ProfileSheetRecord()
    profile.userName = session.user.name
    profile.avatarUrl = session.user.image ?? ""
    profile.avatarInitial = session.user.name.first.map { String($0).uppercased() } ?? "?"
    profile.tenantLine = workspace.map { "\($0.name) · \($0.slug)" } ?? session.user.email
    profile.webUrl = workspace.flatMap {
      try? ApiEnvironmentStore.shared.galleryOrigin(slug: $0.slug).absoluteString
    } ?? ""
    profile.statsLine = photos.isEmpty ? "" : statsParts.joined(separator: " · ")
    profile.strip = photos.prefix(12).map { photo in
      let item = ProfileStripItemRecord()
      item.url = photo.thumbnailUrl
      item.thumbHash = photo.thumbHash
      item.aspectRatio = photo.aspectRatio
      return item
    }
    let copy = ProfileLocalizationRecord()
    copy.cacheCleared = localization.value("profile.cacheCleared")
    copy.accountSettings = localization.value("profile.accountSettings")
    copy.cancel = localization.value("common.cancel")
    copy.clearCache = localization.value("profile.clearCache")
    copy.done = localization.value("common.done")
    copy.openWeb = localization.value("common.openGalleryWeb")
    copy.signOut = localization.value("common.signOut")
    copy.signOutConfirmTitle = localization.value("profile.signOutConfirmTitle")
    copy.deleteAccount = localization.value("account.deletion.action")
    copy.sponsorDescription = localization.value("profile.sponsor.description")
    copy.sponsorFailedMessage = localization.value("profile.sponsor.failedMessage")
    copy.sponsorFailedTitle = localization.value("profile.sponsor.failedTitle")
    copy.sponsorPending = localization.value("profile.sponsor.pending")
    copy.sponsorThanks = localization.value("profile.sponsor.thanks")
    copy.sponsorTitle = localization.value("profile.sponsor.title")
    copy.sponsorUnavailable = localization.value("profile.sponsor.unavailable")
    profile.localization = copy
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

  private func showLoading() {
    contentUnavailableConfiguration = UIContentUnavailableConfiguration.loading()
  }

  private func showSignedOut() {
    var configuration = UIContentUnavailableConfiguration.empty()
    configuration.image = UIImage(systemName: "photo.on.rectangle")
    configuration.text = localization.value("gallery.yours.title")
    configuration.secondaryText = localization.value("gallery.yours.subtitle")
    configuration.button = .filled()
    configuration.button.title = localization.value("common.signIn")
    configuration.buttonProperties.primaryAction = UIAction { [weak self] _ in self?.onRequestSignIn() }
    contentUnavailableConfiguration = configuration
  }

  private func showPending() {
    var configuration = UIContentUnavailableConfiguration.empty()
    configuration.image = UIImage(systemName: "clock")
    configuration.text = localization.value("gallery.workspace.pending.title")
    configuration.secondaryText = localization.value("gallery.workspace.pending.subtitle")
    configuration.button = .filled()
    configuration.button.title = localization.value("workspace.setup.submit")
    configuration.buttonProperties.primaryAction = UIAction { [weak self] _ in
      self?.onRequestWorkspaceSetup()
    }
    configuration.secondaryButton = .plain()
    configuration.secondaryButton.title = localization.value("account.settings.title")
    configuration.secondaryButtonProperties.primaryAction = UIAction { [weak self] _ in
      self?.onRequestAccountSettings()
    }
    contentUnavailableConfiguration = configuration
  }

  private func showFeedError() {
    var configuration = UIContentUnavailableConfiguration.empty()
    configuration.image = UIImage(systemName: "exclamationmark.triangle")
    configuration.text = localization.value("gallery.failed.photos")
    configuration.secondaryText = localization.value("gallery.failed.detail")
    configuration.button = .filled()
    configuration.button.title = localization.value("common.retry")
    configuration.buttonProperties.primaryAction = UIAction { [weak self] _ in
      guard let slug = self?.gallerySlug else { return }
      PhotoFeedStore.shared.load(.manifest(slug), force: true)
    }
    contentUnavailableConfiguration = configuration
  }

  private func showEmpty() {
    var configuration = UIContentUnavailableConfiguration.empty()
    configuration.image = UIImage(systemName: "photo.on.rectangle.angled")
    configuration.text = localization.value("gallery.empty.title")
    configuration.secondaryText = localization.value("gallery.empty.subtitle")
    contentUnavailableConfiguration = configuration
  }

  private func showFilteredEmpty() {
    var configuration = UIContentUnavailableConfiguration.search()
    configuration.text = localization.value("gallery.empty.filtered")
    configuration.button = .filled()
    configuration.button.title = localization.value("common.clearFilters")
    configuration.buttonProperties.primaryAction = UIAction { _ in PhotoFilterStore.shared.clear() }
    contentUnavailableConfiguration = configuration
  }

  private func preferredItemWidth() -> CGFloat {
    let value = UserDefaults.standard.double(forKey: Self.preferredItemWidthKey)
    return value >= 92 && value <= 640 ? value : 190
  }

  private static func record(from filters: PhotoFilters) -> PhotoFiltersRecord {
    let record = PhotoFiltersRecord()
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
    let record = PhotoFilterOptionRecord()
    record.value = option.value
    record.count = option.count
    return record
  }

  private static func filters(from record: PhotoFiltersRecord) -> PhotoFilters {
    PhotoFilters(
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

  private static func datePresetKey(_ preset: DatePreset) -> String {
    switch preset {
    case .last7: "action.date.preset.last7"
    case .last30: "action.date.preset.last30"
    case .last90: "action.date.preset.last90"
    case .thisMonth: "action.date.preset.thisMonth"
    case .thisYear: "action.date.preset.thisYear"
    case .lastYear: "action.date.preset.lastYear"
    }
  }
}
