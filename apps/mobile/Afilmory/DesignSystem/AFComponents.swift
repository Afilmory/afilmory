import SDWebImage
import UIKit

@MainActor
enum AFGlassButton {
  static func symbol(_ name: String, accessibilityLabel: String, pointSize: CGFloat = 15, action: @escaping () -> Void) -> UIButton {
    var configuration = AdaptiveGlass.buttonConfiguration()
    configuration.image = UIImage(systemName: name, withConfiguration: UIImage.SymbolConfiguration(pointSize: pointSize, weight: .semibold))
    configuration.cornerStyle = .capsule
    configuration.baseForegroundColor = AFColor.textPrimary
    configuration.contentInsets = NSDirectionalEdgeInsets(top: 11, leading: 11, bottom: 11, trailing: 11)
    let button = UIButton(configuration: configuration, primaryAction: UIAction { _ in action() })
    button.accessibilityLabel = accessibilityLabel
    return button
  }

  static func titled(_ title: String, symbol: String? = nil, action: @escaping () -> Void) -> UIButton {
    var configuration = AdaptiveGlass.buttonConfiguration()
    configuration.title = title
    configuration.titleTextAttributesTransformer = UIConfigurationTextAttributesTransformer { attributes in
      var updated = attributes
      updated.font = AFFont.ui(size: 14, weight: .medium)
      return updated
    }
    if let symbol {
      configuration.image = UIImage(systemName: symbol, withConfiguration: UIImage.SymbolConfiguration(pointSize: 11, weight: .bold))
      configuration.imagePadding = 6
    }
    configuration.cornerStyle = .capsule
    configuration.baseForegroundColor = AFColor.textPrimary
    configuration.contentInsets = NSDirectionalEdgeInsets(top: 9, leading: 14, bottom: 9, trailing: 14)
    return UIButton(configuration: configuration, primaryAction: UIAction { _ in action() })
  }
}

@MainActor
enum AFLabel {
  static func exhibit(_ text: String? = nil, size: CGFloat, italic: Bool = false, color: UIColor = AFColor.textPrimary) -> UILabel {
    make(text, font: AFFont.exhibit(size: size, italic: italic), color: color)
  }

  static func exhibitUser(_ text: String? = nil, size: CGFloat, italic: Bool = false, color: UIColor = AFColor.textPrimary) -> UILabel {
    make(text, font: AFFont.exhibitUser(size: size, italic: italic), color: color)
  }

  static func ui(_ text: String? = nil, size: CGFloat, weight: UIFont.Weight = .regular, color: UIColor = AFColor.textSecondary) -> UILabel {
    make(text, font: AFFont.ui(size: size, weight: weight), color: color)
  }

  static func mono(_ text: String? = nil, size: CGFloat = 11, color: UIColor = AFColor.textTertiary) -> UILabel {
    make(text, font: AFFont.mono(size: size), color: color)
  }

  private static func make(_ text: String?, font: UIFont, color: UIColor) -> UILabel {
    let label = UILabel()
    label.text = text
    label.font = font
    label.textColor = color
    label.adjustsFontForContentSizeCategory = true
    label.translatesAutoresizingMaskIntoConstraints = false
    return label
  }
}

final class AFAvatarView: UIView {
  let imageView = UIImageView()
  private let ring = CAShapeLayer()

  var ringColor: UIColor? {
    didSet { ring.strokeColor = ringColor?.cgColor ?? UIColor.clear.cgColor }
  }

  override init(frame: CGRect) {
    super.init(frame: frame)
    imageView.contentMode = .scaleAspectFill
    imageView.clipsToBounds = true
    imageView.backgroundColor = AFColor.fill
    addSubview(imageView)
    ring.fillColor = UIColor.clear.cgColor
    ring.lineWidth = 1.5
    ring.strokeColor = UIColor.clear.cgColor
    layer.addSublayer(ring)
    isAccessibilityElement = false
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    let inset: CGFloat = ringColor == nil ? 0 : 3
    imageView.frame = bounds.insetBy(dx: inset, dy: inset)
    imageView.layer.cornerRadius = imageView.bounds.width / 2
    ring.frame = bounds
    ring.path = UIBezierPath(ovalIn: bounds.insetBy(dx: 0.75, dy: 0.75)).cgPath
  }

  func setImage(_ urlString: String?, fallbackInitial: String?) {
    imageView.sd_cancelCurrentImageLoad()
    imageView.image = nil
    guard let urlString, let url = URL(string: urlString) else {
      imageView.image = Self.initialImage(fallbackInitial)
      return
    }
    imageView.sd_setImage(with: url, placeholderImage: Self.initialImage(fallbackInitial))
  }

  private static func initialImage(_ text: String?) -> UIImage? {
    guard let initial = text?.trimmingCharacters(in: .whitespaces).first else { return nil }
    let size = CGSize(width: 72, height: 72)
    return UIGraphicsImageRenderer(size: size).image { context in
      AFColor.fill.setFill()
      context.fill(CGRect(origin: .zero, size: size))
      let attributes: [NSAttributedString.Key: Any] = [
        .font: AFFont.exhibitUser(size: 32),
        .foregroundColor: AFColor.textSecondary,
      ]
      let string = String(initial).uppercased() as NSString
      let textSize = string.size(withAttributes: attributes)
      string.draw(at: CGPoint(x: (size.width - textSize.width) / 2, y: (size.height - textSize.height) / 2), withAttributes: attributes)
    }
  }
}

extension UIImageView {
  @MainActor
  func afSetPhoto(_ photo: GalleryPhoto, original: Bool = false, targetWidth: CGFloat? = nil, headroom: CGFloat = 1) {
    let placeholder = ThumbHashCache.image(forHex: photo.thumbHash)
    let urlString = original ? photo.originalUrl : photo.thumbnailUrl
    var context: [SDWebImageContextOption: Any] = [:]
    if original {
      let screen = window?.windowScene?.screen
      let fitting = bounds.isEmpty ? (screen?.bounds.size ?? CGSize(width: 440, height: 956)) : bounds.size
      context = PhotoImageSizing.context(
        aspectRatio: photo.aspectRatio,
        fitting: fitting,
        scale: screen?.scale ?? traitCollection.displayScale,
        headroom: headroom
      )
    } else if let targetWidth {
      let scale = window?.windowScene?.screen.scale ?? traitCollection.displayScale
      let height = targetWidth / max(CGFloat(photo.aspectRatio), 0.01)
      context[.imageThumbnailPixelSize] = NSValue(cgSize: CGSize(width: targetWidth * scale, height: height * scale))
    }
    sd_setImage(
      with: URL(string: urlString),
      placeholderImage: placeholder,
      options: [.retryFailed, .avoidAutoSetImage],
      context: context,
      progress: nil
    ) { [weak self] image, _, _, _ in
      guard let self, let image else { return }
      UIView.transition(with: self, duration: 0.22, options: [.transitionCrossDissolve, .allowUserInteraction]) {
        self.image = image
      }
    }
  }
}
