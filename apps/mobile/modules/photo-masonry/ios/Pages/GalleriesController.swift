import SDWebImage
import UIKit

struct FeaturedGalleryAuthor: Codable, Hashable, Sendable {
  let name: String
  let avatar: String?
}

struct FeaturedGallery: Codable, Hashable, Sendable {
  let id: String
  let name: String
  let slug: String
  let domain: String?
  let description: String?
  let author: FeaturedGalleryAuthor?
  let photoCount: Int
  var isSubscribed: Bool
  var isOwnGallery: Bool
  let tags: [String]
  let createdAt: String
  let lastUpload: String?
}

struct GalleryCoverPhoto: Hashable, Sendable {
  let id: String
  let thumbnailUrl: String
  let thumbHash: String?
  let aspectRatio: Double
  let isLivePhoto: Bool
}

struct FeaturedGalleriesEnvelope: Codable, Sendable {
  let galleries: [FeaturedGallery]
}

private struct GalleryCoverSearchRequest: Encodable {
  let limit: Int
  let sort: String
}

func resolvedGalleryTopOffsetAfterHeaderTransition(
  previousHeaderHeight: CGFloat,
  nextHeaderHeight: CGFloat,
  contentOffsetY: CGFloat,
  adjustedTopInset: CGFloat
) -> CGFloat? {
  guard abs(previousHeaderHeight - nextHeaderHeight) >= 0.5 else { return nil }
  let topOffsetY = -adjustedTopInset
  if nextHeaderHeight > previousHeaderHeight {
    return topOffsetY
  }
  guard contentOffsetY <= topOffsetY + 1 else { return nil }
  return topOffsetY
}

final class GalleriesController: UIViewController {
  private let onRequestSignIn: () -> Void
  private let notificationPermissions = GalleryNotificationPermissionCoordinator()
  private let galleryDirectoryStore = GalleryDirectoryStore()
  private let layout = UICollectionViewFlowLayout()
  private lazy var collectionView = UICollectionView(frame: .zero, collectionViewLayout: layout)
  private let refreshControl = UIRefreshControl()
  private let searchController = UISearchController(searchResultsController: nil)
  private var galleries: [FeaturedGallery] = []
  private var coverCache: [String: [GalleryCoverPhoto]] = [:]
  private var coverTasks: [String: Task<Void, Never>] = [:]
  private var subscriptionTasks: [String: Task<Void, Never>] = [:]
  private var pendingSubscriptionTargets: [String: Bool] = [:]
  private var notificationPermissionState: GalleryNotificationPermissionState = .unknown
  private var didOfferNotificationPermissionThisSession = false
  private var sessionObservation: AfilmorySessionObservationToken?
  private var sessionUserID: String?
  private var notificationPermissionTask: Task<Void, Never>?
  private var loadTask: Task<Void, Never>?
  private var searchDebounceTask: Task<Void, Never>?
  private var activeQuery = ""
  private var previousLayoutWidth: CGFloat = 0
  private var lastGalleryRouteRequestID: String?

