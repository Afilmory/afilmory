import UIKit

enum ExhibitionSource: Equatable, Sendable {
  case own
  case gallery(slug: String, header: GalleryHeaderModel?)
}

final class ExhibitionController: UIViewController {
  let source: ExhibitionSource
  let onRequestSignIn: () -> Void
  let feed: ExhibitionFeed
  let hero = ExhibitionHeroView()
  let sheetLayout = ExhibitionSheetLayout()
  let topBar: ExhibitionTopBar
  let stateView = ExhibitionStateView()
  lazy var collectionView = UICollectionView(frame: .zero, collectionViewLayout: sheetLayout)
  lazy var mapCard = makeMapCard()
  lazy var mapFullScreen = makeMapFullScreen()
  private var lastPages: [CGRect] = []
  var content = ExhibitionContent(all: [], filters: .empty, level: .day, width: 358)
  var level: ContactSheetLevel = .day
  var openerID: String?
  var openerAccent = AFColor.accentFallback
  var pendingFocus: (level: ContactSheetLevel, photoID: String?)?
  var hasPlayedEntrance = false
  var galleryHeader: GalleryHeaderModel?
  var pendingFollowTarget: Bool?
  var pinchHandled = false
  let edgeSwipe = ExhibitionEdgeSwipe()
  private var filterObservation: PhotoFeedObservationToken?
  private var lastWidth: CGFloat = 0

