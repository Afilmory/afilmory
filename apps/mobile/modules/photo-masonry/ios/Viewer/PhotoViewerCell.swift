import SDWebImage
import UIKit

enum PhotoViewerImageLoadCallbacks {
  nonisolated static func progress(
    _ update: @escaping @MainActor @Sendable (_ receivedBytes: Int, _ expectedBytes: Int) -> Void
  ) -> SDImageLoaderProgressBlock {
    { receivedBytes, expectedBytes, _ in
      Task { @MainActor in
        update(receivedBytes, expectedBytes)
      }
    }
  }
}

enum PhotoViewerImageSizing {
  static func aspectRatio(for photo: MasonryPhoto) -> CGFloat {
    if photo.width > 0, photo.height > 0 {
      return CGFloat(photo.width / photo.height)
    }
    return max(CGFloat(photo.aspectRatio), 0.01)
  }

  static func pixelSize(
    for photo: MasonryPhoto,
    viewportSize: CGSize,
    screenScale: CGFloat,
    tier: Int
  ) -> CGSize {
    let boundingPixelSize = CGSize(
      width: viewportSize.width * screenScale * CGFloat(tier),
      height: viewportSize.height * screenScale * CGFloat(tier)
    )
    let aspectRatio = aspectRatio(for: photo)
    var pixelSize = CGSize(
      width: boundingPixelSize.width,
      height: boundingPixelSize.width / aspectRatio
    )
    if pixelSize.height > boundingPixelSize.height {
      pixelSize = CGSize(
        width: boundingPixelSize.height * aspectRatio,
        height: boundingPixelSize.height
      )
    }
    if photo.width > 0, photo.height > 0 {
      let nativeScale = min(
        1,
        min(CGFloat(photo.width) / pixelSize.width, CGFloat(photo.height) / pixelSize.height)
      )
      pixelSize = CGSize(width: pixelSize.width * nativeScale, height: pixelSize.height * nativeScale)
    }
    return pixelSize
  }
}

final class PhotoViewerCell: UICollectionViewCell, UIGestureRecognizerDelegate, UIScrollViewDelegate {
  static let reuseIdentifier = "PhotoViewerCell"

