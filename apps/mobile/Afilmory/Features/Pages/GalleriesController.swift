import UIKit

final class GalleriesController: UIViewController, UIScrollViewDelegate {
  private let onRequestSignIn: () -> Void
  private let headerView = ExploreHeaderView()
  private let pagerScrollView = ExplorePagerScrollView()
  private let directory: ExploreDirectoryController
  private let following: FollowingGalleriesController
  private let timeline: GalleryTimelineController
  private var currentSegment: ExploreSegment = .explore
  private var previousPagerWidth: CGFloat = 0
  private var programmaticSegment: ExploreSegment?
  private var userHasChosen = false
  private var sessionObservation: AfilmorySessionObservationToken?
  private var lastGalleryRouteRequestID: String?
  private var isVisitorChromeVisible = false
  private var isSectionRailVisible = false
  private var isSearching = false
  private var scrollEdgeInteraction: AnyObject?
  private var headerBarItem: UIBarButtonItem?
  private var contentHeaderConstraints: [NSLayoutConstraint] = []
  private var pagerTopConstraint: NSLayoutConstraint!
  private var contentPagerTopConstraint: NSLayoutConstraint!

  private var displaysContentHeader: Bool {
    traitCollection.horizontalSizeClass == .regular && (isSearching || isSectionRailVisible)
  }

