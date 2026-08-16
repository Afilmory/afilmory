import UIKit

final class PhotoDetailView: UIView, UIGestureRecognizerDelegate {
  var onNativeScreenTraitsChange: ((Bool, Bool) -> Void)?
  var onNativeTransitionClose: (() -> Void)?
  var onNativeCommentsRequest: ((String, Int) -> Void)?
  var onNativeIndexChange: ((String, Int) -> Void)?
  var onNativeReactionRequest: ((String, Int, String, Int) -> Void)?

  private let viewer: PhotoViewerView
  private let backgroundView = UIView()
  private let mediaViewport = UIView()
  private let infoView = PhotoDetailInfoView()
  private let topScrim = PhotoDetailScrimView(edge: .top)
  private let bottomScrim = PhotoDetailScrimView(edge: .bottom)
  private let navigationBar = PhotoDetailNavigationBar()
  private let toolbar = PhotoDetailToolbar()
  private let loadingPillHost = UIView()
  private let loadingPill = PhotoDetailLoadingPillView()
  private let reactionRail = PhotoDetailReactionRailView()
  private let reactionBurst = PhotoDetailReactionBurstLayer()
  private lazy var inspector = PhotoDetailInspectorPresenter(
    host: self,
    mediaViewport: mediaViewport,
    viewer: viewer,
    infoView: infoView
  )
  private lazy var tapGestureRecognizer: UITapGestureRecognizer = {
    let recognizer = UITapGestureRecognizer(target: self, action: #selector(handleUserTap))
    recognizer.delegate = self
    recognizer.numberOfTapsRequired = 1
    return recognizer
  }()

  private var currentIndex = 0
  private var initialIndex = 0
  private var photos: [MasonryPhoto] = []
  private var gallerySlug: String?
  private var metadataByID: [String: PhotoDetailMetadata] = [:]
  private var strings = PhotoDetailStrings()
  private var commentCount = -1
  private var socialActionsEnabled = false
  private var reactionRailPresented = false
  private var reactionFailureNonce: Double = 0
  private var visibility = PhotoDetailChromeVisibility(userHidden: false, infoProgress: 0, zoomed: false)
  private var lastLayoutSize = CGSize.zero
  private var dismissalMediaAnimator: UIViewPropertyAnimator?
  private var dismissalBackdropAnimator: UIViewPropertyAnimator?
  private var dismissalChromeAnimator: UIViewPropertyAnimator?
  private var dismissalGestureOrigin = PhotoTransitionTransform(scale: 1, translation: .zero)
  private var dismissalState = PhotoTransitionTransform(scale: 1, translation: .zero)
  private var dismissalGeneration = 0

  override init(frame: CGRect) {
    viewer = PhotoViewerView(frame: .zero)
    super.init(frame: frame)

    backgroundColor = .clear
    clipsToBounds = true
    accessibilityIdentifier = "photo-detail-native"

    backgroundView.backgroundColor = .black
    addSubview(backgroundView)

    mediaViewport.backgroundColor = .clear
    mediaViewport.clipsToBounds = true
    addSubview(mediaViewport)
    mediaViewport.addSubview(viewer)
    addSubview(bottomScrim)
    addSubview(infoView)
    addSubview(topScrim)
    addSubview(navigationBar)
    addSubview(toolbar)
    loadingPillHost.isUserInteractionEnabled = false
    loadingPillHost.addSubview(loadingPill)
    addSubview(loadingPillHost)
    addSubview(reactionBurst)
    addSubview(reactionRail)

    configureChrome()
    configureViewer()
    configureInspector()
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) is not supported")
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    guard bounds.width > 0, bounds.height > 0 else { return }

    backgroundView.frame = bounds
    infoView.installScrollEdgeEffect(under: toolbar)
    if lastLayoutSize != bounds.size {
      inspector.stopAnimationAtCurrentPosition()
      lastLayoutSize = bounds.size
    }
    if !visibility.dismissing {
      inspector.reapplyProgress()
    }
  }

  override func safeAreaInsetsDidChange() {
    super.safeAreaInsetsDidChange()
    setNeedsLayout()
  }