  init(source: ExhibitionSource, onRequestSignIn: @escaping () -> Void) {
    self.source = source
    self.onRequestSignIn = onRequestSignIn
    feed = ExhibitionFeed(source: source)
    if case .gallery(_, let header) = source {
      galleryHeader = header
      topBar = ExhibitionTopBar(showsBack: true)
    } else {
      topBar = ExhibitionTopBar(showsBack: false)
    }
    super.init(nibName: nil, bundle: nil)
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  var isOwnSource: Bool { source == .own }

  var filters: PhotoFilters {
    isOwnSource ? PhotoFilterStore.shared.filters : .empty
  }

  override func viewIsAppearing(_ animated: Bool) {
    super.viewIsAppearing(animated)
    applyVerticalBar()
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = AFColor.ground
    overrideUserInterfaceStyle = .dark
    configureCollection()
    view.addSubview(collectionView)
    stateView.isHidden = true
    stateView.onAction = { [weak self] kind in self?.handleStateAction(kind) }
    view.addSubview(stateView)
    view.addSubview(topBar)
    wireTopBar()
    topBar.onItemsChanged = { [weak self] in self?.applyVerticalBar() }
    DuoBarItems.observe(self) { controller in
      controller.applyVerticalBar()
      controller.view.setNeedsLayout()
    }
    applyVerticalBar()
    wireHero()
    feed.onChange = { [weak self] _ in self?.render() }
    if isOwnSource {
      filterObservation = PhotoFilterStore.shared.observe { [weak self] in self?.render() }
    }
    feed.start()
    resolveGalleryHeader()
    render()
  }

  override func viewDidLayoutSubviews() {
    super.viewDidLayoutSubviews()
    collectionView.frame = view.bounds
    stateView.frame = view.bounds
    let barHeight = view.safeAreaInsets.top + ExhibitionTopBar.contentHeight
    topBar.frame = CGRect(x: 0, y: 0, width: view.bounds.width, height: barHeight)
    collectionView.contentInset.bottom = view.safeAreaInsets.bottom
    collectionView.verticalScrollIndicatorInsets = UIEdgeInsets(top: barHeight, left: 0, bottom: view.safeAreaInsets.bottom, right: 0)
    let pages = sheetPages()
    if hero.topInset != barHeight + 2 || lastWidth != view.bounds.width || lastPages != pages {
      let anchor = lastPages.isEmpty ? nil : topVisiblePhotoID()
      hero.topInset = barHeight + 2
      lastWidth = view.bounds.width
      lastPages = pages
      render()
      if let anchor, let offset = Self.anchoredOffset(photoID: anchor, content: content, layout: sheetLayout, topInset: topBar.bounds.height) {
        let maxOffset = max(0, collectionView.contentSize.height - collectionView.bounds.height)
        collectionView.contentOffset = CGPoint(x: 0, y: min(offset, maxOffset))
      }
    }
  }

  override func viewDidAppear(_ animated: Bool) {
    super.viewDidAppear(animated)
    AppNavigator.shared.setFocusAccent(openerAccent)
    if (navigationController?.viewControllers.count ?? 0) > 1 {
      edgeSwipe.attach(to: navigationController)
    }
    playEntranceIfReady()
  }

  override func viewWillDisappear(_ animated: Bool) {
    super.viewWillDisappear(animated)
    if navigationController?.viewControllers.contains(self) != true || navigationController?.topViewController !== self {
      edgeSwipe.detach()
    }
  }

  func show(level requested: ContactSheetLevel, focusingPhotoID photoID: String? = nil) {
    loadViewIfNeeded()
    guard !feed.snapshot.photos.isEmpty else {
      pendingFocus = (requested, photoID)
      return
    }
    pendingFocus = nil
    setLevel(requested, animated: false)
    view.layoutIfNeeded()
    guard let photoID else { return }
    if level == .infinity {
      mapCard.focus(on: photoID, animated: false)
      scrollToMap()
    } else if let block = content.blockIndex(containing: photoID), let frame = sheetLayout.frameOfBlock(block) {
      let target = frame.midY - collectionView.bounds.height * 0.42
      collectionView.setContentOffset(CGPoint(x: 0, y: max(0, min(target, collectionView.contentSize.height - collectionView.bounds.height))), animated: false)
    }
  }

  func render(animatedLevelChange: Bool = false) {
    guard isViewLoaded, view.bounds.width > 0 else { return }
    let snapshot = feed.snapshot
    let pages = sheetPages()
    content = ExhibitionContent(all: snapshot.photos, filters: filters, level: level, laneWidths: pages.map { $0.width - 32 })
    level = content.level
    topBar.setTitle(isOwnSource ? feed.ownWorkspaceName : (galleryHeader?.name ?? slugTitle))
    topBar.setFilterActive(content.isFiltered, count: PhotoFilterEngine.countActiveDimensions(filters))
    topBar.setProjectEnabled(!content.shown.isEmpty)
    refreshFollowButton()
    if let state = stateKind(for: snapshot) {
      stateView.show(state)
      stateView.isHidden = false
      collectionView.isHidden = true
      return
    }
    stateView.isHidden = true
    collectionView.isHidden = false
    updateOpener()
    hero.availableHeight = view.bounds.height
    hero.header.configure(
      caption: content.caption(),
      level: level,
      levels: content.availableLevels,
      query: content.isFiltered ? querySummary : nil,
      animated: animatedLevelChange
    )
    let span = pages.reduce(CGRect.null) { $0.union($1) }
    hero.spread = pages.count == 2 ? (pages[0].offsetBy(dx: -span.minX, dy: 0), pages[1].offsetBy(dx: -span.minX, dy: 0)) : nil
    sheetLayout.lanes = pages.map { $0.minX...$0.maxX }
    sheetLayout.heroHeight = hero.height(for: span.width)
    sheetLayout.placements = level == .infinity
      ? [ExhibitionSheetLayout.Placement(height: ExhibitionMapCard.totalHeight, lane: ContactSheetPlacement.spanning)]
      : content.placements.map { ExhibitionSheetLayout.Placement(height: $0.block.height(level: level), lane: $0.lane) }
    if level == .infinity {
      mapCard.configure(model: content.map, photos: content.shown, numbers: content.numbers)
    }
    collectionView.reloadData()
    collectionView.layoutIfNeeded()
    scrollViewDidScroll(collectionView)
    if let pendingFocus {
      show(level: pendingFocus.level, focusingPhotoID: pendingFocus.photoID)
    }
    playEntranceIfReady()
  }

  private var slugTitle: String? {
    if case .gallery(let slug, _) = source { return slug }
    return nil
  }

  private var querySummary: String {
    let summary = PhotoFilterEngine.summarize(filters)
    return String(localized: "\(content.shown.count) frames · \(summary)")
  }

  private func stateKind(for snapshot: ExhibitionFeed.Snapshot) -> ExhibitionStateView.Kind? {
    switch snapshot.state {
    case .unavailable: return .unavailable
    case .loading: return snapshot.photos.isEmpty ? .loading : nil
    case .failed: return snapshot.photos.isEmpty ? .offline : nil
    case .loaded:
      if snapshot.photos.isEmpty { return isOwnSource ? .emptyOwn : .emptyGallery }
      return content.shown.isEmpty ? .filteredEmpty : nil
    }
  }

  private func handleStateAction(_ kind: ExhibitionStateView.Kind) {
    switch kind {
    case .emptyOwn: AppNavigator.shared.openDarkroom(route: nil)
    case .filteredEmpty: PhotoFilterStore.shared.clear()
    case .offline: feed.reload()
    default: break
    }
  }

  private func updateOpener() {
    let pool = content.shown
    let resolved: GalleryPhoto?
    if openerID == nil, !isOwnSource {
      resolved = ExhibitionOpener.latest(in: pool)
    } else {
      resolved = ExhibitionOpener.resolve(currentID: openerID, pool: pool)
    }
    guard let photo = resolved else { return }
    let changed = photo.id != openerID
    openerID = photo.id
    if changed || hero.opener.photoID != photo.id {
      configureOpener(photo)
    }
  }

  func configureOpener(_ photo: GalleryPhoto) {
    let cached = AccentStore.shared.cachedAccent(photoId: photo.id)
    hero.opener.configure(photo: photo, number: content.number(of: photo.id), accent: cached ?? openerAccent)
    if let cached { applyAccent(cached) }
    AccentStore.shared.accent(photoId: photo.id, thumbnailURL: URL(string: photo.thumbnailUrl)) { [weak self] color in
      guard let self, self.openerID == photo.id else { return }
      self.applyAccent(color)
    }
  }

  private func applyAccent(_ color: UIColor) {
    openerAccent = color
    hero.opener.setAccent(color, animated: true)
    hero.header.scale.setAccent(color)
    if view.window != nil, navigationController?.topViewController === self {
      AppNavigator.shared.setFocusAccent(color)
    }
  }
}
