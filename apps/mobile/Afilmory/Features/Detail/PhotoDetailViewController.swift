import UIKit

final class PhotoDetailViewController: UIViewController {
  let photos: [GalleryPhoto]
  let numbers: [String: Int]
  let gallerySlug: String?
  let sourceProvider: (String) -> UIView?
  let social: DetailSocial
  let backdrop = UIView()
  let photoLayer = UIView()
  let photoDefocus = AFBlurView()
  let sheet = DetailSheetView()
  let infoColumn = DetailInfoColumn()
  let chips = DetailChipsBar()
  let rail = DetailReactionRail()
  let topChrome = ExhibitionPassthroughView()
  lazy var pager = UICollectionView(frame: .zero, collectionViewLayout: Self.pagerLayout())
  lazy var backButton = AFGlassButton.symbol("chevron.left", accessibilityLabel: String(localized: "Back")) { [weak self] in
    self?.close()
  }
  lazy var moreButton = AFGlassButton.symbol("ellipsis", accessibilityLabel: String(localized: "More")) {}
  var rules = DetailGestureRules(detent: .collapsed, isZoomed: false)
  var currentIndex: Int
  var sheetProgress: CGFloat = 0
  var sheetDragStartProgress: CGFloat = 0
  var dismissTranslation: CGFloat = 0
  var dismissDriftX: CGFloat = 0
  var isRailShown = false
  var initialPlaceholder: UIImage?
  var hasLaidOutPager = false
  var isTransitioning = true
  var isFullScreen = false
  var pagerWidth: CGFloat = 0
  var commentsColumn: DetailCommentsColumn?
  private(set) var transitionDelegateRef: DetailTransitionDelegate?

  init(
    photos: [GalleryPhoto],
    index: Int,
    numbers: [String: Int]? = nil,
    gallerySlug: String?,
    sourceProvider: @escaping (String) -> UIView?
  ) {
    self.photos = photos
    self.numbers = numbers ?? ExhibitionLibrary.numbering(ExhibitionLibrary.chronological(photos))
    self.gallerySlug = gallerySlug
    self.sourceProvider = sourceProvider
    social = DetailSocial(gallerySlug: gallerySlug)
    currentIndex = min(max(0, index), max(0, photos.count - 1))
    super.init(nibName: nil, bundle: nil)
    initialPlaceholder = currentPhoto.flatMap { (sourceProvider($0.id) as? UIImageView)?.image }
    let delegate = DetailTransitionDelegate()
    transitionDelegateRef = delegate
    transitioningDelegate = delegate
    modalPresentationStyle = .custom
    modalPresentationCapturesStatusBarAppearance = true
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }
  override var prefersStatusBarHidden: Bool { rules.isZoomed }
  override var prefersHomeIndicatorAutoHidden: Bool { rules.isZoomed }

  var currentPhoto: GalleryPhoto? {
    photos.indices.contains(currentIndex) ? photos[currentIndex] : nil
  }

  func number(of photo: GalleryPhoto) -> Int {
    numbers[photo.id] ?? (photos.firstIndex { $0.id == photo.id } ?? 0) + 1
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    overrideUserInterfaceStyle = .dark
    view.backgroundColor = .clear
    view.accessibilityViewIsModal = true
    backdrop.backgroundColor = AFColor.ground
    view.addSubview(backdrop)
    configurePager()
    photoLayer.addSubview(pager)
    photoLayer.addSubview(photoDefocus)
    view.addSubview(photoLayer)
    topChrome.addSubview(backButton)
    topChrome.addSubview(moreButton)
    view.addSubview(topChrome)
    view.addSubview(chips)
    view.addSubview(sheet)
    infoColumn.isHidden = true
    view.addSubview(infoColumn)
    rail.alpha = 0
    rail.isHidden = true
    view.addSubview(rail)
    wireSheet()
    wireSocial()
    installGestures()
    moreButton.menu = moreMenu()
    moreButton.showsMenuAsPrimaryAction = true
    registerForTraitChanges([DuoContextTrait.self]) { (detail: PhotoDetailViewController, _: UITraitCollection) in
      detail.duoContextChanged()
    }
    applyVerticalBar()
    showPage(currentIndex, animated: false)
  }