  private func setOpeningChromeAlpha(_ alpha: CGFloat) {
    navigationBar.alpha = alpha
    toolbar.alpha = alpha
    topScrim.alpha = alpha
    bottomScrim.alpha = alpha
    loadingPillHost.alpha = alpha
    viewer.setLiveBadgeAlpha(alpha)
  }

  func setGallerySlug(_ slug: String?) {
    gallerySlug = slug
  }

  func setPhotos(_ photos: [MasonryPhoto]) {
    self.photos = photos
    currentIndex = clampedIndex(initialIndex)
    viewer.setPhotos(photos)
    updateCurrentMetadata()
    setNeedsLayout()
  }

  func setInitialIndex(_ index: Int) {
    initialIndex = index
    currentIndex = clampedIndex(index)
    viewer.initialIndex = index
    updateCurrentMetadata()
    setNeedsLayout()
  }

  func setMetadata(_ metadata: [PhotoDetailMetadata]) {
    metadataByID = metadata.reduce(into: [:]) { result, item in
      result[item.id] = item
    }
    updateCurrentMetadata()
  }

  func setStrings(_ strings: PhotoDetailStrings) {
    self.strings = strings
    viewer.keyboardCloseTitle = strings.close
    viewer.keyboardInfoTitle = strings.info
    viewer.keyboardNextTitle = strings.next
    viewer.keyboardPreviousTitle = strings.previous
    updateAccessibilityLabels()
  }

  func setLivePhotoStrings(_ strings: LivePhotoBadgeStrings) {
    viewer.livePhotoStrings = strings
  }

  func setCommentCount(_ count: Int) {
    commentCount = count
    updateCommentBadge()
  }

  func setReactionItems(_ items: [PhotoDetailReactionItem]) {
    reactionRail.setItems(items)
    setNeedsLayout()
  }

  func setReactionFailureNonce(_ nonce: Double) {
    let increased = nonce > reactionFailureNonce
    reactionFailureNonce = nonce
    guard increased else { return }
    reactionRail.playFailureFeedback()
  }

  func setSocialActionsEnabled(_ enabled: Bool) {
    socialActionsEnabled = enabled
    toolbar.setSocialActionsEnabled(enabled)
    if !enabled {
      setReactionRailPresented(false, animated: false)
    }
    updateCommentBadge()
    setNeedsLayout()
  }

  var transitionPhotoId: String? {
    viewer.currentPhotoId()
  }

  var transitionMediaView: UIView {
    mediaViewport
  }

  var canTransitionToSource: Bool {
    currentIndex == initialIndex
  }

  func transitionGeometry(targetRect: CGRect) -> PhotoTransitionTransform? {
    layoutIfNeeded()
    viewer.layoutIfNeeded()
    guard let imageFrame = viewer.currentImageFrame() else { return nil }
    let imageFrameInViewport = viewer.convert(imageFrame, to: mediaViewport)
    return PhotoTransitionGeometry.viewportTransform(
      imageFrame: imageFrameInViewport,
      targetRect: targetRect,
      viewportBounds: mediaViewport.bounds,
      viewportCenter: mediaViewport.center
    )
  }

  func transitionTransform(targetRect: CGRect) -> CGAffineTransform? {
    transitionGeometry(targetRect: targetRect)?.affineTransform
  }

  func setOpeningPlaceholderImage(_ image: UIImage) {
    viewer.setOpeningPlaceholderImage(image)
  }

  func prepareTransition(
    mediaTransform: CGAffineTransform,
    backdropAlpha: CGFloat,
    chromeAlpha: CGFloat
  ) {
    backgroundView.alpha = backdropAlpha
    mediaViewport.alpha = 1
    mediaViewport.transform = mediaTransform
    setOpeningChromeAlpha(chromeAlpha)
  }

  func applyTransition(
    mediaTransform: CGAffineTransform,
    mediaAlpha: CGFloat,
    backdropAlpha: CGFloat,
    chromeAlpha: CGFloat
  ) {
    mediaViewport.transform = mediaTransform
    mediaViewport.alpha = mediaAlpha
    backgroundView.alpha = backdropAlpha
    setOpeningChromeAlpha(chromeAlpha)
  }