  private let scrollView = UIScrollView()
  private let imageContainerView = UIView()
  private let previewImageView = UIImageView()
  private let detailImageView = UIImageView()
  private let livePhotoPlaybackView = LivePhotoPlaybackView()
  private let livePhotoBadge = LivePhotoBadgeView()
  private let livePhotoHaptics = UIImpactFeedbackGenerator(style: .medium)
  private lazy var livePhotoLongPress = UILongPressGestureRecognizer(
    target: self,
    action: #selector(handleLivePhotoLongPress(_:))
  )
  private(set) lazy var doubleTapGestureRecognizer: UITapGestureRecognizer = {
    let recognizer = UITapGestureRecognizer(target: self, action: #selector(handleDoubleTap(_:)))
    recognizer.numberOfTapsRequired = 2
    return recognizer
  }()
  private var photo: MasonryPhoto?
  private var isActive = false
  private var isHoldingLivePhoto = false
  private var loadedTier = 0
  private var displayedTier = 0
  private var lastViewportSize = CGSize.zero
  private var wasZoomed = false
  private var externalBadgeAlpha: CGFloat = 1

  var onZoomStateChange: ((Bool) -> Void)?
  var onLivePhotoPlaybackStateChange: ((Bool) -> Void)?
  var onLivePhotoModeChange: ((String, LivePhotoPlaybackMode) -> Void)?
  var onOriginalLoadStateChange: ((PhotoOriginalLoadState) -> Void)?

  private(set) var originalLoadState = PhotoOriginalLoadState.idle

  var representedPhotoId: String? {
    photo?.id
  }

  var isZoomed: Bool {
    scrollView.zoomScale > scrollView.minimumZoomScale + 0.01
  }

  // Only a held finger may lock paging. Playback also runs unattended (on entry
  // and from the badge), and locking on that would freeze the pager after every
  // swipe for the length of the clip.
  var blocksPaging: Bool {
    isHoldingLivePhoto
  }

  override init(frame: CGRect) {
    super.init(frame: frame)

    backgroundColor = .clear
    contentView.backgroundColor = .clear

    scrollView.backgroundColor = .clear
    scrollView.bouncesZoom = true
    scrollView.contentInsetAdjustmentBehavior = .never
    scrollView.decelerationRate = .fast
    scrollView.delegate = self
    scrollView.maximumZoomScale = 4
    scrollView.minimumZoomScale = 1
    scrollView.showsHorizontalScrollIndicator = false
    scrollView.showsVerticalScrollIndicator = false
    contentView.addSubview(scrollView)

    imageContainerView.isAccessibilityElement = true
    imageContainerView.accessibilityIdentifier = "photo-viewer-image"
    imageContainerView.isUserInteractionEnabled = true
    scrollView.addSubview(imageContainerView)

    previewImageView.clipsToBounds = true
    previewImageView.contentMode = .scaleAspectFit
    previewImageView.sd_imageTransition = .fade(duration: 0.14)
    imageContainerView.addSubview(previewImageView)

    detailImageView.alpha = 0
    detailImageView.clipsToBounds = true
    detailImageView.contentMode = .scaleAspectFit
    imageContainerView.addSubview(detailImageView)

    livePhotoPlaybackView.onPlaybackStateChange = { [weak self] playing in
      guard let self else { return }
      self.animateLivePhotoBadgeVisibility()
      self.onLivePhotoPlaybackStateChange?(playing)
    }
    imageContainerView.addSubview(livePhotoPlaybackView)

    livePhotoBadge.isHidden = true
    livePhotoBadge.onSelectMode = { [weak self] mode in
      guard let self, let photo = self.photo else { return }
      self.livePhotoPlaybackView.mode = mode
      self.onLivePhotoModeChange?(photo.id, mode)
      self.updateLivePhotoBadgeVisibility()
      self.setNeedsLayout()
      guard mode.repeatsUntilStopped else { return }
      self.livePhotoPlaybackView.startPlayback()
    }
    contentView.addSubview(livePhotoBadge)

    imageContainerView.addGestureRecognizer(doubleTapGestureRecognizer)

    livePhotoLongPress.minimumPressDuration = 0.18
    livePhotoLongPress.allowableMovement = 16
    livePhotoLongPress.delegate = self
    imageContainerView.addGestureRecognizer(livePhotoLongPress)
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) is not supported")
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    scrollView.frame = contentView.bounds
    layoutImageIfNeeded()
    centerImage()
    layoutLivePhotoBadge()
  }

  override func prepareForReuse() {
    super.prepareForReuse()
    previewImageView.sd_cancelCurrentImageLoad()
    detailImageView.sd_cancelCurrentImageLoad()
    setActive(false)
    livePhotoPlaybackView.configure(videoURL: nil)
    previewImageView.image = nil
    detailImageView.image = nil
    detailImageView.alpha = 0
    photo = nil
    isHoldingLivePhoto = false
    loadedTier = 0
    displayedTier = 0
    lastViewportSize = .zero
    wasZoomed = false
    originalLoadState = .idle
    onZoomStateChange = nil
    onLivePhotoPlaybackStateChange = nil
    onLivePhotoModeChange = nil
    onOriginalLoadStateChange = nil
    livePhotoBadge.isHidden = true
    livePhotoBadge.alpha = 1
    externalBadgeAlpha = 1
    scrollView.setZoomScale(1, animated: false)
    scrollView.panGestureRecognizer.isEnabled = false
  }

  func configure(
    with photo: MasonryPhoto,
    viewportSize: CGSize,
    livePhotoStrings: LivePhotoBadgeStrings,
    livePhotoMode: LivePhotoPlaybackMode
  ) {
    let mediaChanged = self.photo?.id != photo.id
      || self.photo?.livePhotoVideoUrl != photo.livePhotoVideoUrl
    self.photo = photo
    imageContainerView.accessibilityLabel = photo.accessibilityLabel
    imageContainerView.accessibilityHint =
      photo.hasLivePhoto ? livePhotoStrings.accessibilityHint : nil
    livePhotoBadge.strings = livePhotoStrings
    livePhotoBadge.setMode(livePhotoMode)
    livePhotoPlaybackView.mode = livePhotoMode
    livePhotoBadge.isHidden = !photo.hasLivePhoto
    updateLivePhotoBadgeVisibility()
    livePhotoPlaybackView.configure(videoURL: photo.livePhotoVideoUrl.flatMap(URL.init(string:)))
    setNeedsLayout()

    guard mediaChanged else { return }
    loadedTier = 0
    displayedTier = 0
    lastViewportSize = .zero
    wasZoomed = false
    setOriginalLoadState(.idle)
    scrollView.setZoomScale(1, animated: false)
    scrollView.panGestureRecognizer.isEnabled = false
    previewImageView.image = ThumbHashCache.image(forHex: photo.thumbHash)
    detailImageView.sd_cancelCurrentImageLoad()
    detailImageView.image = nil
    detailImageView.alpha = 0

    if let thumbnailURL = URL(string: photo.url) {
      previewImageView.sd_setImage(
        with: thumbnailURL,
        placeholderImage: previewImageView.image,
        options: [.retryFailed, .scaleDownLargeImages]
      )
    }
    loadTier(1, viewportSize: viewportSize)
  }