  private lazy var signInItem: UIBarButtonItem = {
    let item = UIBarButtonItem(
      title: String(localized: "Sign in"),
      primaryAction: UIAction { [weak self] _ in self?.requestSignIn() }
    )
    if #available(iOS 26.0, *) {
      item.style = .prominent
    }
    return item
  }()

  private lazy var visitorTitleItem: UIBarButtonItem = {
    let label = UILabel()
    label.text = String(localized: "Explore")
    label.font = .systemFont(ofSize: 17, weight: .semibold)
    let item = UIBarButtonItem(customView: label)
    if #available(iOS 26.0, *) {
      item.hidesSharedBackground = true
    }
    return item
  }()

  private lazy var searchItem: UIBarButtonItem = {
    UIBarButtonItem(
      image: UIImage(systemName: "magnifyingglass"),
      primaryAction: UIAction { [weak self] _ in
        guard let self else { return }
        if isSearching {
          endSearch(animated: true)
        } else {
          beginSearch()
        }
      }
    )
  }()

  private var sectionRail: ExploreSectionRailView { headerView.sectionRail }

  private var orderedPages: [(segment: ExploreSegment, controller: UIViewController)] {
    [
      (.timeline, timeline),
      (.following, following),
      (.explore, directory),
    ]
  }

  init(onRequestSignIn: @escaping () -> Void) {
    self.onRequestSignIn = onRequestSignIn
    var openGallery: ((GalleryHeaderModel, String?) -> Void)!
    directory = ExploreDirectoryController(
      onRequestSignIn: onRequestSignIn,
      onOpenGallery: { header, photoID in openGallery?(header, photoID) },
      onSubscriptionsChanged: {}
    )
    following = FollowingGalleriesController(
      onRequestSignIn: onRequestSignIn,
      onOpenGallery: { header, photoID in openGallery?(header, photoID) },
      onBrowseExplore: {}
    )
    timeline = GalleryTimelineController(
      onOpenGallery: { header, photoID in openGallery?(header, photoID) },
      onBrowseExplore: {}
    )
    super.init(nibName: nil, bundle: nil)
    title = String(localized: "Explore")
    openGallery = { [weak self] header, photoID in
      self?.pushGallery(
        slug: header.slug,
        title: header.name,
        header: header,
        focusPhotoID: photoID
      )
    }
    directory.onSubscriptionsChanged = { [weak self] in
      self?.refreshSubscriptionSurfaces()
    }
    following.onBrowseExploreHandler = { [weak self] in
      self?.selectExploreSegment()
    }
    timeline.onBrowseExploreHandler = { [weak self] in
      self?.selectExploreSegment()
    }
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) is not supported")
  }

  func openGallery(_ route: GalleryRouteRequest) {
    guard lastGalleryRouteRequestID != route.requestId else { return }
    lastGalleryRouteRequestID = route.requestId
    pushGallery(slug: route.slug, title: route.title, header: nil, focusPhotoID: route.photoID)
  }

  func selectExploreSegment() {
    userHasChosen = true
    show(.explore, animated: true)
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .systemGroupedBackground
    navigationItem.largeTitleDisplayMode = .never
    navigationItem.backButtonTitle = String(localized: "Explore")
    searchItem.accessibilityLabel = String(localized: "Search")
    searchItem.accessibilityIdentifier = "explore.search"

    headerView.onSearchTextChange = { [weak self] text in
      self?.directory.applySearchQuery(text)
    }
    sectionRail.onSelect = { [weak self] segment in
      guard let self else { return }
      userHasChosen = true
      show(segment, animated: true)
    }
    installScrollEdgeInteraction()

    pagerScrollView.translatesAutoresizingMaskIntoConstraints = false
    pagerScrollView.backgroundColor = .systemGroupedBackground
    pagerScrollView.contentInsetAdjustmentBehavior = .never
    pagerScrollView.delegate = self
    pagerScrollView.isDirectionalLockEnabled = true
    pagerScrollView.isPagingEnabled = true
    pagerScrollView.isScrollEnabled = false
    pagerScrollView.showsHorizontalScrollIndicator = false
    pagerScrollView.showsVerticalScrollIndicator = false
    pagerScrollView.accessibilityIdentifier = "explore.pageContainer"
    view.addSubview(pagerScrollView)

    pagerTopConstraint = pagerScrollView.topAnchor.constraint(equalTo: view.topAnchor)
    contentPagerTopConstraint = pagerScrollView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 64)
    contentHeaderConstraints = [
      headerView.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 20),
      headerView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 8),
    ]
    NSLayoutConstraint.activate([
      pagerTopConstraint,
      pagerScrollView.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor),
      pagerScrollView.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor),
      pagerScrollView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
    ])

    var previousPageView: UIView?
    for page in orderedPages {
      let child = page.controller
      addChild(child)
      child.view.translatesAutoresizingMaskIntoConstraints = false
      pagerScrollView.addSubview(child.view)
      var constraints = [
        child.view.topAnchor.constraint(equalTo: pagerScrollView.contentLayoutGuide.topAnchor),
        child.view.bottomAnchor.constraint(equalTo: pagerScrollView.contentLayoutGuide.bottomAnchor),
        child.view.widthAnchor.constraint(equalTo: pagerScrollView.frameLayoutGuide.widthAnchor),
        child.view.heightAnchor.constraint(equalTo: pagerScrollView.frameLayoutGuide.heightAnchor),
      ]
      if let previousPageView {
        constraints.append(child.view.leadingAnchor.constraint(equalTo: previousPageView.trailingAnchor))
      } else {
        constraints.append(child.view.leadingAnchor.constraint(equalTo: pagerScrollView.contentLayoutGuide.leadingAnchor))
      }
      NSLayoutConstraint.activate(constraints)
      child.didMove(toParent: self)
      previousPageView = child.view
    }
    if let previousPageView {
      previousPageView.trailingAnchor.constraint(
        equalTo: pagerScrollView.contentLayoutGuide.trailingAnchor
      ).isActive = true
    }

    sessionObservation = AfilmorySessionStore.shared.observe { [weak self] state in
      DispatchQueue.main.async {
        self?.handleSession(state)
      }
    }
    handleSession(AfilmorySessionStore.shared.current().state)
  }

  override func viewWillAppear(_ animated: Bool) {
    super.viewWillAppear(animated)
    applyDefaultSegmentIfNeeded()
    updateScrollEdgeScrollView()
  }

  override func viewDidLayoutSubviews() {
    super.viewDidLayoutSubviews()
    if (headerView.superview === view) != displaysContentHeader {
      applyHeaderChrome()
    }
    updateSearchBarWidth()
    let width = pagerScrollView.bounds.width
    guard width > 0, abs(width - previousPagerWidth) >= 0.5 else { return }
    previousPagerWidth = width
    guard !pagerScrollView.isDragging, !pagerScrollView.isDecelerating else { return }
    pagerScrollView.setContentOffset(
      CGPoint(x: CGFloat(currentSegment.rawValue) * width, y: 0),
      animated: false
    )
    sectionRail.setSelected(currentSegment)
    updateScrollEdgeScrollView()
  }

  private func handleSession(_ state: AfilmorySessionState) {
    switch state {
    case .signedOut:
      userHasChosen = false
      isVisitorChromeVisible = true
      isSectionRailVisible = false
      pagerScrollView.isScrollEnabled = false
      if isSearching {
        endSearch(animated: false)
      } else {
        applyHeaderChrome()
      }
      show(.explore, animated: false)
    case .loading, .failed:
      userHasChosen = false
      isVisitorChromeVisible = false
      isSectionRailVisible = false
      pagerScrollView.isScrollEnabled = false
      if isSearching {
        endSearch(animated: false)
      } else {
        applyHeaderChrome()
      }
      show(.explore, animated: false)
    case .signedIn:
      isVisitorChromeVisible = false
      isSectionRailVisible = true
      pagerScrollView.isScrollEnabled = true
      applyHeaderChrome()
      applyDefaultSegmentIfNeeded()
    }
  }

  private func applyHeaderChrome() {
    updateSearchBarWidth()
    if displaysContentHeader {
      navigationItem.leftBarButtonItem = nil
      navigationItem.title = nil
      headerBarItem = nil
      if headerView.superview !== view {
        headerView.removeFromSuperview()
        view.addSubview(headerView)
        NSLayoutConstraint.activate(contentHeaderConstraints)
      }
      pagerTopConstraint.isActive = false
      contentPagerTopConstraint.isActive = true
    } else {
      NSLayoutConstraint.deactivate(contentHeaderConstraints)
      contentPagerTopConstraint.isActive = false
      pagerTopConstraint.isActive = true
      if headerView.superview === view {
        headerView.removeFromSuperview()
      }
      applyNavigationHeader()
    }

    searchItem.image = UIImage(systemName: isSearching ? "xmark" : "magnifyingglass")
    searchItem.accessibilityLabel = isSearching
      ? String(localized: "Close")
      : String(localized: "Search")
    if isVisitorChromeVisible, !isSearching {
      navigationItem.rightBarButtonItems = [signInItem, searchItem]
    } else {
      navigationItem.rightBarButtonItem = searchItem
    }
  }

  private func applyNavigationHeader() {
    if isSearching || isSectionRailVisible {
      installHeaderBarItem(force: true)
      navigationItem.title = nil
    } else if #available(iOS 26.0, *) {
      navigationItem.leftBarButtonItem = visitorTitleItem
      headerBarItem = nil
      navigationItem.title = nil
    } else {
      navigationItem.leftBarButtonItem = nil
      headerBarItem = nil
      navigationItem.title = String(localized: "Explore")
    }

  }

  private func installHeaderBarItem(force: Bool) {
    if !force, let headerBarItem, headerBarItem.customView === headerView {
      return
    }
    let item = UIBarButtonItem(customView: headerView)
    if #available(iOS 26.0, *) {
      item.hidesSharedBackground = true
    }
    headerBarItem = item
    navigationItem.leftBarButtonItem = item
  }

  private func beginSearch() {
    userHasChosen = true
    if currentSegment != .explore {
      show(.explore, animated: true)
    }
    isSearching = true
    updateSearchBarWidth()
    headerView.setSearching(true, animated: true)
    applyHeaderChrome()
  }

  private func endSearch(animated: Bool) {
    guard isSearching else {
      directory.clearSearchQuery()
      return
    }
    isSearching = false
    headerView.setSearching(false, animated: animated)
    directory.clearSearchQuery()
    applyHeaderChrome()
  }

  private func updateSearchBarWidth() {
    if displaysContentHeader {
      headerView.setAvailableSearchWidth(view.safeAreaLayoutGuide.layoutFrame.width - 40)
      return
    }
    let barWidth = navigationController?.navigationBar.bounds.width ?? view.bounds.width
    guard barWidth > 0 else { return }
    let trailing: CGFloat = isVisitorChromeVisible ? 160 : 88
    headerView.setAvailableSearchWidth(barWidth - trailing - 16)
  }

  private func installScrollEdgeInteraction() {
    guard #available(iOS 26.0, *) else { return }
    let interaction = UIScrollEdgeElementContainerInteraction()
    interaction.edge = .top
    headerView.addInteraction(interaction)
    scrollEdgeInteraction = interaction
    updateScrollEdgeScrollView()
  }

  private func updateScrollEdgeScrollView() {
    guard #available(iOS 26.0, *) else { return }
    guard let interaction = scrollEdgeInteraction as? UIScrollEdgeElementContainerInteraction else {
      return
    }
    let scrollView = exploreScrollView(for: currentSegment)
    scrollView.topEdgeEffect.style = .soft
    interaction.scrollView = scrollView
  }

  private func exploreScrollView(for segment: ExploreSegment) -> UIScrollView {
    switch segment {
    case .timeline:
      timeline.exploreScrollView
    case .following:
      following.exploreScrollView
    case .explore:
      directory.exploreScrollView
    }
  }

  private func resetSearchIfLeavingDiscover(for segment: ExploreSegment) {
    guard segment != .explore, isSearching else { return }
    endSearch(animated: true)
  }

  private func requestSignIn() {
    onRequestSignIn()
  }

  private func applyDefaultSegmentIfNeeded() {
    guard case .signedIn(let session) = AfilmorySessionStore.shared.current().state else {
      show(.explore, animated: false)
      return
    }
    if !userHasChosen {
      let cached = GallerySubscriptionStore.shared.cachedHasSubscriptions(userId: session.user.id)
      show(
        resolveExploreDefaultSegment(isSignedIn: true, cachedHasSubscriptions: cached),
        animated: false
      )
    }
    Task { @MainActor [weak self] in
      guard let self else { return }
      await GallerySubscriptionStore.shared.load(userId: session.user.id, force: true)
      if !userHasChosen {
        show(
          resolveExploreSegmentAfterFetch(
            current: currentSegment,
            userHasChosen: false,
            hasSubscriptions: GallerySubscriptionStore.shared.hasSubscriptions
          ),
          animated: false
        )
      }
      following.reloadFromStore()
      if currentSegment == .timeline {
        await GalleryTimelineStore.shared.refresh(timeZone: TimeZone.current.identifier)
        timeline.reloadFromStore()
      }
    }
  }

  private func refreshSubscriptionSurfaces() {
    Task { @MainActor [weak self] in
      guard let self else { return }
      if case .signedIn(let session) = AfilmorySessionStore.shared.current().state {
        await GallerySubscriptionStore.shared.load(userId: session.user.id, force: true)
      }
      await GalleryTimelineStore.shared.refresh(timeZone: TimeZone.current.identifier)
      following.reloadFromStore()
      timeline.reloadFromStore()
      directory.reloadSubscriptionState()
    }
  }

  private func show(_ segment: ExploreSegment, animated: Bool) {
    let changed = currentSegment != segment
    currentSegment = segment
    programmaticSegment = animated ? segment : nil

    let width = pagerScrollView.bounds.width
    let targetOffset = CGPoint(x: CGFloat(segment.rawValue) * width, y: 0)
    if animated, width > 0, viewIfLoaded?.window != nil {
      pagerScrollView.setContentOffset(targetOffset, animated: true)
    } else {
      pagerScrollView.setContentOffset(targetOffset, animated: false)
      sectionRail.setSelected(segment)
      resetSearchIfLeavingDiscover(for: segment)
      programmaticSegment = nil
      updateScrollEdgeScrollView()
    }

    guard changed else { return }
    activate(segment)
  }

  private func activate(_ segment: ExploreSegment) {
    if segment == .timeline {
      Task { @MainActor [weak self] in
        await GalleryTimelineStore.shared.refresh(timeZone: TimeZone.current.identifier)
        self?.timeline.reloadFromStore()
      }
    }
    if segment == .following {
      following.reloadFromStore()
    }
  }

  func scrollViewWillBeginDragging(_ scrollView: UIScrollView) {
    guard scrollView === pagerScrollView else { return }
    programmaticSegment = nil
    userHasChosen = true
    sectionRail.beginInteractiveTransition()
    headerView.resignSearchFirstResponder()
  }

  func scrollViewDidScroll(_ scrollView: UIScrollView) {
    guard scrollView === pagerScrollView, scrollView.bounds.width > 0 else { return }
    sectionRail.setSelectionProgress(scrollView.contentOffset.x / scrollView.bounds.width)
  }

  func scrollViewDidEndDecelerating(_ scrollView: UIScrollView) {
    guard scrollView === pagerScrollView else { return }
    commitPagerPosition()
  }

  func scrollViewDidEndDragging(_ scrollView: UIScrollView, willDecelerate decelerate: Bool) {
    guard scrollView === pagerScrollView, !decelerate else { return }
    commitPagerPosition()
  }

  func scrollViewDidEndScrollingAnimation(_ scrollView: UIScrollView) {
    guard scrollView === pagerScrollView else { return }
    commitPagerPosition()
  }

  private func commitPagerPosition() {
    let resolved = resolveExploreSegment(
      pageOffsetX: pagerScrollView.contentOffset.x,
      pageWidth: pagerScrollView.bounds.width,
      fallback: programmaticSegment ?? currentSegment
    )
    let changed = currentSegment != resolved
    currentSegment = resolved
    programmaticSegment = nil
    sectionRail.setSelected(resolved)
    resetSearchIfLeavingDiscover(for: resolved)
    updateScrollEdgeScrollView()
    if changed {
      activate(resolved)
    }
  }

  private func pushGallery(
    slug: String,
    title: String,
    header: GalleryHeaderModel?,
    focusPhotoID: String?
  ) {
    navigationController?.pushViewController(
      GalleryDetailController(
        slug: slug,
        title: title,
        header: header,
        onRequestSignIn: onRequestSignIn,
        onSubscriptionChanged: { [weak self] didSubscribe in
          guard let self else { return }
          refreshSubscriptionSurfaces()
          if didSubscribe {
            directory.offerNotificationPermissionAfterSubscription()
          }
        },
        focusPhotoID: focusPhotoID
      ),
      animated: viewIfLoaded?.window != nil
    )
  }
}

final class ExplorePagerScrollView: UIScrollView {
  override func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
    guard gestureRecognizer === panGestureRecognizer,
          let panGestureRecognizer = gestureRecognizer as? UIPanGestureRecognizer
    else {
      return super.gestureRecognizerShouldBegin(gestureRecognizer)
    }
    let velocity = panGestureRecognizer.velocity(in: self)
    guard abs(velocity.x) > abs(velocity.y) else { return false }
    return super.gestureRecognizerShouldBegin(gestureRecognizer)
  }
}