  func completePresentedTransition() {
    viewer.endPinchDismissal()
    dismissalMediaAnimator?.stopAnimation(true)
    dismissalBackdropAnimator?.stopAnimation(true)
    dismissalChromeAnimator?.stopAnimation(true)
    dismissalMediaAnimator = nil
    dismissalBackdropAnimator = nil
    dismissalChromeAnimator = nil
    visibility.dismissing = false
    dismissalGestureOrigin = PhotoTransitionTransform(scale: 1, translation: .zero)
    dismissalState = dismissalGestureOrigin
    mediaViewport.transform = .identity
    mediaViewport.alpha = 1
    backgroundView.alpha = 1
    applyVisibility(animated: false)
    isUserInteractionEnabled = true
  }

  func beginViewControllerDismissal() {
    dismissalGeneration += 1
    visibility.dismissing = true
    settleDismissalAnimationsAtCurrentPosition()
    mediaViewport.alpha = 1
    dismissalGestureOrigin = transitionState(from: mediaViewport.transform)
    dismissalState = dismissalGestureOrigin
    setReactionRailPresented(false, animated: true)
    let changes = visibilityChanges()
    guard !UIAccessibility.isReduceMotionEnabled else {
      changes()
      return
    }
    let animator = UIViewPropertyAnimator(duration: 0.15, curve: .easeOut)
    animator.addAnimations(changes)
    animator.addCompletion { [weak self, weak animator] _ in
      guard self?.dismissalChromeAnimator === animator else { return }
      self?.dismissalChromeAnimator = nil
    }
    dismissalChromeAnimator = animator
    animator.startAnimation()
  }

  @discardableResult
  func updateViewControllerDismissal(translation: CGPoint) -> CGFloat {
    guard visibility.dismissing else { return 0 }
    let state = PhotoTransitionGeometry.dismissalDragState(
      translation: translation,
      origin: dismissalGestureOrigin
    )
    return updateViewControllerDismissal(state: state)
  }

  @discardableResult
  func updateViewControllerDismissal(state: PhotoDismissDragState) -> CGFloat {
    guard visibility.dismissing else { return 0 }
    dismissalState = state.transform
    mediaViewport.transform = state.transform.affineTransform
    mediaViewport.alpha = 1
    backgroundView.alpha = 1 - state.progress
    return state.progress
  }

  func commitViewControllerDismissal(
    target: PhotoTransitionTransform?,
    velocity: CGPoint,
    completion: @escaping () -> Void
  ) {
    let generation = dismissalGeneration
    guard !UIAccessibility.isReduceMotionEnabled else {
      if let target {
        mediaViewport.transform = target.affineTransform
      }
      backgroundView.alpha = 0
      mediaViewport.alpha = 0
      completion()
      return
    }

    if let target {
      let duration = dismissalSettlingDuration(
        from: dismissalState.translation,
        to: target.translation,
        velocity: velocity
      )
      let springVelocity = normalizedSpringVelocity(
        from: dismissalState.translation,
        to: target.translation,
        velocity: velocity
      )
      let timing = UISpringTimingParameters(
        dampingRatio: 0.92,
        initialVelocity: CGVector(dx: springVelocity, dy: springVelocity)
      )
      let animator = UIViewPropertyAnimator(duration: duration, timingParameters: timing)
      animator.addAnimations { [self] in
        mediaViewport.transform = target.affineTransform
      }
      animator.addCompletion { [weak self, weak animator] position in
        guard let self,
              dismissalMediaAnimator === animator,
              dismissalGeneration == generation,
              position == .end
        else { return }
        dismissalMediaAnimator = nil
        UIView.performWithoutAnimation {
          self.mediaViewport.alpha = 0
          completion()
          self.layoutIfNeeded()
        }
      }
      let backdropAnimator = UIViewPropertyAnimator(
        duration: min(duration, 0.24),
        curve: .easeOut
      ) { [self] in
        backgroundView.alpha = 0
      }
      backdropAnimator.addCompletion { [weak self, weak backdropAnimator] _ in
        guard self?.dismissalBackdropAnimator === backdropAnimator else { return }
        self?.dismissalBackdropAnimator = nil
      }
      dismissalState = target
      dismissalMediaAnimator = animator
      dismissalBackdropAnimator = backdropAnimator
      animator.startAnimation()
      backdropAnimator.startAnimation()
      return
    }

    let driftX = min(max(velocity.x * 0.08, -70), 70)
    let driftY = min(max(velocity.y * 0.08, 90), 260)
    let exit = PhotoTransitionTransform(
      scale: dismissalState.scale * 0.88,
      translation: CGPoint(
        x: dismissalState.translation.x + driftX,
        y: dismissalState.translation.y + driftY
      )
    )
    let animator = UIViewPropertyAnimator(duration: 0.22, curve: .easeOut)
    animator.addAnimations { [self] in
      mediaViewport.transform = exit.affineTransform
      mediaViewport.alpha = 0
      backgroundView.alpha = 0
    }
    animator.addCompletion { [weak self, weak animator] position in
      guard let self,
            dismissalMediaAnimator === animator,
            dismissalGeneration == generation,
            position == .end
      else { return }
      dismissalMediaAnimator = nil
      completion()
    }
    dismissalState = exit
    dismissalMediaAnimator = animator
    animator.startAnimation()
  }

