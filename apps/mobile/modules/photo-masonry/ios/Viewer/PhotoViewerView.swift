import SDWebImage
import UIKit

final class PhotoViewerView: UIView {
  var onNativeIndexChange: ((MasonryPhoto, Int) -> Void)?
  var onNativeInfoRequest: (() -> Void)?
  var onNativeRequestClose: (() -> Void)?
  var onNativeZoomChange: ((Bool) -> Void)?
  var onActivePhotoLoadStateChange: ((PhotoOriginalLoadState) -> Void)?

  var keyboardCloseTitle = ""
  var keyboardInfoTitle = ""
  var keyboardNextTitle = ""
  var keyboardPreviousTitle = ""
  var interactiveDismissEnabled = true
  var infoPresented = false

  var livePhotoStrings = LivePhotoBadgeStrings() {
    didSet {
      collectionView.reloadData()
    }
  }

  private var livePhotoModes: [String: LivePhotoPlaybackMode] = [:]

  var initialIndex = 0 {
    didSet {
      hasPositionedInitialPhoto = false
      setNeedsLayout()
    }
  }

  private var photos: [MasonryPhoto] = []
  private let layout = UICollectionViewFlowLayout()
  private var collectionView: UICollectionView!
  private var currentIndex = 0
  private var hasPositionedInitialPhoto = false
  private var reportedZoomState = false
  private var externalTapGestureRecognizer: UITapGestureRecognizer?
  private weak var externalDismissGestureRecognizer: UIPanGestureRecognizer?
  private var prefetchTokens: [Int: SDWebImagePrefetchToken] = [:]
  private var liveBadgeAlpha: CGFloat = 1
  private var pinchDismissalActive = false

  override init(frame: CGRect) {
    super.init(frame: frame)

    backgroundColor = .clear
    layout.minimumInteritemSpacing = 0
    layout.minimumLineSpacing = 0
    layout.scrollDirection = .horizontal

    collectionView = UICollectionView(frame: .zero, collectionViewLayout: layout)
    collectionView.backgroundColor = .clear
    collectionView.contentInsetAdjustmentBehavior = .never
    collectionView.dataSource = self
    collectionView.delegate = self
    collectionView.decelerationRate = .fast
    collectionView.isPagingEnabled = true
    collectionView.showsHorizontalScrollIndicator = false
    collectionView.register(PhotoViewerCell.self, forCellWithReuseIdentifier: PhotoViewerCell.reuseIdentifier)
    addSubview(collectionView)

  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) is not supported")
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    guard bounds.width > 0, bounds.height > 0 else { return }

    let sizeChanged = layout.itemSize != bounds.size
    if sizeChanged, hasPositionedInitialPhoto, collectionView.bounds.width > 0 {
      updateCurrentIndexFromOffset()
    }
    collectionView.frame = bounds
    if sizeChanged {
      cancelPrefetches()
      layout.itemSize = bounds.size
      layout.invalidateLayout()
    }