  init(onRequestSignIn: @escaping () -> Void) {
    self.onRequestSignIn = onRequestSignIn
    super.init(nibName: nil, bundle: nil)
    title = String(localized: "Explore")
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) is not supported")
  }

  func openGallery(_ route: GalleryRouteRequest) {
    guard lastGalleryRouteRequestID != route.requestId else { return }
    lastGalleryRouteRequestID = route.requestId
    navigationController?.pushViewController(
      GalleryDetailController(
        slug: route.slug,
        title: route.title,
        onRequestSignIn: onRequestSignIn
      ),
      animated: viewIfLoaded?.window != nil
    )
  }

  deinit {
    loadTask?.cancel()
    searchDebounceTask?.cancel()
    notificationPermissionTask?.cancel()
    coverTasks.values.forEach { $0.cancel() }
    subscriptionTasks.values.forEach { $0.cancel() }
    NotificationCenter.default.removeObserver(self)
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .systemGroupedBackground
    collectionView.backgroundColor = .systemGroupedBackground
    collectionView.alwaysBounceVertical = true
    collectionView.contentInsetAdjustmentBehavior = .automatic
    collectionView.showsVerticalScrollIndicator = false
    collectionView.dataSource = self
    collectionView.delegate = self
    collectionView.prefetchDataSource = self
    collectionView.register(
      GalleryCardCell.self,
      forCellWithReuseIdentifier: GalleryCardCell.reuseIdentifier
    )
    collectionView.register(
      GalleryNotificationBannerView.self,
      forSupplementaryViewOfKind: UICollectionView.elementKindSectionHeader,
      withReuseIdentifier: GalleryNotificationBannerView.reuseIdentifier
    )
    collectionView.register(
      GallerySearchSummaryView.self,
      forSupplementaryViewOfKind: UICollectionView.elementKindSectionHeader,
      withReuseIdentifier: GallerySearchSummaryView.reuseIdentifier
    )
    searchController.searchResultsUpdater = self
    searchController.obscuresBackgroundDuringPresentation = false
    searchController.searchBar.placeholder = String(localized: "Search galleries")
    searchController.searchBar.autocapitalizationType = .none
    searchController.searchBar.autocorrectionType = .no
    navigationItem.searchController = searchController
    navigationItem.hidesSearchBarWhenScrolling = false
    definesPresentationContext = true
    refreshControl.addTarget(self, action: #selector(refresh), for: .valueChanged)
    collectionView.refreshControl = refreshControl
    collectionView.frame = view.bounds
    collectionView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    view.addSubview(collectionView)
    sessionObservation = AfilmorySessionStore.shared.observe { [weak self] state in
      DispatchQueue.main.async {
        self?.handleSession(state)
      }
    }
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(applicationDidBecomeActive),
      name: UIApplication.didBecomeActiveNotification,
      object: nil
    )
    AfilmorySessionStore.shared.bootstrap()
    refreshNotificationPermissionState()
    loadGalleries()
  }

  override func viewWillAppear(_ animated: Bool) {
    super.viewWillAppear(animated)
    refreshNotificationPermissionState()
  }

  override func viewDidLayoutSubviews() {
    super.viewDidLayoutSubviews()
    let width = collectionView.bounds.width
    guard abs(width - previousLayoutWidth) >= 0.5 else { return }
    previousLayoutWidth = width
    configureLayout(width: width)
  }

  @objc private func refresh() {
    loadGalleries(force: true)
  }

  @objc private func applicationDidBecomeActive() {
    refreshNotificationPermissionState()
  }

  @objc private func requestSignIn() {
    onRequestSignIn()
  }

  private func loadGalleries(force: Bool = false) {
    if loadTask != nil, !force { return }
    loadTask?.cancel()
    let requestedQuery = activeQuery
    if requestedQuery.isEmpty, galleries.isEmpty, let cached = galleryDirectoryStore.loadCached() {
      applyGalleries(cached)
    }
    if galleries.isEmpty {
      contentUnavailableConfiguration = UIContentUnavailableConfiguration.loading()
    }
    loadTask = Task { @MainActor [weak self] in
      guard let self else { return }
      do {
        let fetched = try await galleryDirectoryStore.fetch(query: requestedQuery, limit: 30)
        try Task.checkCancellation()
        guard requestedQuery == activeQuery else { return }
        applyGalleries(fetched)
      } catch {
        guard !Task.isCancelled else { return }
        if galleries.isEmpty {
          contentUnavailableConfiguration = errorConfiguration()
        }
      }
      refreshControl.endRefreshing()
      loadTask = nil
    }
  }

  private func applyGalleries(_ fetched: [FeaturedGallery]) {
    galleries = fetched.map { gallery in
      guard let pendingTarget = pendingSubscriptionTargets[gallery.id] else {
        return gallery
      }
      var gallery = gallery
      gallery.isSubscribed = pendingTarget
      return gallery
    }
    refreshNotificationPresentation()
    contentUnavailableConfiguration = galleries.isEmpty ? emptyConfiguration() : nil
    prefetchVisibleCovers()
  }

  private func loadCovers(for gallery: FeaturedGallery) {
    guard coverCache[gallery.slug] == nil, coverTasks[gallery.slug] == nil else { return }
    coverTasks[gallery.slug] = Task { @MainActor [weak self] in
      guard let self else { return }
      defer { coverTasks[gallery.slug] = nil }
      do {
        let origin = try ApiEnvironmentStore.shared.galleryOrigin(slug: gallery.slug)
        let apiBase = try ApiEnvironmentStore.shared.galleryAPIBaseURL(slug: gallery.slug)
        let body = try APIEndpoint.jsonBody(GalleryCoverSearchRequest(limit: 3, sort: "desc"))
        let endpoint = APIEndpoint(
          baseURL: .explicit(apiBase.absoluteString),
          path: "manifest/photos/search",
          method: .post,
          body: body
        )
        let response: ManifestEnvelope = try await AfilmoryAPI.shared.request(endpoint)
        try Task.checkCancellation()
        let covers = response.data.compactMap { photo -> GalleryCoverPhoto? in
          guard let thumbnailUrl = photo.thumbnailUrl?.trimmingToNil else { return nil }
          let width = photo.width ?? 0
          let height = photo.height ?? 0
          let video = ManifestDecoding.normalizeVideo(photo.video, baseURL: origin)
          let isLivePhoto: Bool
          if case .livePhoto = video {
            isLivePhoto = true
          } else {
            isLivePhoto = false
          }
          return GalleryCoverPhoto(
            id: photo.id,
            thumbnailUrl: thumbnailUrl,
            thumbHash: photo.thumbHash,
            aspectRatio: photo.aspectRatio ?? (width > 0 && height > 0 ? width / height : 1),
            isLivePhoto: isLivePhoto
          )
        }
        coverCache[gallery.slug] = covers
        guard let index = galleries.firstIndex(where: { $0.id == gallery.id }) else { return }
        collectionView.reloadItems(at: [IndexPath(item: index, section: 0)])
      } catch {
        guard !Task.isCancelled else { return }
        coverCache[gallery.slug] = []
      }
    }
  }

  private func prefetchVisibleCovers() {
    for indexPath in collectionView.indexPathsForVisibleItems {
      guard galleries.indices.contains(indexPath.item) else { continue }
      loadCovers(for: galleries[indexPath.item])
    }
  }

  private func handleSession(_ state: AfilmorySessionState) {
    updateSignInAction(for: state)
    switch state {
    case .loading, .failed:
      return
    case .signedIn(let session):
      guard sessionUserID != session.user.id else { return }
      sessionUserID = session.user.id
      cancelSubscriptionMutations()
      if !galleries.isEmpty {
        loadGalleries(force: true)
      }
    case .signedOut:
      guard sessionUserID != nil || galleries.contains(where: { $0.isSubscribed || $0.isOwnGallery }) else {
        return
      }
      sessionUserID = nil
      cancelSubscriptionMutations()
      for index in galleries.indices {
        galleries[index].isSubscribed = false
        galleries[index].isOwnGallery = false
      }
      refreshNotificationPresentation()
    }
  }

  private func updateSignInAction(for state: AfilmorySessionState) {
    guard case .signedOut = state else {
      navigationItem.rightBarButtonItem = nil
      return
    }
    let item = UIBarButtonItem(
      title: String(localized: "Sign in"),
      style: .plain,
      target: self,
      action: #selector(requestSignIn)
    )
    item.accessibilityIdentifier = "explore.signIn"
    navigationItem.rightBarButtonItem = item
  }

  private func cancelSubscriptionMutations() {
    subscriptionTasks.values.forEach { $0.cancel() }
    subscriptionTasks.removeAll()
    pendingSubscriptionTargets.removeAll()
  }

  private func toggleSubscription(galleryID: String) {
    guard let index = galleries.firstIndex(where: { $0.id == galleryID }),
          !galleries[index].isOwnGallery,
          pendingSubscriptionTargets[galleryID] == nil
    else { return }

    guard case .signedIn(let session) = AfilmorySessionStore.shared.current().state else {
      onRequestSignIn()
      return
    }

    let previousValue = galleries[index].isSubscribed
    let targetValue = !previousValue
    galleries[index].isSubscribed = targetValue
    pendingSubscriptionTargets[galleryID] = targetValue
    refreshNotificationPresentation()

    let task = Task { @MainActor [weak self] in
      guard let self else { return }
      defer {
        pendingSubscriptionTargets[galleryID] = nil
        subscriptionTasks[galleryID] = nil
        refreshNotificationPresentation()
      }

      do {
        let endpoint = targetValue
          ? GallerySubscriptionAPI.subscribe(tenantId: galleryID)
          : GallerySubscriptionAPI.unsubscribe(tenantId: galleryID)
        let response: GallerySubscriptionMutationResponse = try await AfilmoryAPI.shared.request(endpoint)
        try Task.checkCancellation()
        guard sessionUserID == session.user.id,
              let currentIndex = galleries.firstIndex(where: { $0.id == galleryID })
        else { return }
        galleries[currentIndex].isSubscribed = response.subscribed
        refreshNotificationPresentation()
        if targetValue, response.subscribed {
          offerNotificationPermissionAfterSubscription()
        }
      } catch {
        guard !Task.isCancelled,
              let currentIndex = galleries.firstIndex(where: { $0.id == galleryID })
        else { return }
        galleries[currentIndex].isSubscribed = previousValue
        refreshNotificationPresentation()
        if case APIError.unauthorized = error {
          AfilmorySessionStore.shared.refreshSession()
          onRequestSignIn()
        } else {
          presentSubscriptionError()
        }
      }
    }
    subscriptionTasks[galleryID] = task
  }

  private func presentSubscriptionError() {
    guard presentedViewController == nil else { return }
    let alert = UIAlertController(
      title: String(localized: "Couldn’t update subscription"),
      message: String(localized: "Check your connection and try again."),
      preferredStyle: .alert
    )
    alert.addAction(UIAlertAction(title: String(localized: "Done"), style: .default))
    present(alert, animated: true)
  }

  private var hasSubscriptions: Bool {
    galleries.contains(where: \.isSubscribed)
  }

  private var notificationBannerState: GalleryNotificationBannerState {
    guard activeQuery.isEmpty else { return .hidden }
    return resolveGalleryNotificationBannerState(
      hasSubscriptions: hasSubscriptions,
      permission: notificationPermissionState
    )
  }

  private func refreshNotificationPermissionState() {
    notificationPermissionTask?.cancel()
    notificationPermissionTask = Task { @MainActor [weak self] in
      guard let self else { return }
      let state = await notificationPermissions.currentState()
      guard !Task.isCancelled else { return }
      setNotificationPermissionState(state)
    }
  }

  private func setNotificationPermissionState(_ state: GalleryNotificationPermissionState) {
    guard notificationPermissionState != state else { return }
    notificationPermissionState = state
    refreshNotificationPresentation()
  }

  private func offerNotificationPermissionAfterSubscription() {
    guard !didOfferNotificationPermissionThisSession else { return }
    didOfferNotificationPermissionThisSession = true
    notificationPermissionTask?.cancel()
    notificationPermissionTask = Task { @MainActor [weak self] in
      guard let self else { return }
      let state = await notificationPermissions.currentState()
      guard !Task.isCancelled else { return }
      setNotificationPermissionState(state)
      guard state == .notDetermined else { return }
      presentNotificationPermissionPrompt()
    }
  }

  private func presentNotificationPermissionPrompt() {
    guard notificationPermissionState == .notDetermined,
          presentedViewController == nil
    else { return }

    let alert = UIAlertController(
      title: String(localized: "Stay up to date"),
      message: String(localized: "Afilmory can notify you when galleries you subscribe to publish new photos."),
      preferredStyle: .alert
    )
    alert.addAction(
      UIAlertAction(
        title: String(localized: "Not Now"),
        style: .cancel
      )
    )
    let enableAction = UIAlertAction(
      title: String(localized: "Turn On Notifications"),
      style: .default
    ) { [weak self] _ in
      self?.requestNotificationAuthorization()
    }
    alert.addAction(enableAction)
    alert.preferredAction = enableAction
    present(alert, animated: true)
  }

  private func requestNotificationAuthorization() {
    notificationPermissionTask?.cancel()
    notificationPermissionTask = Task { @MainActor [weak self] in
      guard let self else { return }
      let state = await notificationPermissions.requestAuthorization()
      guard !Task.isCancelled else { return }
      setNotificationPermissionState(state)
    }
  }

  private func handleNotificationBannerAction() {
    switch notificationBannerState {
    case .hidden:
      return
    case .enableNotifications:
      presentNotificationPermissionPrompt()
    case .openSettings:
      notificationPermissions.openSettings()
    }
  }

  private func refreshNotificationPresentation() {
    guard isViewLoaded else { return }
    let nextHeaderHeight = headerHeight
    let correctedTopOffsetY = resolvedGalleryTopOffsetAfterHeaderTransition(
      previousHeaderHeight: layout.headerReferenceSize.height,
      nextHeaderHeight: nextHeaderHeight,
      contentOffsetY: collectionView.contentOffset.y,
      adjustedTopInset: collectionView.adjustedContentInset.top
    )
    configureLayout(width: collectionView.bounds.width)
    collectionView.reloadData()
    guard let correctedTopOffsetY else { return }
    collectionView.layoutIfNeeded()
    collectionView.setContentOffset(
      CGPoint(x: collectionView.contentOffset.x, y: correctedTopOffsetY),
      animated: false
    )
  }

  private func configureLayout(width: CGFloat) {
    let horizontalPadding = horizontalPadding(for: width)
    let gap: CGFloat = width < 600 ? 14 : 16
    let availableWidth = max(0, width - horizontalPadding * 2)
    let columns = max(1, min(3, Int(floor((availableWidth + gap) / (300 + gap)))))
    let itemWidth = floor((availableWidth - CGFloat(columns - 1) * gap) / CGFloat(columns))
    layout.minimumInteritemSpacing = gap
    layout.minimumLineSpacing = gap
    layout.sectionInset = UIEdgeInsets(top: 12, left: horizontalPadding, bottom: 120, right: horizontalPadding)
    layout.headerReferenceSize = headerHeight == 0
      ? .zero
      : CGSize(width: width, height: headerHeight)
    layout.itemSize = CGSize(width: itemWidth, height: GalleryCardCell.preferredHeight(for: itemWidth))
    layout.invalidateLayout()
  }

  private func horizontalPadding(for width: CGFloat) -> CGFloat {
    width >= 1000 ? 28 : width >= 600 ? 20 : 16
  }

  private var headerHeight: CGFloat {
    if !activeQuery.isEmpty {
      return GallerySearchSummaryView.preferredHeight
    }
    return notificationBannerState == .hidden
      ? 0
      : GalleryNotificationBannerView.preferredHeight
  }

  private func errorConfiguration() -> UIContentUnavailableConfiguration {
    var configuration = UIContentUnavailableConfiguration.empty()
    configuration.image = UIImage(systemName: "exclamationmark.triangle")
    configuration.text = String(localized: "Failed to load galleries")
    configuration.secondaryText = String(localized: "Check your connection and try again.")
    configuration.button = .filled()
    configuration.button.title = String(localized: "Retry")
    configuration.buttonProperties.primaryAction = UIAction { [weak self] _ in
      self?.loadGalleries(force: true)
    }
    return configuration
  }

  private func emptyConfiguration() -> UIContentUnavailableConfiguration {
    if !activeQuery.isEmpty {
      var configuration = UIContentUnavailableConfiguration.search()
      configuration.text = String(localized: "No galleries found")
      configuration.secondaryText = String(localized: "Try a gallery name, handle, or photographer.")
      return configuration
    }
    var configuration = UIContentUnavailableConfiguration.empty()
    configuration.image = UIImage(systemName: "rectangle.stack")
    configuration.text = String(localized: "No photos yet")
    return configuration
  }
}