  func cancelViewControllerDismissal() {
    cancelViewControllerDismissal(velocity: .zero) {}
  }

  func cancelViewControllerDismissal(
    velocity: CGPoint,
    completion: @escaping () -> Void
  ) {
    let generation = dismissalGeneration
    visibility.dismissing = false
    settleAnimatorAtCurrentPosition(dismissalChromeAnimator)
    dismissalChromeAnimator = nil
    let duration = dismissalSettlingDuration(
      from: dismissalState.translation,
      to: .zero,
      velocity: velocity
    )
    let springVelocity = normalizedSpringVelocity(
      from: dismissalState.translation,
      to: .zero,
      velocity: velocity
    )
    guard !UIAccessibility.isReduceMotionEnabled else {
      dismissalGestureOrigin = PhotoTransitionTransform(scale: 1, translation: .zero)
      dismissalState = dismissalGestureOrigin
      mediaViewport.transform = .identity
      mediaViewport.alpha = 1
      backgroundView.alpha = 1
      visibilityChanges()()
      completion()
      return
    }

    let timing = UISpringTimingParameters(
      dampingRatio: 0.9,
      initialVelocity: CGVector(dx: springVelocity, dy: springVelocity)
    )
    let mediaAnimator = UIViewPropertyAnimator(duration: duration, timingParameters: timing)
    mediaAnimator.addAnimations { [self] in
      mediaViewport.transform = .identity
      mediaViewport.alpha = 1
    }
    mediaAnimator.addCompletion { [weak self, weak mediaAnimator] position in
      guard let self,
            dismissalMediaAnimator === mediaAnimator,
            dismissalGeneration == generation,
            !visibility.dismissing,
            position == .end
      else { return }
      dismissalMediaAnimator = nil
      dismissalGestureOrigin = PhotoTransitionTransform(scale: 1, translation: .zero)
      dismissalState = dismissalGestureOrigin
      completion()
    }
    let backdropAnimator = UIViewPropertyAnimator(
      duration: min(duration, 0.22),
      curve: .easeOut
    ) { [self] in
      backgroundView.alpha = 1
    }
    backdropAnimator.addCompletion { [weak self, weak backdropAnimator] _ in
      guard self?.dismissalBackdropAnimator === backdropAnimator else { return }
      self?.dismissalBackdropAnimator = nil
    }
    let chromeDelay = min(duration * 0.28, 0.12)
    let chromeAnimator = UIViewPropertyAnimator(
      duration: min(duration - chromeDelay, 0.24),
      curve: .easeOut
    )
    chromeAnimator.addAnimations(visibilityChanges())
    chromeAnimator.addCompletion { [weak self, weak chromeAnimator] _ in
      guard self?.dismissalChromeAnimator === chromeAnimator else { return }
      self?.dismissalChromeAnimator = nil
    }
    dismissalMediaAnimator = mediaAnimator
    dismissalBackdropAnimator = backdropAnimator
    dismissalChromeAnimator = chromeAnimator
    mediaAnimator.startAnimation()
    backdropAnimator.startAnimation()
    chromeAnimator.startAnimation(afterDelay: chromeDelay)
  }