  override func viewIsAppearing(_ animated: Bool) {
    super.viewIsAppearing(animated)
    applyVerticalBar()
  }

  override func viewDidLayoutSubviews() {
    super.viewDidLayoutSubviews()
    backdrop.frame = view.bounds
    photoLayer.bounds = CGRect(origin: .zero, size: view.bounds.size)
    photoLayer.center = CGPoint(x: view.bounds.midX, y: view.bounds.midY)
    pager.frame = photoLayer.bounds
    photoDefocus.frame = photoLayer.bounds
    resnapPagerIfResized()
    let safeTop = view.safeAreaInsets.top
    topChrome.frame = CGRect(x: 0, y: max(safeTop, 20) + 4, width: view.bounds.width, height: 44)
    backButton.frame = CGRect(x: 12, y: 0, width: 44, height: 44)
    moreButton.frame = CGRect(x: view.bounds.width - 56, y: 0, width: 44, height: 44)
    layoutSheet()
    let area = photoArea
    for cell in pager.visibleCells.compactMap({ $0 as? DetailPageCell }) {
      cell.photoArea = area
      cell.progressFloor = progressFloor
    }
    if !hasLaidOutPager, pager.bounds.width > 0 {
      hasLaidOutPager = true
      pager.layoutIfNeeded()
      pager.scrollToItem(at: IndexPath(item: currentIndex, section: 0), at: .centeredHorizontally, animated: false)
    }
  }

  var collapsedHeight: CGFloat {
    sheet.collapsedHeight(width: chromeBounds.width - 16)
  }

  var photoArea: CGRect {
    if let split = duoSplit { return duoPhotoArea(split) }
    return DetailGeometry.photoArea(
      bounds: chromeBounds,
      safeTop: view.safeAreaInsets.top,
      collapsedSheet: DetailGeometry.collapsedSheet(bounds: chromeBounds, height: collapsedHeight)
    )
  }

  var progressFloor: CGFloat? {
    guard duoSplit == nil else { return nil }
    return DetailGeometry.chips(sheet: DetailGeometry.collapsedSheet(bounds: chromeBounds, height: collapsedHeight)).minY - 8
  }

  func layoutSheet() {
    if let split = duoSplit {
      layoutDuo(split)
      return
    }
    let frame = DetailGeometry.sheet(bounds: chromeBounds, safeTop: view.safeAreaInsets.top, collapsedHeight: collapsedHeight, progress: sheetProgress)
    sheet.bounds = CGRect(origin: .zero, size: frame.size)
    sheet.center = CGPoint(x: frame.midX, y: frame.midY)
    chips.bounds = CGRect(origin: .zero, size: DetailGeometry.chips(sheet: frame).size)
    let chipsFrame = DetailGeometry.chips(sheet: frame)
    chips.center = CGPoint(x: chipsFrame.midX, y: chipsFrame.midY)
    let railSize = rail.intrinsicContentSize
    rail.frame = CGRect(x: chipsFrame.maxX - railSize.width, y: chipsFrame.minY - railSize.height - 10, width: railSize.width, height: railSize.height)
    sheet.setExpanded(progress: sheetProgress)
    applyPhotoRecession()
  }

