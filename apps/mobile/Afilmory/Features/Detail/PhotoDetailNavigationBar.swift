import UIKit

final class PhotoDetailNavigationBar: UINavigationBar {
  var onRequestClose: (() -> Void)?
  var ownerActionsProvider: (() -> [UIMenuElement])?

  private let item = UINavigationItem()
  private let backButtonItem = UIBarButtonItem(image: UIImage(systemName: "chevron.backward"), style: .plain, target: nil, action: nil)
  private let moreButtonItem = UIBarButtonItem(image: UIImage(systemName: "ellipsis"), style: .plain, target: nil, action: nil)
  private let titleCapsule = PhotoDetailTitleCapsule()

  override init(frame: CGRect) {
    super.init(frame: frame)

    // The backdrop is always black; without this the glass bar items resolve
    // against the ambient trait and wash out.
    overrideUserInterfaceStyle = .dark
    tintColor = .white

    let appearance = UINavigationBarAppearance()
    appearance.configureWithTransparentBackground()
    appearance.shadowColor = nil
    standardAppearance = appearance
    scrollEdgeAppearance = appearance

    backButtonItem.accessibilityIdentifier = "photo-detail-back"
    backButtonItem.primaryAction = UIAction { [weak self] _ in self?.onRequestClose?() }
    moreButtonItem.accessibilityIdentifier = "photo-detail-more"
    moreButtonItem.accessibilityLabel = String(localized: "More")
    moreButtonItem.menu = UIMenu(children: [
      UIDeferredMenuElement.uncached { [weak self] completion in
        completion(self?.ownerActionsProvider?() ?? [])
      },
    ])
    item.leftBarButtonItem = backButtonItem
    item.titleView = titleCapsule
    setItems([item], animated: false)
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) is not supported")
  }

  func setTitle(_ title: String, subtitle: String) {
    titleCapsule.setTitle(title, subtitle: subtitle)
    item.titleView = titleCapsule
  }

  func setOwnerActionsEnabled(_ enabled: Bool) {
    item.rightBarButtonItem = enabled ? moreButtonItem : nil
  }

  func setBackAccessibilityLabel(_ label: String) {
    backButtonItem.accessibilityLabel = label
  }

  override func sizeThatFits(_ size: CGSize) -> CGSize {
    let fittingSize = super.sizeThatFits(size)
    let titleHeight = titleCapsule.sizeThatFits(
      CGSize(width: size.width, height: UIView.layoutFittingCompressedSize.height)
    ).height
    return CGSize(
      width: fittingSize.width,
      height: max(fittingSize.height, titleHeight)
    )
  }
}

/// Apple Photos backs its two-line date/time title with its own glass capsule and
/// draws no scrim at all. A bare label is unrecoverable over a bright frame — the
/// pixels under it reach full white, so no black veil at a tolerable opacity gives
/// the text contrast. The capsule is what makes the title legible; the scrims are
/// only a depth cue.
private final class PhotoDetailTitleCapsule: UIVisualEffectView {
  private let titleLabel = UILabel()
  private let subtitleLabel = UILabel()
  private let stack = UIStackView()
  private static let contentInset = UIView().layoutMargins.top

  init() {
    super.init(effect: AdaptiveGlass.effect(fallbackStyle: .systemThinMaterialDark))

    clipsToBounds = true
    layer.cornerCurve = .continuous

    titleLabel.adjustsFontForContentSizeCategory = true
    titleLabel.font = .preferredFont(forTextStyle: .headline)
    titleLabel.textAlignment = .center
    titleLabel.textColor = .white

    subtitleLabel.adjustsFontForContentSizeCategory = true
    subtitleLabel.font = .preferredFont(forTextStyle: .subheadline)
    subtitleLabel.textAlignment = .center
    subtitleLabel.textColor = UIColor.white.withAlphaComponent(0.6)

    stack.axis = .vertical
    stack.alignment = .fill
    stack.addArrangedSubview(titleLabel)
    stack.addArrangedSubview(subtitleLabel)
    contentView.addSubview(stack)

    isAccessibilityElement = true
    accessibilityTraits = .header
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) is not supported")
  }

  func setTitle(_ title: String, subtitle: String) {
    titleLabel.text = title
    titleLabel.isHidden = title.isEmpty
    subtitleLabel.text = subtitle
    subtitleLabel.isHidden = subtitle.isEmpty
    isHidden = title.isEmpty && subtitle.isEmpty
    accessibilityLabel = [title, subtitle].filter { !$0.isEmpty }.joined(separator: ", ")
    invalidateIntrinsicContentSize()
    setNeedsLayout()
  }

  override var intrinsicContentSize: CGSize {
    sizeThatFits(UIView.layoutFittingCompressedSize)
  }

  override func sizeThatFits(_ size: CGSize) -> CGSize {
    let content = contentSize
    let height = content.height + Self.contentInset * 2
    // A capsule has to inset its content by its own corner radius, or the text
    // rides the curve.
    return CGSize(width: ceil(content.width + height), height: ceil(height))
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    layer.cornerRadius = bounds.height / 2

    // The bar clamps the title view to the space it has; the padding gives way
    // before the text does.
    let content = contentSize
    let horizontal = min(bounds.height / 2, max(0, (bounds.width - content.width) / 2))
    let vertical = min(Self.contentInset, max(0, (bounds.height - content.height) / 2))
    stack.frame = bounds.insetBy(dx: horizontal, dy: vertical)
  }

  private var contentSize: CGSize {
    let title = titleLabel.isHidden ? .zero : titleLabel.intrinsicContentSize
    let subtitle = subtitleLabel.isHidden ? .zero : subtitleLabel.intrinsicContentSize
    return CGSize(width: max(title.width, subtitle.width), height: title.height + subtitle.height)
  }
}
