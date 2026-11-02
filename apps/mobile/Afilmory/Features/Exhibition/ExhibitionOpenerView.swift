import SDWebImage
import UIKit

final class ExhibitionOpenerView: UIView {
  static let captionHeight: CGFloat = 44

  var onOpen: (() -> Void)?
  var onReExpose: (() -> Void)?

  let card = UIButton(type: .custom)
  let imageView = UIImageView()
  private let captionStack = UIView()
  private let dot = UIView()
  private let titleLabel = AFLabel.exhibit(size: 16, italic: true)
  private let metaLabel = AFLabel.mono(size: 11)
  private lazy var reExposeButton = AFGlassButton.titled(String(localized: "Re-expose"), symbol: "camera.aperture") { [weak self] in
    self?.onReExpose?()
  }

  private(set) var photoID: String?
  private var stage: Stage?
  private var loads: [SDWebImageCombinedOperation] = []

  override init(frame: CGRect) {
    super.init(frame: frame)
    card.backgroundColor = AFColor.sheet
    card.layer.cornerRadius = AFRadius.card
    card.layer.cornerCurve = .continuous
    card.clipsToBounds = true
    card.addAction(UIAction { [weak self] _ in self?.onOpen?() }, for: .primaryActionTriggered)
    imageView.contentMode = .scaleAspectFill
    imageView.clipsToBounds = true
    imageView.isUserInteractionEnabled = false
    card.addSubview(imageView)
    card.layer.anchorPoint = CGPoint(x: 0.5, y: 0)
    dot.layer.cornerRadius = 3
    dot.backgroundColor = AFColor.accentFallback
    titleLabel.translatesAutoresizingMaskIntoConstraints = true
    metaLabel.translatesAutoresizingMaskIntoConstraints = true
    [dot, titleLabel, metaLabel].forEach(captionStack.addSubview)
    captionStack.isAccessibilityElement = true
    captionStack.accessibilityTraits = .staticText
    [card, captionStack, reExposeButton].forEach(addSubview)
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  var cardFrame: CGRect = .zero {
    didSet { setNeedsLayout() }
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    let transform = card.transform
    card.transform = .identity
    card.frame = cardFrame
    card.transform = transform
    imageView.frame = card.bounds
    let captionTop = cardFrame.maxY + 16
    let buttonSize = reExposeButton.sizeThatFits(CGSize(width: 200, height: 44))
    reExposeButton.frame = CGRect(
      x: cardFrame.maxX - buttonSize.width,
      y: captionTop + (Self.captionHeight - buttonSize.height) / 2,
      width: buttonSize.width,
      height: buttonSize.height
    )
    captionStack.frame = CGRect(x: 20, y: captionTop, width: reExposeButton.frame.minX - 28, height: Self.captionHeight)
    let titleHeight = titleLabel.font.lineHeight
    dot.frame = CGRect(x: 0, y: (titleHeight - 6) / 2 + 2, width: 6, height: 6)
    titleLabel.frame = CGRect(x: 14, y: 2, width: captionStack.bounds.width - 14, height: titleHeight)
    metaLabel.frame = CGRect(x: 0, y: titleLabel.frame.maxY + 5, width: captionStack.bounds.width, height: metaLabel.font.lineHeight)
  }

  func configure(photo: GalleryPhoto, number: Int, accent: UIColor?) {
    if photoID != photo.id || stage == nil {
      loadImages(for: photo)
    }
    titleLabel.text = String(localized: "Opener · No. \(ExhibitFormat.frameNumber(number))")
    let stamp = ExhibitFormat.localDateTime(for: photo)
    metaLabel.text = [stamp?.date, stamp.map { "\($0.timeOfDay.localizedName) \($0.time)" }, ExhibitFormat.camera(for: photo)]
      .compactMap { $0 }
      .joined(separator: " · ")
    setAccent(accent ?? AFColor.accentFallback, animated: false)
    card.accessibilityLabel = String(localized: "Open the opener, No. \(ExhibitFormat.frameNumber(number))")
    captionStack.accessibilityLabel = [titleLabel.text, metaLabel.text].compactMap { $0 }.joined(separator: ", ")
    setNeedsLayout()
  }

  enum Stage: Int, Comparable {
    case hash, thumbnail, original

    static func < (lhs: Stage, rhs: Stage) -> Bool { lhs.rawValue < rhs.rawValue }
  }

  func show(_ image: UIImage, stage: Stage, animated: Bool) {
    if let current = self.stage, current >= stage { return }
    self.stage = stage
    guard animated, imageView.image != nil else {
      imageView.image = image
      return
    }
    let fade = CABasicAnimation(keyPath: "contents")
    fade.fromValue = imageView.layer.presentation()?.contents ?? imageView.layer.contents
    fade.duration = 0.25
    fade.timingFunction = CAMediaTimingFunction(name: .easeOut)
    imageView.image = image
    imageView.layer.add(fade, forKey: "contents")
  }

  private func loadImages(for photo: GalleryPhoto) {
    photoID = photo.id
    loads.forEach { $0.cancel() }
    loads = []
    stage = nil
    if let hash = ThumbHashCache.image(forHex: photo.thumbHash) {
      show(hash, stage: .hash, animated: false)
    } else {
      imageView.image = nil
    }
    let scale = traitCollection.displayScale
    let width = max(cardFrame.width, 320)
    let thumbnailSize = CGSize(width: width * scale, height: width / max(CGFloat(photo.aspectRatio), 0.01) * scale)
    load(photo.thumbnailUrl, stage: .thumbnail, context: [.imageThumbnailPixelSize: NSValue(cgSize: thumbnailSize)], options: [.retryFailed], photoID: photo.id)
    load(
      photo.originalUrl,
      stage: .original,
      context: PhotoImageSizing.context(aspectRatio: photo.aspectRatio, fitting: cardFrame.size, scale: scale),
      options: [.retryFailed, .scaleDownLargeImages],
      photoID: photo.id
    )
  }

  private func load(_ url: String, stage: Stage, context: [SDWebImageContextOption: Any], options: SDWebImageOptions, photoID: String) {
    let operation = SDWebImageManager.shared.loadImage(with: URL(string: url), options: options, context: context, progress: nil) { [weak self] image, _, _, cacheType, finished, _ in
      guard finished, let image, let self, self.photoID == photoID else { return }
      self.show(image, stage: stage, animated: cacheType != .memory)
    }
    if let operation { loads.append(operation) }
  }

  func setAccent(_ color: UIColor, animated: Bool) {
    let change = { self.dot.backgroundColor = color }
    animated ? UIView.animate(withDuration: 0.6, animations: change) : change()
  }

  func applyScroll(offset: CGFloat) {
    let progress = min(1, max(0, offset / 520))
    card.alpha = max(0, 1 - 1.1 * progress)
    guard !AFMotion.reduceMotion else {
      card.transform = .identity
      return
    }
    let scale = 1 - 0.06 * progress
    card.transform = CGAffineTransform(translationX: 0, y: max(0, offset) * 0.35).scaledBy(x: scale, y: scale)
  }

  func playExposure() {
    AFMotion.expose(imageView)
    captionStack.alpha = 0
    AFMotion.rackIn(captionStack, delay: 0.65)
  }

  var captionViews: [UIView] { [captionStack, reExposeButton] }
}
