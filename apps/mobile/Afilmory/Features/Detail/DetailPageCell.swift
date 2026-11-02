import SDWebImage
import UIKit

final class DetailPageCell: UICollectionViewCell, UIScrollViewDelegate, UIGestureRecognizerDelegate {
  static let reuseID = "detail-page"

  var onZoomChange: ((Bool) -> Void)?
  var onSingleTap: (() -> Void)?

  let scrollView = UIScrollView()
  let imageView = UIImageView()
  private let live = DetailLivePhotoView()
  private lazy var liveBadge: UIButton = {
    var configuration = AdaptiveGlass.buttonConfiguration()
    configuration.title = "LIVE"
    configuration.image = UIImage(systemName: "livephoto", withConfiguration: UIImage.SymbolConfiguration(pointSize: 11, weight: .semibold))
    configuration.imagePadding = 4
    configuration.cornerStyle = .capsule
    configuration.baseForegroundColor = AFColor.textPrimary
    configuration.contentInsets = NSDirectionalEdgeInsets(top: 5, leading: 9, bottom: 5, trailing: 10)
    configuration.titleTextAttributesTransformer = UIConfigurationTextAttributesTransformer { attributes in
      var updated = attributes
      updated.font = AFFont.mono(size: 10, weight: .semibold)
      return updated
    }
    let button = UIButton(configuration: configuration, primaryAction: UIAction { [weak self] _ in self?.live.play() })
    button.accessibilityLabel = String(localized: "Play Live Photo")
    return button
  }()
  private(set) var photo: GalleryPhoto?
  var photoArea: CGRect = .zero {
    didSet { if photoArea != oldValue { layoutImage() } }
  }
  var progressFloor: CGFloat? {
    didSet { if progressFloor != oldValue { layoutImage() } }
  }
  private let progressView = DetailOriginalProgressView()
  private var progress = DetailOriginalProgress()
  private var progressTick: DispatchWorkItem?