    positionInitialPhotoIfNeeded()
    if sizeChanged, hasPositionedInitialPhoto {
      collectionView.layoutIfNeeded()
      collectionView.setContentOffset(
        CGPoint(x: CGFloat(currentIndex) * collectionView.bounds.width, y: 0),
        animated: false
      )
      prefetchNeighborPhotos()
    }
  }

  override var canBecomeFirstResponder: Bool { true }

  override var keyCommands: [UIKeyCommand]? {
    [
      makeKeyCommand(
        input: UIKeyCommand.inputLeftArrow,
        modifiers: [],
        action: #selector(showPreviousPhoto),
        title: keyboardPreviousTitle
      ),
      makeKeyCommand(
        input: UIKeyCommand.inputRightArrow,
        modifiers: [],
        action: #selector(showNextPhoto),
        title: keyboardNextTitle
      ),
      makeKeyCommand(
        input: UIKeyCommand.inputEscape,
        modifiers: [],
        action: #selector(requestClose),
        title: keyboardCloseTitle
      ),
      makeKeyCommand(
        input: "i",
        modifiers: .command,
        action: #selector(requestInfo),
        title: keyboardInfoTitle
      ),
    ]
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    if window != nil {
      becomeFirstResponder()
    }
  }

  override func didMoveToSuperview() {
    super.didMoveToSuperview()
    guard superview == nil else { return }
    cancelPrefetches()
    deactivateVisibleCells()
  }

  func setPhotos(_ newPhotos: [MasonryPhoto]) {
    cancelPrefetches()
    deactivateVisibleCells()
    photos = newPhotos
    currentIndex = clampedIndex(initialIndex)
    hasPositionedInitialPhoto = false
    collectionView.reloadData()
    setNeedsLayout()
  }

  private func positionInitialPhotoIfNeeded() {
    guard !hasPositionedInitialPhoto, !photos.isEmpty, collectionView.bounds.width > 0 else { return }
    currentIndex = clampedIndex(initialIndex)
    collectionView.layoutIfNeeded()
    collectionView.setContentOffset(
      CGPoint(x: CGFloat(currentIndex) * collectionView.bounds.width, y: 0),
      animated: false
    )
    hasPositionedInitialPhoto = true
    updateActivePhoto()
  }

  private func clampedIndex(_ index: Int) -> Int {
    guard !photos.isEmpty else { return 0 }
    return min(max(index, 0), photos.count - 1)
  }

  private func updateCurrentIndexFromOffset() {
    guard collectionView.bounds.width > 0, !photos.isEmpty else { return }
    let index = clampedIndex(Int(round(collectionView.contentOffset.x / collectionView.bounds.width)))
    guard index != currentIndex else { return }
    currentIndex = index
    updateActivePhoto()
  }

  private func updateActivePhoto() {
    guard photos.indices.contains(currentIndex) else { return }
    let photo = photos[currentIndex]
    onNativeIndexChange?(photo, currentIndex)
    onActivePhotoLoadStateChange?(currentCell()?.originalLoadState ?? .idle)
    updateVisibleCellActivity()
    prefetchNeighborPhotos()
  }

  private func prefetchNeighborPhotos() {
    let viewportSize = collectionView.bounds.size
    guard viewportSize.width > 0, viewportSize.height > 0, !photos.isEmpty else { return }

    let desiredIndices = Set([currentIndex - 1, currentIndex + 1].filter { photos.indices.contains($0) })
    let staleIndices = prefetchTokens.keys.filter { !desiredIndices.contains($0) }
    for index in staleIndices {
      prefetchTokens[index]?.cancel()
      prefetchTokens.removeValue(forKey: index)
    }

    let screenScale = window?.screen.scale ?? UIScreen.main.scale
    for index in desiredIndices where prefetchTokens[index] == nil {
      let photo = photos[index]
      guard let url = URL(string: photo.originalUrl), !photo.originalUrl.isEmpty else { continue }
      let pixelSize = PhotoViewerImageSizing.pixelSize(
        for: photo,
        viewportSize: viewportSize,
        screenScale: screenScale,
        tier: 1
      )
      prefetchTokens[index] = SDWebImagePrefetcher.shared.prefetchURLs(
        [url],
        options: [.lowPriority, .retryFailed, .scaleDownLargeImages],
        context: [
          .imagePreserveAspectRatio: true,
          .imageThumbnailPixelSize: NSValue(cgSize: pixelSize),
        ],
        progress: nil,
        completed: nil
      )
    }
  }

  private func cancelPrefetches() {
    for token in prefetchTokens.values {
      token.cancel()
    }
    prefetchTokens.removeAll()
  }

  private func currentCell() -> PhotoViewerCell? {
    collectionView.cellForItem(at: IndexPath(item: currentIndex, section: 0)) as? PhotoViewerCell
  }

  private func updateVisibleCellActivity() {
    for case let cell as PhotoViewerCell in collectionView.visibleCells {
      guard let indexPath = collectionView.indexPath(for: cell) else { continue }
      cell.setActive(indexPath.item == currentIndex)
    }
    updatePagingEnabled()
  }

  private func deactivateVisibleCells() {
    for case let cell as PhotoViewerCell in collectionView.visibleCells {
      cell.setActive(false)
      cell.endPinchDismissal()
    }
    pinchDismissalActive = false
    collectionView.isScrollEnabled = true
  }

  private func updatePagingEnabled() {
    let currentCell = currentCell()
    let zoomed = currentCell?.isZoomed ?? false
    collectionView.isScrollEnabled = !pinchDismissalActive
      && !zoomed
      && !(currentCell?.blocksPaging ?? false)
    guard zoomed != reportedZoomState else { return }
    reportedZoomState = zoomed
    onNativeZoomChange?(zoomed)
  }

  private func makeKeyCommand(
    input: String,
    modifiers: UIKeyModifierFlags,
    action: Selector,
    title: String
  ) -> UIKeyCommand {
    let command = UIKeyCommand(input: input, modifierFlags: modifiers, action: action)
    command.wantsPriorityOverSystemBehavior = true
    if !title.isEmpty {
      command.discoverabilityTitle = title
    }
    return command
  }

  private func navigate(by delta: Int) {
    guard !photos.isEmpty else { return }
    let nextIndex = clampedIndex(currentIndex + delta)
    guard nextIndex != currentIndex else { return }
    currentCell()?.setActive(false)
    collectionView.setContentOffset(
      CGPoint(x: CGFloat(nextIndex) * collectionView.bounds.width, y: 0),
      animated: true
    )
  }

  @objc private func showPreviousPhoto() {
    navigate(by: -1)
  }

  @objc private func showNextPhoto() {
    navigate(by: 1)
  }

  @objc private func requestClose() {
    onNativeRequestClose?()
  }

  @objc private func requestInfo() {
    onNativeInfoRequest?()
  }

  func configureExternalInfoGesture(_ gestureRecognizer: UIPanGestureRecognizer) {
    collectionView.panGestureRecognizer.require(toFail: gestureRecognizer)
  }

  func configureExternalDismissGesture(_ gestureRecognizer: UIPanGestureRecognizer) {
    externalDismissGestureRecognizer = gestureRecognizer
    collectionView.panGestureRecognizer.require(toFail: gestureRecognizer)
    for case let cell as PhotoViewerCell in collectionView.visibleCells {
      cell.configureExternalDismissGesture(gestureRecognizer)
    }
  }

  func currentPhotoId() -> String? {
    guard photos.indices.contains(currentIndex) else { return nil }
    return photos[currentIndex].id
  }

  func currentImageFrame() -> CGRect? {
    if let frame = currentCell()?.imageFrame(in: self), frame.width > 0, frame.height > 0 {
      return frame
    }
    guard photos.indices.contains(currentIndex), bounds.width > 0, bounds.height > 0 else {
      return nil
    }
    let photo = photos[currentIndex]
    let width = CGFloat(photo.width)
    let height = CGFloat(photo.height)
    guard width > 0, height > 0 else { return bounds }
    return PhotoTransitionGeometry.aspectFitRect(aspectRatio: width / height, in: bounds)
  }

  func setOpeningPlaceholderImage(_ image: UIImage) {
    currentCell()?.setOpeningPlaceholderImage(image)
  }

  func configureExternalTapGesture(_ gestureRecognizer: UITapGestureRecognizer) {
    externalTapGestureRecognizer = gestureRecognizer
  }

  func currentZoomScale() -> CGFloat {
    currentCell()?.currentZoomScale ?? 1
  }

  func beginPinchDismissal() {
    pinchDismissalActive = true
    currentCell()?.beginPinchDismissal()
    updatePagingEnabled()
  }

  func maintainPinchDismissal() {
    currentCell()?.maintainPinchDismissal()
  }

  func endPinchDismissal() {
    currentCell()?.endPinchDismissal()
    pinchDismissalActive = false
    updatePagingEnabled()
  }

  func setLiveBadgeAlpha(_ alpha: CGFloat) {
    liveBadgeAlpha = alpha
    for case let cell as PhotoViewerCell in collectionView.visibleCells {
      cell.setLiveBadgeAlpha(alpha)
    }
  }

  func allowsInfoGesture() -> Bool {
    !(currentCell()?.isZoomed ?? false) && !(currentCell()?.blocksPaging ?? false)
  }

  func allowsDismissGesture() -> Bool {
    !(currentCell()?.blocksPaging ?? false)
  }

  func allowsPinchDismissGesture() -> Bool {
    guard let cell = currentCell() else { return false }
    return !cell.blocksPaging && cell.allowsPinchDismissGesture
  }

  func mediaBottomInset(in viewportSize: CGSize) -> CGFloat {
    guard photos.indices.contains(currentIndex), viewportSize.width > 0, viewportSize.height > 0 else {
      return 0
    }
    let aspectRatio = PhotoViewerImageSizing.aspectRatio(for: photos[currentIndex])
    var renderedHeight = viewportSize.width / aspectRatio
    if renderedHeight > viewportSize.height {
      renderedHeight = viewportSize.height
    }
    return max(0, (viewportSize.height - renderedHeight) / 2)
  }
}