  private func settleDismissalAnimationsAtCurrentPosition() {
    settleAnimatorAtCurrentPosition(dismissalMediaAnimator)
    settleAnimatorAtCurrentPosition(dismissalBackdropAnimator)
    settleAnimatorAtCurrentPosition(dismissalChromeAnimator)
    dismissalMediaAnimator = nil
    dismissalBackdropAnimator = nil
    dismissalChromeAnimator = nil
  }

  private func settleAnimatorAtCurrentPosition(_ animator: UIViewPropertyAnimator?) {
    guard let animator, animator.state == .active else { return }
    animator.stopAnimation(false)
    animator.finishAnimation(at: .current)
  }

  private func transitionState(from transform: CGAffineTransform) -> PhotoTransitionTransform {
    PhotoTransitionTransform(
      scale: hypot(transform.a, transform.c),
      translation: CGPoint(x: transform.tx, y: transform.ty)
    )
  }

  private func normalizedSpringVelocity(
    from current: CGPoint,
    to target: CGPoint,
    velocity: CGPoint
  ) -> CGFloat {
    let delta = CGPoint(x: target.x - current.x, y: target.y - current.y)
    let squaredDistance = delta.x * delta.x + delta.y * delta.y
    guard squaredDistance > 1 else { return 0 }
    let projectedVelocity = (velocity.x * delta.x + velocity.y * delta.y) / squaredDistance
    return min(max(projectedVelocity, -1.2), 3)
  }

  private func dismissalSettlingDuration(
    from current: CGPoint,
    to target: CGPoint,
    velocity: CGPoint
  ) -> TimeInterval {
    let delta = CGPoint(x: target.x - current.x, y: target.y - current.y)
    let distance = hypot(delta.x, delta.y)
    guard distance > 1 else { return 0.26 }
    let velocityTowardTarget = max(
      0,
      (velocity.x * delta.x + velocity.y * delta.y) / distance
    )
    let distanceAddition = min(distance / 1_200, 0.14)
    let velocityReduction = min(velocityTowardTarget / 12_000, 0.08)
    return min(max(0.28 + distanceAddition - velocityReduction, 0.26), 0.42)
  }

  func canBeginViewControllerDismissal() -> Bool {
    !visibility.dismissing
      && viewer.interactiveDismissEnabled
      && inspector.progress <= 0.001
      && viewer.allowsDismissGesture()
  }

  func canBeginViewerPinchDismissal() -> Bool {
    canBeginViewControllerDismissal() && viewer.allowsPinchDismissGesture()
  }

  func configureExternalDismissGesture(_ gestureRecognizer: UIPanGestureRecognizer) {
    viewer.configureExternalDismissGesture(gestureRecognizer)
  }

  func currentViewerZoomScale() -> CGFloat {
    viewer.currentZoomScale()
  }

  func beginViewerPinchDismissal() {
    viewer.beginPinchDismissal()
  }

  func maintainViewerPinchDismissal() {
    viewer.maintainPinchDismissal()
  }

  func endViewerPinchDismissal() {
    viewer.endPinchDismissal()
  }

  private func configureChrome() {
    navigationBar.onRequestClose = { [weak self] in self?.requestClose() }

    toolbar.onShare = { [weak self] in self?.shareCurrentPhoto() }
    toolbar.onInfo = { [weak self] in self?.toggleInfo() }
    toolbar.onComments = { [weak self] in self?.requestComments() }
    toolbar.onReactions = { [weak self] in self?.toggleReactionRail() }

    reactionRail.onSend = { [weak self] reaction, count in
      self?.requestReaction(reaction, count: count)
    }
    reactionRail.onEmitParticle = { [weak self] reaction, origin in
      guard let self else { return }
      reactionBurst.emit(reaction, from: reactionRail.convert(origin, to: reactionBurst))
    }
  }