  override init(frame: CGRect) {
    super.init(frame: frame)
    scrollView.delegate = self
    scrollView.minimumZoomScale = 1
    scrollView.maximumZoomScale = 4
    scrollView.showsVerticalScrollIndicator = false
    scrollView.showsHorizontalScrollIndicator = false
    scrollView.contentInsetAdjustmentBehavior = .never
    scrollView.decelerationRate = .fast
    imageView.contentMode = .scaleAspectFill
    imageView.clipsToBounds = true
    imageView.isAccessibilityElement = true
    imageView.accessibilityTraits = .image
    scrollView.addSubview(imageView)
    imageView.addSubview(live)
    contentView.addSubview(scrollView)
    contentView.addSubview(liveBadge)
    contentView.addSubview(progressView)
    progressView.onRetry = { [weak self] in self?.loadOriginal(placeholder: self?.imageView.image) }
    let doubleTap = UITapGestureRecognizer(target: self, action: #selector(doubleTapped(_:)))
    doubleTap.numberOfTapsRequired = 2
    scrollView.addGestureRecognizer(doubleTap)
    let singleTap = UITapGestureRecognizer(target: self, action: #selector(singleTapped))
    singleTap.require(toFail: doubleTap)
    scrollView.addGestureRecognizer(singleTap)
    let press = UILongPressGestureRecognizer(target: self, action: #selector(pressed(_:)))
    press.minimumPressDuration = 0.18
    press.allowableMovement = 16
    press.delegate = self
    scrollView.addGestureRecognizer(press)
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  override func prepareForReuse() {
    super.prepareForReuse()
    scrollView.setZoomScale(1, animated: false)
    live.stop(animated: false)
    imageView.sd_cancelCurrentImageLoad()
    imageView.image = nil
    progressTick?.cancel()
    progress.reset()
    progressView.apply(.hidden, animated: false)
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    scrollView.frame = contentView.bounds
    progressView.frame = contentView.bounds
    layoutImage()
  }

  func configure(photo: GalleryPhoto, number: Int, placeholder: UIImage?) {
    self.photo = photo
    let fallback = placeholder
      ?? SDImageCache.shared.imageFromMemoryCache(forKey: photo.thumbnailUrl)
      ?? ThumbHashCache.image(forHex: photo.thumbHash)
    progressView.accent = AccentStore.shared.cachedAccent(photoId: photo.id) ?? AFColor.accentFallback
    loadOriginal(placeholder: fallback)
    imageView.accessibilityLabel = String(localized: "Photo No. \(ExhibitFormat.frameNumber(number))")
    let videoURL = photo.video?.livePhotoVideoURL.flatMap(URL.init(string:))
    live.videoURL = videoURL
    liveBadge.isHidden = videoURL == nil
    layoutImage()
  }

  private func loadOriginal(placeholder: UIImage?) {
    guard let photo else { return }
    let fitting = contentView.bounds.isEmpty ? CGSize(width: 440, height: 956) : contentView.bounds.size
    let id = photo.id
    progress.start(now: CACurrentMediaTime())
    renderProgress(animated: true)
    scheduleProgressTick()
    imageView.sd_setImage(
      with: URL(string: photo.originalUrl),
      placeholderImage: placeholder,
      options: [.retryFailed, .scaleDownLargeImages],
      context: PhotoImageSizing.context(aspectRatio: photo.aspectRatio, fitting: fitting, scale: traitCollection.displayScale, headroom: scrollView.maximumZoomScale),
      progress: { @Sendable [weak self] received, expected, _ in
        Task { @MainActor in
          guard let self, self.photo?.id == id else { return }
          self.progress.receive(bytes: received, of: expected, now: CACurrentMediaTime())
          self.renderProgress(animated: true)
        }
      },
      completed: { [weak self] image, error, _, _ in
        guard let self, self.photo?.id == id else { return }
        self.progressTick?.cancel()
        if error != nil, (error as? NSError)?.code != SDWebImageError.cancelled.rawValue {
          self.progress.fail()
        } else if image != nil {
          self.progress.finish(now: CACurrentMediaTime())
        }
        self.renderProgress(animated: true)
      }
    )
  }

  private func scheduleProgressTick() {
    progressTick?.cancel()
    guard let showAt = progress.showAt else { return }
    let work = DispatchWorkItem { [weak self] in
      guard let self else { return }
      self.progress.tick(now: CACurrentMediaTime())
      self.renderProgress(animated: true)
    }
    progressTick = work
    DispatchQueue.main.asyncAfter(deadline: .now() + max(0, showAt - CACurrentMediaTime()), execute: work)
  }

  private func renderProgress(animated: Bool) {
    progressView.apply(progress.display, animated: animated)
  }

  func fittedImageFrame(in area: CGRect) -> CGRect {
    guard let photo, area.width > 0, area.height > 0 else { return area }
    let ratio = CGFloat(max(photo.aspectRatio, 0.01))
    var width = area.width
    var height = width / ratio
    if height > area.height {
      height = area.height
      width = height * ratio
    }
    return CGRect(x: area.midX - width / 2, y: area.midY - height / 2, width: width, height: height)
  }

  var isZoomed: Bool { DetailGestureRules.isZoomed(scale: scrollView.zoomScale) }

  func resetZoom(animated: Bool) {
    scrollView.setZoomScale(1, animated: animated)
  }

  private func layoutImage() {
    guard scrollView.zoomScale <= 1.001 else { return }
    let area = photoArea == .zero ? contentView.bounds : photoArea
    let fitted = fittedImageFrame(in: area)
    imageView.frame = CGRect(origin: .zero, size: fitted.size)
    live.frame = imageView.bounds
    scrollView.contentSize = fitted.size
    scrollView.contentInset = UIEdgeInsets(top: fitted.minY, left: fitted.minX, bottom: 0, right: 0)
    scrollView.contentOffset = CGPoint(x: -fitted.minX, y: -fitted.minY)
    liveBadge.sizeToFit()
    liveBadge.frame.origin = CGPoint(x: fitted.minX + 12, y: fitted.minY + 12)
    progressView.place(image: fitted, floor: progressFloor ?? area.maxY)
  }

  func viewForZooming(in _: UIScrollView) -> UIView? {
    imageView
  }

  func scrollViewDidZoom(_ scrollView: UIScrollView) {
    let size = scrollView.bounds.size
    let content = imageView.frame.size
    let horizontal = max(0, (size.width - content.width) / 2)
    let vertical = max(0, (size.height - content.height) / 2)
    scrollView.contentInset = UIEdgeInsets(top: vertical, left: horizontal, bottom: vertical, right: horizontal)
    liveBadge.alpha = isZoomed ? 0 : 1
    progressView.isHidden = isZoomed
    onZoomChange?(isZoomed)
  }

  func scrollViewDidEndZooming(_: UIScrollView, with _: UIView?, atScale scale: CGFloat) {
    if !DetailGestureRules.isZoomed(scale: scale) {
      scrollView.setZoomScale(1, animated: false)
      layoutImage()
      onZoomChange?(false)
    }
  }

  @objc private func doubleTapped(_ gesture: UITapGestureRecognizer) {
    guard scrollView.pinchGestureRecognizer?.isEnabled ?? true else { return }
    if isZoomed {
      scrollView.setZoomScale(1, animated: true)
    } else {
      let point = gesture.location(in: imageView)
      let scale: CGFloat = 2.5
      let size = CGSize(width: scrollView.bounds.width / scale, height: scrollView.bounds.height / scale)
      scrollView.zoom(to: CGRect(x: point.x - size.width / 2, y: point.y - size.height / 2, width: size.width, height: size.height), animated: true)
    }
  }

  @objc private func singleTapped() {
    onSingleTap?()
  }

  @objc private func pressed(_ gesture: UILongPressGestureRecognizer) {
    switch gesture.state {
    case .began:
      guard live.videoURL != nil else { return }
      UIImpactFeedbackGenerator(style: .medium).impactOccurred()
      live.play()
    case .ended, .cancelled, .failed:
      live.stop(animated: true)
    default:
      break
    }
  }

  func gestureRecognizer(_: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith _: UIGestureRecognizer) -> Bool {
    true
  }
}
