import UIKit

@MainActor
protocol ViewingPageHost: AnyObject {
  func pageOpenGallery(_ header: GalleryHeaderModel)
  func pageOpenPhoto(_ cover: GalleryCoverPhoto, covers: [GalleryCoverPhoto], gallery: GalleryHeaderModel, source: @escaping (String) -> UIView?)
  func pageAccentChanged(_ color: UIColor, page: ViewingPage)
  func pageShowGalleries()
  func pageRequestSignIn()
  func pageFollowFailed(_ error: Error)
}

class ViewingPageController: UIViewController, UICollectionViewDelegateFlowLayout {
  let page: ViewingPage
  let model: ViewingModel
  weak var host: ViewingPageHost?
  let layout = ViewingColumnsLayout()
  private(set) lazy var collectionView = UICollectionView(frame: .zero, collectionViewLayout: layout)
  let stateView = ViewingStateView()
  private var observation: ViewingModel.Observation?
  private var accentWork: DispatchWorkItem?
  private var lastAccentPhotoID: String?

  var headerHeight: CGFloat = 0 {
    didSet { if headerHeight != oldValue { applyInsets() } }
  }

  var extraTopInset: CGFloat { 0 }

  init(page: ViewingPage, model: ViewingModel) {
    self.page = page
    self.model = model
    super.init(nibName: nil, bundle: nil)
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = AFColor.ground
    layout.minimumLineSpacing = 12
    layout.sectionInset = UIEdgeInsets(top: 0, left: 16, bottom: 0, right: 16)
    collectionView.backgroundColor = AFColor.ground
    collectionView.contentInsetAdjustmentBehavior = .never
    collectionView.alwaysBounceVertical = true
    collectionView.showsVerticalScrollIndicator = false
    collectionView.keyboardDismissMode = .onDrag
    collectionView.delegate = self
    collectionView.frame = view.bounds
    collectionView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    collectionView.backgroundView = stateView
    view.addSubview(collectionView)
    observation = model.observe { [weak self] change in self?.modelChanged(change) }
    registerForTraitChanges([UITraitPreferredContentSizeCategory.self]) { (controller: ViewingPageController, _: UITraitCollection) in
      controller.layout.invalidateLayout()
      controller.collectionView.reloadData()
    }
    registerForTraitChanges([DuoContextTrait.self]) { (controller: ViewingPageController, _: UITraitCollection) in
      controller.updateColumns()
    }
  }

  override func viewDidLayoutSubviews() {
    super.viewDidLayoutSubviews()
    updateColumns()
  }

  private func updateColumns() {
    let safe = view.safeAreaInsets
    let inset = UIEdgeInsets(top: 0, left: 16 + safe.left, bottom: 0, right: 16 + safe.right)
    if layout.sectionInset != inset {
      layout.sectionInset = inset
      layout.invalidateLayout()
    }
    let context = traitCollection.duoContext
    let content = CGRect(x: safe.left, y: 0, width: max(0, collectionView.bounds.width - safe.left - safe.right), height: collectionView.bounds.height)
    let fold = DuoGeometry.fold(of: context, in: collectionView).map { CGRect(x: $0.minX, y: 0, width: $0.width, height: content.height) }
    layout.columns = ViewingColumnsLayout.columns(for: context, in: content, fold: fold, inset: 16, spacing: 12)
  }

  override func viewSafeAreaInsetsDidChange() {
    super.viewSafeAreaInsetsDidChange()
    applyInsets()
  }

  override func viewWillTransition(to size: CGSize, with coordinator: UIViewControllerTransitionCoordinator) {
    super.viewWillTransition(to: size, with: coordinator)
    coordinator.animate(alongsideTransition: { _ in self.layout.invalidateLayout() })
  }

  func applyInsets() {
    let top = headerHeight + extraTopInset
    let bottom = view.safeAreaInsets.bottom + 32
    collectionView.contentInset = UIEdgeInsets(top: top, left: 0, bottom: bottom, right: 0)
    collectionView.verticalScrollIndicatorInsets = UIEdgeInsets(top: headerHeight, left: 0, bottom: bottom, right: 0)
    stateView.topInset = top
    insetsDidChange()
  }

  func insetsDidChange() {}

  func modelChanged(_: ViewingModel.Change) {}

  var cardWidth: CGFloat {
    max(0, collectionView.bounds.width - layout.sectionInset.left - layout.sectionInset.right)
  }

  func cardWidth(at indexPath: IndexPath) -> CGFloat {
    layout.itemWidth(at: indexPath) ?? cardWidth
  }

  func scrollToTop(animated: Bool) {
    collectionView.setContentOffset(CGPoint(x: 0, y: -collectionView.adjustedContentInset.top), animated: animated)
  }

  func sourceView(cell: ViewingCardCell, photoID: String) -> UIView? {
    guard cell.window != nil else { return nil }
    return cell.mosaic.sourceView(for: photoID)
  }

  func scrollViewDidScroll(_: UIScrollView) {
    scheduleAccentUpdate()
  }

  func scheduleAccentUpdate(delay: TimeInterval = 0.15) {
    accentWork?.cancel()
    let work = DispatchWorkItem { [weak self] in self?.reportAccent() }
    accentWork = work
    DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: work)
  }

  func reportCurrentAccent() {
    lastAccentPhotoID = nil
    reportAccent()
  }

  private func reportAccent() {
    let viewportMid = collectionView.contentOffset.y + collectionView.contentInset.top
      + (collectionView.bounds.height - collectionView.contentInset.top - collectionView.contentInset.bottom) / 2
    let nearest = collectionView.visibleCells
      .compactMap { $0 as? ViewingCardCell }
      .min { abs($0.frame.midY - viewportMid) < abs($1.frame.midY - viewportMid) }
    guard let photo = nearest?.accentPhoto else {
      if nearest == nil, lastAccentPhotoID != "" {
        lastAccentPhotoID = ""
        host?.pageAccentChanged(AFColor.accentFallback, page: page)
      }
      return
    }
    guard photo.id != lastAccentPhotoID else { return }
    lastAccentPhotoID = photo.id
    AccentStore.shared.accent(photoId: photo.id, thumbnailURL: URL(string: photo.thumbnailUrl)) { [weak self] color in
      guard let self, self.lastAccentPhotoID == photo.id else { return }
      self.host?.pageAccentChanged(color, page: self.page)
    }
  }
}