extension GalleriesController: UICollectionViewDataSource, UICollectionViewDelegate {
  func collectionView(_ collectionView: UICollectionView, numberOfItemsInSection section: Int) -> Int {
    galleries.count
  }

  func collectionView(
    _ collectionView: UICollectionView,
    cellForItemAt indexPath: IndexPath
  ) -> UICollectionViewCell {
    guard let cell = collectionView.dequeueReusableCell(
      withReuseIdentifier: GalleryCardCell.reuseIdentifier,
      for: indexPath
    ) as? GalleryCardCell else {
      return UICollectionViewCell()
    }
    let gallery = galleries[indexPath.item]
    cell.configure(
      gallery: gallery,
      covers: coverCache[gallery.slug],
      photoCount: String(localized: "\(gallery.photoCount) photos"),
      subscriptionState: resolveGallerySubscriptionButtonState(
        isOwnGallery: gallery.isOwnGallery,
        isSubscribed: gallery.isSubscribed,
        pendingTarget: pendingSubscriptionTargets[gallery.id]
      ),
      subscribeTitle: String(localized: "Subscribe"),
      subscribedTitle: String(localized: "Subscribed"),
      unsubscribeTitle: String(localized: "Unsubscribe"),
      accessibilityLabel: String(localized: "Open \(gallery.name)"),
      onSubscriptionToggle: { [weak self] in
        self?.toggleSubscription(galleryID: gallery.id)
      }
    )
    loadCovers(for: gallery)
    return cell
  }