  private func configureViewer() {
    viewer.interactiveDismissEnabled = true
    viewer.onNativeIndexChange = { [weak self] photo, index in
      guard let self else { return }
      currentIndex = index
      setReactionRailPresented(false, animated: true)
      updateCurrentMetadata()
      onNativeIndexChange?(photo.id, index)
    }
    viewer.onNativeZoomChange = { [weak self] zoomed in
      guard let self else { return }
      visibility.zoomed = zoomed
      if zoomed {
        setReactionRailPresented(false, animated: true)
      }
      applyVisibility(animated: true)
      applyScreenTraits()
    }
    viewer.onNativeInfoRequest = { [weak self] in self?.toggleInfo() }
    viewer.onNativeRequestClose = { [weak self] in self?.requestClose() }
    viewer.onActivePhotoLoadStateChange = { [weak self] state in
      self?.loadingPill.handle(state)
    }
    loadingPill.onSizeChange = { [weak self] in self?.setNeedsLayout() }

    addGestureRecognizer(tapGestureRecognizer)
    viewer.configureExternalTapGesture(tapGestureRecognizer)
  }

  private func configureInspector() {
    inspector.canPresent = { [weak self] in self?.currentMetadata != nil }
    inspector.onGestureBegan = { [weak self] in self?.setReactionRailPresented(false, animated: true) }
    inspector.onProgressChange = { [weak self] progress in
      guard let self else { return }
      visibility.infoProgress = progress
      layoutChrome()
      applyVisibility(animated: false)
      updateToolbarState()
    }
    addGestureRecognizer(inspector.panGestureRecognizer)
    viewer.configureExternalInfoGesture(inspector.panGestureRecognizer)
  }

  private func layoutChrome() {
    let width = mediaViewport.frame.width
    let safeInsets = safeAreaInsets
    let scrimSpan = PhotoDetailScrimView.span

    let navigationBarHeight = navigationBar.sizeThatFits(CGSize(width: width, height: 0)).height
    navigationBar.frame = CGRect(x: 0, y: safeInsets.top, width: width, height: navigationBarHeight)
    topScrim.frame = CGRect(x: 0, y: 0, width: width, height: scrimSpan)

    let toolbarHeight = toolbar.sizeThatFits(CGSize(width: width, height: 0)).height
    let toolbarY = bounds.height - safeInsets.bottom - toolbarHeight
    toolbar.frame = CGRect(x: 0, y: toolbarY, width: width, height: toolbarHeight)
    bottomScrim.frame = CGRect(x: 0, y: bounds.height - scrimSpan, width: width, height: scrimSpan)

    loadingPillHost.frame = bounds
    let pillSize = loadingPill.sizeThatFits(CGSize(width: width - 32, height: .greatestFiniteMagnitude))
    loadingPill.bounds = CGRect(origin: .zero, size: pillSize)
    loadingPill.center = CGPoint(
      x: width - 16 - pillSize.width / 2,
      y: toolbarY - 12 - pillSize.height / 2
    )

    toolbar.layoutIfNeeded()
    let reactionsItemFrame = toolbar.reactionsItemFrame(in: self)
    reactionRail.anchorXCenter = reactionsItemFrame?.midX
    let railFrame = reactionRail.preferredFrame(
      containerWidth: width,
      bottomY: reactionsItemFrame?.minY ?? toolbarY
    )
    reactionRail.bounds = CGRect(origin: .zero, size: railFrame.size)
    reactionRail.center = CGPoint(x: railFrame.midX, y: railFrame.midY)
    reactionBurst.frame = CGRect(x: 0, y: 0, width: width, height: bounds.height)
  }

  private func applyVisibility(animated: Bool) {
    let changes = visibilityChanges()
    guard animated, !UIAccessibility.isReduceMotionEnabled else {
      changes()
      return
    }
    UIView.animate(
      withDuration: 0.25,
      delay: 0,
      options: [.allowUserInteraction, .beginFromCurrentState, .curveEaseInOut],
      animations: changes
    )
  }

  private func visibilityChanges() -> () -> Void {
    { [self] in
      navigationBar.alpha = visibility.navBarAlpha
      toolbar.alpha = visibility.toolbarAlpha
      topScrim.alpha = visibility.topScrimAlpha
      bottomScrim.alpha = visibility.bottomScrimAlpha
      loadingPillHost.alpha = visibility.loadingPillAlpha
      viewer.setLiveBadgeAlpha(visibility.liveBadgeAlpha)
    }
  }

  private func applyScreenTraits() {
    onNativeScreenTraitsChange?(
      visibility.statusBarHidden,
      visibility.homeIndicatorHidden
    )
  }