  func applyPhotoRecession() {
    guard duoSplit == nil else { return }
    if dismissTranslation > 0 {
      let progress = min(1, dismissTranslation / max(1, view.bounds.height * 0.6))
      let scale = 1 - 0.25 * progress
      photoLayer.transform = CGAffineTransform(translationX: dismissDriftX, y: dismissTranslation).scaledBy(x: scale, y: scale)
      photoDefocus.radius = 0
      photoLayer.alpha = 1
      return
    }
    let t = sheetProgress
    if AFMotion.reduceMotion {
      photoLayer.transform = .identity
      photoDefocus.radius = 0
    } else {
      let scale = 1 - 0.14 * t
      photoLayer.transform = CGAffineTransform(translationX: 0, y: -24 * t).scaledBy(x: scale, y: scale)
      photoDefocus.radius = 8 * t
    }
    photoLayer.alpha = 1 - 0.45 * t
  }

  func showPage(_ index: Int, animated: Bool) {
    guard photos.indices.contains(index) else { return }
    if index != currentIndex { closeCommentsColumn() }
    let photo = photos[index]
    currentIndex = index
    let model = DetailSheetModel.make(photo: photo, number: number(of: photo), localeIdentifier: PhotoDateLanguage.activeLocaleIdentifier)
    let info = DuoInfoModel.make(photo: photo, number: number(of: photo), localeIdentifier: PhotoDateLanguage.activeLocaleIdentifier)
    let accent = AccentStore.shared.cachedAccent(photoId: photo.id) ?? AFColor.accentFallback
    let apply = {
      self.sheet.configure(model: model, accent: accent, commentsEnabled: self.social.isAvailable)
      self.infoColumn.configure(model: info, accent: accent, commentsEnabled: self.social.isAvailable)
      self.view.setNeedsLayout()
      self.view.layoutIfNeeded()
    }
    if animated, !AFMotion.reduceMotion {
      UIView.transition(with: duoSplit == nil ? sheet : infoColumn, duration: 0.28, options: [.transitionCrossDissolve, .allowUserInteraction], animations: apply)
    } else {
      apply()
    }
    chips.configure(number: model.number, accent: accent, animated: animated)
    chips.shareButton.isEnabled = gallerySlug != nil
    chips.reactionButton.isEnabled = social.isAvailable
    AccentStore.shared.accent(photoId: photo.id, thumbnailURL: URL(string: photo.thumbnailUrl)) { [weak self] color in
      guard let self, currentPhoto?.id == photo.id else { return }
      chips.setAccent(color)
      sheet.setAccent(color)
      infoColumn.setAccent(color)
    }
    social.focus(photoID: photo.id)
    hideRail()
    moreButton.menu = moreMenu()
  }

  func setChromeVisible(_ visible: Bool, animated: Bool) {
    let changes = {
      [self.sheet, self.chips, self.topChrome].forEach { $0.alpha = visible ? 1 : 0 }
      self.backdrop.backgroundColor = visible ? AFColor.ground : .black
    }
    [sheet, chips, topChrome].forEach { $0.isUserInteractionEnabled = visible }
    if !visible { hideRail() }
    animated ? UIView.animate(withDuration: 0.25, delay: 0, options: [.allowUserInteraction, .beginFromCurrentState], animations: changes) : changes()
    setNeedsStatusBarAppearanceUpdate()
    setNeedsUpdateOfHomeIndicatorAutoHidden()
  }

  func applyRules() {
    pager.isScrollEnabled = rules.pagingEnabled
    for cell in pager.visibleCells.compactMap({ $0 as? DetailPageCell }) {
      cell.scrollView.pinchGestureRecognizer?.isEnabled = rules.zoomEnabled
    }
    setChromeVisible(rules.chromeVisible, animated: true)
  }

  func close() {
    social.flush()
    dismiss(animated: true)
  }

  var currentCell: DetailPageCell? {
    pager.cellForItem(at: IndexPath(item: currentIndex, section: 0)) as? DetailPageCell
  }

  private static func pagerLayout() -> UICollectionViewFlowLayout {
    let layout = UICollectionViewFlowLayout()
    layout.scrollDirection = .horizontal
    layout.minimumLineSpacing = 0
    layout.minimumInteritemSpacing = 0
    return layout
  }
}