  func collectionView(
    _ collectionView: UICollectionView,
    viewForSupplementaryElementOfKind kind: String,
    at indexPath: IndexPath
  ) -> UICollectionReusableView {
    guard kind == UICollectionView.elementKindSectionHeader else {
      return UICollectionReusableView()
    }
    if !activeQuery.isEmpty {
      guard let summary = collectionView.dequeueReusableSupplementaryView(
        ofKind: kind,
        withReuseIdentifier: GallerySearchSummaryView.reuseIdentifier,
        for: indexPath
      ) as? GallerySearchSummaryView else { return UICollectionReusableView() }
      summary.configure(
        text: String(localized: "\(galleries.count) galleries"),
        horizontalInset: horizontalPadding(for: collectionView.bounds.width)
      )
      return summary
    }

    guard
          let banner = collectionView.dequeueReusableSupplementaryView(
            ofKind: kind,
            withReuseIdentifier: GalleryNotificationBannerView.reuseIdentifier,
            for: indexPath
          ) as? GalleryNotificationBannerView
    else { return UICollectionReusableView() }

    let state = notificationBannerState
    let content: (title: String, detail: String, action: String)
    switch state {
    case .hidden:
      return banner
    case .enableNotifications:
      content = (
        String(localized: "Turn on gallery notifications"),
        String(localized: "Get an alert when galleries you subscribe to publish new photos."),
        String(localized: "Turn On")
      )
    case .openSettings:
      content = (
        String(localized: "Notifications are off"),
        String(localized: "Your subscriptions are saved. Enable notifications in Settings to receive new photo updates."),
        String(localized: "Open Settings")
      )
    }
    banner.configure(
      state: state,
      title: content.title,
      detail: content.detail,
      actionTitle: content.action,
      horizontalInset: horizontalPadding(for: collectionView.bounds.width),
      onAction: { [weak self] in self?.handleNotificationBannerAction() }
    )
    return banner
  }