  private func updateAccessibilityLabels() {
    navigationBar.setBackAccessibilityLabel(strings.close)
    toolbar.setShareAccessibilityLabel(strings.share)
    toolbar.setInfoAccessibilityLabel(strings.info)
    toolbar.setReactionsAccessibilityLabel(strings.reaction)
    updateCommentBadge()
  }

  private func updateCurrentMetadata() {
    guard photos.indices.contains(currentIndex),
          let metadata = metadataByID[photos[currentIndex].id]
    else {
      navigationBar.setTitle("", subtitle: "")
      return
    }
    navigationBar.setTitle(metadata.title, subtitle: metadata.subtitle)
    infoView.setInfo(metadata.info)
    setNeedsLayout()
  }

  private func updateCommentBadge() {
    let showsBadge = socialActionsEnabled && commentCount > 0
    toolbar.setCommentCount(max(commentCount, 0))
    toolbar.setCommentsAccessibilityLabel(
      showsBadge ? "\(strings.comments), \(commentCount)" : strings.comments
    )
  }

  private func updateToolbarState() {
    toolbar.setInfoActive(inspector.progress > 0.5)
    toolbar.setReactionsActive(reactionRailPresented)
  }

  private func clampedIndex(_ index: Int) -> Int {
    guard !photos.isEmpty else { return 0 }
    return min(max(index, 0), photos.count - 1)
  }

  private var currentMetadata: PhotoDetailMetadata? {
    guard photos.indices.contains(currentIndex) else { return nil }
    return metadataByID[photos[currentIndex].id]
  }

  @objc private func handleUserTap() {
    guard visibility.allowsImmersiveToggle else { return }
    visibility.userHidden.toggle()
    if visibility.userHidden {
      setReactionRailPresented(false, animated: true)
    }
    applyVisibility(animated: true)
    applyScreenTraits()
  }

  func gestureRecognizer(
    _ gestureRecognizer: UIGestureRecognizer,
    shouldReceive touch: UITouch
  ) -> Bool {
    guard gestureRecognizer === tapGestureRecognizer,
          let touchView = touch.view
    else { return true }

    let chromeSubtrees: [UIView] = [navigationBar, toolbar, reactionRail, infoView]
    if chromeSubtrees.contains(where: touchView.isDescendant(of:)) {
      return false
    }

    var ancestor: UIView? = touchView
    while let current = ancestor {
      if current is LivePhotoBadgeView { return false }
      ancestor = current.superview
    }
    return true
  }

  private func toggleInfo() {
    guard currentMetadata != nil else { return }
    setReactionRailPresented(false, animated: true)
    inspector.settle(open: inspector.progress < 0.5, velocity: 0)
  }

  private func toggleReactionRail() {
    guard socialActionsEnabled else { return }
    if inspector.progress > 0.001 {
      inspector.settle(open: false, velocity: 0)
    }
    reactionRail.prepareHaptics()
    setReactionRailPresented(!reactionRailPresented, animated: true)
  }

  private func setReactionRailPresented(_ presented: Bool, animated: Bool) {
    reactionRailPresented = presented
    reactionRail.setPresented(presented, animated: animated)
    if !presented {
      reactionBurst.clear()
    }
    updateToolbarState()
  }

  private func requestClose() {
    setReactionRailPresented(false, animated: false)
    onNativeTransitionClose?()
  }

  private func requestComments() {
    guard socialActionsEnabled, photos.indices.contains(currentIndex) else { return }
    setReactionRailPresented(false, animated: true)
    let photo = photos[currentIndex]
    onNativeCommentsRequest?(photo.id, currentIndex)
  }

  private func requestReaction(_ reaction: String, count: Int) {
    guard socialActionsEnabled, count > 0, photos.indices.contains(currentIndex) else { return }
    let photo = photos[currentIndex]
    onNativeReactionRequest?(photo.id, currentIndex, reaction, count)
  }

  private func shareCurrentPhoto() {
    guard photos.indices.contains(currentIndex),
          let presenter = nearestViewController
    else { return }

    PhotoShareActivity.present(
      photoId: photos[currentIndex].id,
      gallerySlug: gallerySlug,
      from: presenter,
      barButtonItem: toolbar.shareBarButtonItem
    )
  }
}
