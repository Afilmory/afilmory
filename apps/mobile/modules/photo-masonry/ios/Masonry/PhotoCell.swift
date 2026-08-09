import PhotosUI
import SDWebImage
import UIKit

@MainActor
enum LivePhotoBadgeArtwork {
  static let overContent: UIImage? = PHLivePhotoView.livePhotoBadgeImage(options: .overContent)
}

@MainActor
enum ThumbHashCache {
  private static let cache = NSCache<NSString, UIImage>()

  static func image(forHex hex: String?) -> UIImage? {
    guard let hex, !hex.isEmpty else { return nil }
    if let cached = cache.object(forKey: hex as NSString) {
      return cached
    }
    guard let data = Data(thumbHashHex: hex) else { return nil }
    let image = thumbHashToImage(hash: data)
    cache.setObject(image, forKey: hex as NSString)
    return image
  }
}

private extension Data {
  init?(thumbHashHex hex: String) {
    let length = hex.count
    guard length >= 2, length % 2 == 0 else { return nil }
    var bytes = [UInt8]()
    bytes.reserveCapacity(length / 2)
    var index = hex.startIndex
    while index < hex.endIndex {
      let next = hex.index(index, offsetBy: 2)
      guard let byte = UInt8(hex[index..<next], radix: 16) else { return nil }
      bytes.append(byte)
      index = next
    }
    self.init(bytes)
  }
}

final class PhotoCell: UICollectionViewCell {
  static let reuseIdentifier = "PhotoCell"

  private let imageView = UIImageView()
  private let liveBadge = UIImageView()
  private let selectionShade = UIView()
  private let selectionBadge = UIView()
  private let selectionCheck = UIImageView()
  private var livePhotoAccessibilityLabel = "Live Photo"

  var transitionSourceView: UIView { imageView }

  override init(frame: CGRect) {
    super.init(frame: frame)
    contentView.clipsToBounds = true
    imageView.contentMode = .scaleAspectFill
    imageView.clipsToBounds = true
    imageView.sd_imageTransition = .fade(duration: 0.15)
    contentView.addSubview(imageView)

    liveBadge.image = LivePhotoBadgeArtwork.overContent
    liveBadge.contentMode = .center
    liveBadge.isHidden = true
    liveBadge.isUserInteractionEnabled = false
    contentView.addSubview(liveBadge)

    selectionShade.backgroundColor = UIColor.black.withAlphaComponent(0.2)
    selectionShade.isHidden = true
    selectionShade.isUserInteractionEnabled = false
    contentView.addSubview(selectionShade)

    selectionBadge.backgroundColor = .systemBlue
    selectionBadge.layer.borderColor = UIColor.white.cgColor
    selectionBadge.layer.borderWidth = 1.5
    selectionBadge.isHidden = true
    selectionBadge.isUserInteractionEnabled = false
    contentView.addSubview(selectionBadge)

    let checkConfig = UIImage.SymbolConfiguration(pointSize: 12, weight: .bold)
    selectionCheck.image = UIImage(systemName: "checkmark", withConfiguration: checkConfig)
    selectionCheck.tintColor = .white
    selectionCheck.contentMode = .center
    selectionBadge.addSubview(selectionCheck)

    addInteraction(UIPointerInteraction(delegate: self))
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) is not supported")
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    imageView.frame = contentView.bounds
    layoutLivePhotoBadge()
    selectionShade.frame = contentView.bounds
    let badgeSize: CGFloat = 26
    selectionBadge.frame = CGRect(
      x: contentView.bounds.width - badgeSize - 8,
      y: contentView.bounds.height - badgeSize - 8,
      width: badgeSize,
      height: badgeSize
    )
    selectionBadge.layer.cornerRadius = badgeSize / 2
    selectionCheck.frame = selectionBadge.bounds
  }

  override var isHighlighted: Bool {
    didSet {
      UIView.animate(withDuration: 0.12, delay: 0, options: [.beginFromCurrentState, .allowUserInteraction]) {
        self.contentView.transform = self.isHighlighted ? CGAffineTransform(scaleX: 0.97, y: 0.97) : .identity
        self.contentView.alpha = self.isHighlighted ? 0.88 : 1
      }
    }
  }

  override func prepareForReuse() {
    super.prepareForReuse()
    imageView.sd_cancelCurrentImageLoad()
    imageView.image = nil
    liveBadge.isHidden = true
    contentView.accessibilityValue = nil
    selectionShade.isHidden = true
    selectionBadge.isHidden = true
    contentView.transform = .identity
    contentView.alpha = 1
  }

  func configure(
    with photo: MasonryPhoto,
    targetWidth: CGFloat,
    livePhotoAccessibilityLabel: String,
    selectionMode: Bool,
    selected: Bool
  ) {
    contentView.isAccessibilityElement = true
    contentView.accessibilityLabel = photo.accessibilityLabel
    contentView.accessibilityTraits.insert(.button)
    self.livePhotoAccessibilityLabel = livePhotoAccessibilityLabel
    liveBadge.isHidden = !photo.hasLivePhoto
    contentView.accessibilityValue = photo.hasLivePhoto ? livePhotoAccessibilityLabel : nil
    setNeedsLayout()
    configureSelection(selectionMode: selectionMode, selected: selected)
    let scale = window?.windowScene?.screen.scale ?? traitCollection.displayScale
    let targetHeight = targetWidth / max(photo.aspectRatio, 0.01)
    let pixelSize = CGSize(width: targetWidth * scale, height: targetHeight * scale)
    imageView.sd_setImage(
      with: URL(string: photo.url),
      placeholderImage: ThumbHashCache.image(forHex: photo.thumbHash),
      options: [.retryFailed],
      context: [.imageThumbnailPixelSize: NSValue(cgSize: pixelSize)]
    )
  }

  func setLivePhotoAccessibilityLabel(_ label: String) {
    livePhotoAccessibilityLabel = label
    if !liveBadge.isHidden {
      contentView.accessibilityValue = label
    }
  }

  private func layoutLivePhotoBadge() {
    guard !liveBadge.isHidden else { return }
    let size = liveBadge.image?.size ?? CGSize(width: 24, height: 24)
    liveBadge.frame = CGRect(origin: CGPoint(x: 6, y: 6), size: size)
  }

  func configureSelection(selectionMode: Bool, selected: Bool) {
    selectionShade.isHidden = !selected
    selectionBadge.isHidden = !selectionMode
    selectionBadge.backgroundColor = selected ? .systemBlue : UIColor.black.withAlphaComponent(0.35)
    selectionCheck.isHidden = !selected
    if selected {
      contentView.accessibilityTraits.insert(.selected)
    } else {
      contentView.accessibilityTraits.remove(.selected)
    }
  }
}

extension PhotoCell: UIPointerInteractionDelegate {
  func pointerInteraction(
    _ interaction: UIPointerInteraction,
    styleFor region: UIPointerRegion
  ) -> UIPointerStyle? {
    UIPointerStyle(effect: .lift(UITargetedPreview(view: contentView)))
  }
}
