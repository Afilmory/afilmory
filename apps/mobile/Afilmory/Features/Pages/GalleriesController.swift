import UIKit

final class GalleriesController: UIViewController, UIScrollViewDelegate, UISearchControllerDelegate {
  private let onRequestSignIn: () -> Void
  private let sectionRail = ExploreSectionRailView()
  private let pagerScrollView = ExplorePagerScrollView()
  private let directory: ExploreDirectoryController
  private let following: FollowingGalleriesController
  private let timeline: GalleryTimelineController
  private lazy var searchController = makeSearchController()
  private var currentSegment: ExploreSegment = .explore
  private var previousPagerWidth: CGFloat = 0
  private var programmaticSegment: ExploreSegment?
  private var userHasChosen = false
  private var sessionObservation: AfilmorySessionObservationToken?
  private var lastGalleryRouteRequestID: String?
  private var isVisitorChromeVisible = false

  private var showsVisitorToolbar: Bool {
    guard #available(iOS 26.0, *) else { return false }
    return isVisitorChromeVisible
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
    if #available(iOS 26.0, *) {
      navigationItem.preferredSearchBarPlacement = .integrated
      toolbarItems = [navigationItem.searchBarPlacementBarButtonItem]
    } else {
      navigationItem.preferredSearchBarPlacement = .stacked
    }
    navigationItem.searchController = searchController

    sectionRail.onSelect = { [weak self] segment in
      guard let self else { return }
      userHasChosen = true
      show(segment, animated: true)
    }

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

    NSLayoutConstraint.activate([
      pagerScrollView.topAnchor.constraint(equalTo: view.topAnchor),
      pagerScrollView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      pagerScrollView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
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
    navigationController?.setToolbarHidden(!showsVisitorToolbar, animated: animated)
    applyDefaultSegmentIfNeeded()
  }

  override func viewWillDisappear(_ animated: Bool) {
    super.viewWillDisappear(animated)
    navigationController?.setToolbarHidden(true, animated: animated)
  }

  override func viewDidLayoutSubviews() {
    super.viewDidLayoutSubviews()
    let width = pagerScrollView.bounds.width
    guard width > 0, abs(width - previousPagerWidth) >= 0.5 else { return }
    previousPagerWidth = width
    guard !pagerScrollView.isDragging, !pagerScrollView.isDecelerating else { return }
    pagerScrollView.setContentOffset(
      CGPoint(x: CGFloat(currentSegment.rawValue) * width, y: 0),
      animated: false
    )
    sectionRail.setSelected(currentSegment)
  }

  private func handleSession(_ state: AfilmorySessionState) {
    switch state {
    case .signedOut:
      userHasChosen = false
      setSignInBarVisible(true)
      setSectionRailVisible(false)
      show(.explore, animated: false)
    case .loading, .failed:
      userHasChosen = false
      setSignInBarVisible(false)
      setSectionRailVisible(false)
      show(.explore, animated: false)
    case .signedIn:
      setSignInBarVisible(false)
      setSectionRailVisible(true)
      applyDefaultSegmentIfNeeded()
    }
  }

  private func setSignInBarVisible(_ isVisible: Bool) {
    isVisitorChromeVisible = isVisible
    navigationItem.rightBarButtonItem = isVisible ? signInItem : nil
    if #available(iOS 26.0, *) {
      navigationItem.preferredSearchBarPlacement = isVisible ? .integrated : .integratedButton
    }
    navigationController?.setToolbarHidden(!showsVisitorToolbar, animated: false)
  }

  private func setSectionRailVisible(_ isVisible: Bool) {
    pagerScrollView.isScrollEnabled = isVisible
    if isVisible {
      if navigationItem.leftBarButtonItem?.customView !== sectionRail {
        let item = UIBarButtonItem(customView: sectionRail)
        if #available(iOS 26.0, *) {
          item.hidesSharedBackground = true
        }
        navigationItem.leftBarButtonItem = item
      }
      navigationItem.title = nil
    } else if #available(iOS 26.0, *) {
      navigationItem.leftBarButtonItem = visitorTitleItem
      navigationItem.title = nil
    } else {
      navigationItem.leftBarButtonItem = nil
      navigationItem.title = String(localized: "Explore")
    }
  }

  private func makeSearchController() -> UISearchController {
    let controller = UISearchController(searchResultsController: nil)
    controller.obscuresBackgroundDuringPresentation = false
    controller.hidesNavigationBarDuringPresentation = false
    controller.searchResultsUpdater = directory
    controller.delegate = self
    controller.searchBar.placeholder = String(localized: "Search galleries")
    controller.searchBar.autocapitalizationType = .none
    controller.searchBar.autocorrectionType = .no
    controller.searchBar.accessibilityIdentifier = "explore.discover.search"
    return controller
  }

  private func resetSearchIfLeavingDiscover(for segment: ExploreSegment) {
    guard segment != .explore, searchController.isActive || searchController.searchBar.text?.isEmpty == false else { return }
    searchController.isActive = false
    searchController.searchBar.text = nil
    directory.clearSearchQuery()
  }

  func willPresentSearchController(_ searchController: UISearchController) {
    guard currentSegment != .explore else { return }
    userHasChosen = true
    show(.explore, animated: true)
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
    searchController.searchBar.resignFirstResponder()
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