  func setActive(_ active: Bool) {
    guard active != isActive else { return }
    isActive = active
    if !active {
      isHoldingLivePhoto = false
    }
    livePhotoPlaybackView.setActive(active)
    guard active, photo?.hasLivePhoto == true, !isZoomed else { return }
    livePhotoPlaybackView.startPlayback()
  }

  func loadTier(forZoomScale zoomScale: CGFloat, viewportSize: CGSize) {
    let tier = min(4, max(1, Int(ceil(zoomScale))))
    loadTier(tier, viewportSize: viewportSize)
  }

  func viewForZooming(in scrollView: UIScrollView) -> UIView? {
    imageContainerView
  }

  override func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
    guard gestureRecognizer === livePhotoLongPress else {
      return super.gestureRecognizerShouldBegin(gestureRecognizer)
    }
    return isActive && !isZoomed && (photo?.hasLivePhoto ?? false)
  }

  func scrollViewDidZoom(_ scrollView: UIScrollView) {
    centerImage()
    let zoomed = isZoomed
    scrollView.panGestureRecognizer.isEnabled = zoomed
    if zoomed != wasZoomed {
      wasZoomed = zoomed
      updateLivePhotoBadgeVisibility()
      onZoomStateChange?(zoomed)
    }
  }

  func scrollViewDidEndZooming(_ scrollView: UIScrollView, with view: UIView?, atScale scale: CGFloat) {
    loadTier(forZoomScale: scale, viewportSize: bounds.size)
  }

  private func loadTier(_ tier: Int, viewportSize: CGSize) {
    guard tier > loadedTier, viewportSize.width > 0, viewportSize.height > 0,
      let photo, let url = URL(string: photo.originalUrl), !photo.originalUrl.isEmpty
    else {
      return
    }

    loadedTier = tier
    let screenScale = window?.screen.scale ?? UIScreen.main.scale
    let pixelSize = PhotoViewerImageSizing.pixelSize(
      for: photo,
      viewportSize: viewportSize,
      screenScale: screenScale,
      tier: tier
    )
    let expectedPhotoId = photo.id
    let hadDetailImage = detailImageView.image != nil
    setOriginalLoadState(.loading(tier: tier, receivedBytes: 0, expectedBytes: 0))

    detailImageView.sd_setImage(
      with: url,
      placeholderImage: detailImageView.image,
      options: [.avoidAutoSetImage, .retryFailed, .scaleDownLargeImages],
      context: [
        .imagePreserveAspectRatio: true,
        .imageThumbnailPixelSize: NSValue(cgSize: pixelSize),
      ],
      progress: PhotoViewerImageLoadCallbacks.progress { [weak self] receivedBytes, expectedBytes in
        guard let self, self.photo?.id == expectedPhotoId, self.loadedTier == tier else { return }
        self.setOriginalLoadState(
          .loading(tier: tier, receivedBytes: receivedBytes, expectedBytes: expectedBytes)
        )
      },
      completed: { [weak self] image, error, _, _ in
        guard let self, self.photo?.id == expectedPhotoId, self.loadedTier == tier else { return }
        guard error == nil, let image else {
          self.loadedTier = self.displayedTier
          self.setOriginalLoadState(.failed)
          return
        }
        self.setOriginalLoadState(.finished)
        self.detailImageView.image = image
        self.displayedTier = tier
        guard !hadDetailImage else { return }
        UIView.animate(
          withDuration: 0.14,
          delay: 0,
          options: [.beginFromCurrentState, .allowUserInteraction, .curveEaseOut]
        ) {
          self.detailImageView.alpha = 1
        }
      }
    )
  }

  private func setOriginalLoadState(_ state: PhotoOriginalLoadState) {
    originalLoadState = state
    onOriginalLoadStateChange?(state)
  }

  private func centerImage() {
    let horizontal = max((scrollView.bounds.width - scrollView.contentSize.width) / 2, 0)
    let vertical = max((scrollView.bounds.height - scrollView.contentSize.height) / 2, 0)
    scrollView.contentInset = UIEdgeInsets(top: vertical, left: horizontal, bottom: vertical, right: horizontal)
  }

  private func layoutImageIfNeeded() {
    let viewportSize = scrollView.bounds.size
    guard viewportSize.width > 0, viewportSize.height > 0, viewportSize != lastViewportSize else { return }

    lastViewportSize = viewportSize
    scrollView.setZoomScale(1, animated: false)

    let aspectRatio = resolvedAspectRatio()
    var imageSize = CGSize(width: viewportSize.width, height: viewportSize.width / aspectRatio)
    if imageSize.height > viewportSize.height {
      imageSize = CGSize(width: viewportSize.height * aspectRatio, height: viewportSize.height)
    }

    imageContainerView.frame = CGRect(origin: .zero, size: imageSize)
    previewImageView.frame = imageContainerView.bounds
    detailImageView.frame = imageContainerView.bounds
    livePhotoPlaybackView.frame = imageContainerView.bounds
    scrollView.contentSize = imageSize
  }

  private func layoutLivePhotoBadge() {
    guard !livePhotoBadge.isHidden else { return }
    let availableWidth = max(contentView.bounds.width - 32, 44)
    let fittingSize = livePhotoBadge.sizeThatFits(
      CGSize(width: availableWidth, height: .greatestFiniteMagnitude)
    )
    let imageTop = scrollView.contentInset.top + 10
    let safeTop = contentView.safeAreaInsets.top + 10
    livePhotoBadge.frame = CGRect(
      x: 16,
      y: max(imageTop, safeTop),
      width: min(fittingSize.width, availableWidth),
      height: fittingSize.height
    )
  }

  func setLiveBadgeAlpha(_ alpha: CGFloat) {
    externalBadgeAlpha = alpha
    updateLivePhotoBadgeVisibility()
  }

  func setOpeningPlaceholderImage(_ image: UIImage) {
    previewImageView.image = image
  }

  // Looping modes never finish on their own, so hiding the badge while they run
  // would strand the user with no way back to the mode menu.
  private func updateLivePhotoBadgeVisibility() {
    let playingOnce = livePhotoPlaybackView.isPlaying
      && !livePhotoPlaybackView.mode.repeatsUntilStopped
    let concealed = isZoomed || playingOnce
    livePhotoBadge.alpha = concealed ? 0 : externalBadgeAlpha
    livePhotoBadge.isUserInteractionEnabled = !concealed && externalBadgeAlpha > 0.01
  }

  private func animateLivePhotoBadgeVisibility() {
    UIView.animate(
      withDuration: 0.3,
      delay: 0,
      options: [.beginFromCurrentState, .curveLinear]
    ) {
      self.updateLivePhotoBadgeVisibility()
    }
  }

  private func beginLivePhotoPlayback() {
    livePhotoHaptics.prepare()
    guard !isZoomed, livePhotoPlaybackView.startPlayback() else { return }
    livePhotoHaptics.impactOccurred(intensity: 0.72)
  }

  private func resolvedAspectRatio() -> CGFloat {
    guard let photo else { return 1 }
    return PhotoViewerImageSizing.aspectRatio(for: photo)
  }

  @objc private func handleDoubleTap(_ gesture: UITapGestureRecognizer) {
    if isZoomed {
      scrollView.setZoomScale(1, animated: true)
      return
    }

    let scale = min(2.5, scrollView.maximumZoomScale)
    let point = gesture.location(in: imageContainerView)
    let width = scrollView.bounds.width / scale
    let height = scrollView.bounds.height / scale
    scrollView.zoom(
      to: CGRect(x: point.x - width / 2, y: point.y - height / 2, width: width, height: height),
      animated: true
    )
  }

  @objc private func handleLivePhotoLongPress(_ gesture: UILongPressGestureRecognizer) {
    switch gesture.state {
    case .began:
      isHoldingLivePhoto = true
      beginLivePhotoPlayback()
    case .ended, .cancelled, .failed:
      guard isHoldingLivePhoto else { return }
      isHoldingLivePhoto = false
      livePhotoPlaybackView.stopPlayback(animated: true)
    default:
      break
    }
  }

}