  func collectionView(_ collectionView: UICollectionView, didSelectItemAt indexPath: IndexPath) {
    collectionView.deselectItem(at: indexPath, animated: true)
    guard galleries.indices.contains(indexPath.item) else { return }
    let gallery = galleries[indexPath.item]
    navigationController?.pushViewController(
      GalleryDetailController(
        slug: gallery.slug,
        title: gallery.name,
        onRequestSignIn: onRequestSignIn
      ),
      animated: true
    )
  }
}

extension GalleriesController: UISearchResultsUpdating {
  func updateSearchResults(for searchController: UISearchController) {
    let query = searchController.searchBar.text?
      .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    guard query != activeQuery else { return }

    activeQuery = query
    searchDebounceTask?.cancel()
    loadTask?.cancel()
    coverTasks.values.forEach { $0.cancel() }
    coverTasks.removeAll()
    refreshControl.endRefreshing()
    galleries = []
    refreshNotificationPresentation()
    contentUnavailableConfiguration = UIContentUnavailableConfiguration.loading()

    searchDebounceTask = Task { @MainActor [weak self] in
      do {
        if !query.isEmpty {
          try await Task.sleep(for: .milliseconds(250))
        }
        guard let self, !Task.isCancelled, self.activeQuery == query else { return }
        self.loadGalleries(force: true)
      } catch {}
    }
  }
}

extension GalleriesController: UICollectionViewDataSourcePrefetching {
  func collectionView(_ collectionView: UICollectionView, prefetchItemsAt indexPaths: [IndexPath]) {
    for indexPath in indexPaths where galleries.indices.contains(indexPath.item) {
      loadCovers(for: galleries[indexPath.item])
    }
  }

  func collectionView(_ collectionView: UICollectionView, cancelPrefetchingForItemsAt indexPaths: [IndexPath]) {
    let visibleSlugs = Set(collectionView.indexPathsForVisibleItems.compactMap { indexPath in
      galleries.indices.contains(indexPath.item) ? galleries[indexPath.item].slug : nil
    })
    for indexPath in indexPaths where galleries.indices.contains(indexPath.item) {
      let slug = galleries[indexPath.item].slug
      guard !visibleSlugs.contains(slug) else { continue }
      coverTasks[slug]?.cancel()
      coverTasks[slug] = nil
    }
  }
}