extension PhotoViewerView: UICollectionViewDataSource {
  func collectionView(
    _ collectionView: UICollectionView,
    numberOfItemsInSection section: Int
  ) -> Int {
    photos.count
  }

  func collectionView(
    _ collectionView: UICollectionView,
    cellForItemAt indexPath: IndexPath
  ) -> UICollectionViewCell {
    let cell = collectionView.dequeueReusableCell(
      withReuseIdentifier: PhotoViewerCell.reuseIdentifier,
      for: indexPath
    ) as! PhotoViewerCell
    cell.onZoomStateChange = { [weak self, weak cell] _ in
      guard let self, cell === self.currentCell() else { return }
      self.updatePagingEnabled()
    }
    cell.onLivePhotoPlaybackStateChange = { [weak self, weak cell] _ in
      guard let self, cell === self.currentCell() else { return }
      self.updatePagingEnabled()
    }
    cell.onLivePhotoModeChange = { [weak self] photoId, mode in
      self?.livePhotoModes[photoId] = mode
    }
    cell.onOriginalLoadStateChange = { [weak self, weak cell] state in
      guard let self, let cell, cell.representedPhotoId == self.currentPhotoId() else { return }
      self.onActivePhotoLoadStateChange?(state)
    }
    let photo = photos[indexPath.item]
    cell.configure(
      with: photo,
      viewportSize: collectionView.bounds.size,
      livePhotoStrings: livePhotoStrings,
      livePhotoMode: livePhotoModes[photo.id] ?? .live
    )
    cell.setActive(indexPath.item == currentIndex)
    cell.setLiveBadgeAlpha(liveBadgeAlpha)
    if let externalTapGestureRecognizer {
      externalTapGestureRecognizer.require(toFail: cell.doubleTapGestureRecognizer)
    }
    if let externalDismissGestureRecognizer {
      cell.configureExternalDismissGesture(externalDismissGestureRecognizer)
    }
    return cell
  }
}

extension PhotoViewerView: UICollectionViewDelegate {
  func collectionView(
    _ collectionView: UICollectionView,
    willDisplay cell: UICollectionViewCell,
    forItemAt indexPath: IndexPath
  ) {
    (cell as? PhotoViewerCell)?.setActive(indexPath.item == currentIndex)
  }

  func collectionView(
    _ collectionView: UICollectionView,
    didEndDisplaying cell: UICollectionViewCell,
    forItemAt indexPath: IndexPath
  ) {
    (cell as? PhotoViewerCell)?.setActive(false)
  }

  func scrollViewDidEndDecelerating(_ scrollView: UIScrollView) {
    updateCurrentIndexFromOffset()
  }

  func scrollViewDidEndDragging(_ scrollView: UIScrollView, willDecelerate decelerate: Bool) {
    if !decelerate {
      updateCurrentIndexFromOffset()
    }
  }

  func scrollViewDidEndScrollingAnimation(_ scrollView: UIScrollView) {
    updateCurrentIndexFromOffset()
  }
}
