import UIKit

final class ExhibitPageView: UIView {
  let scrollView = UIScrollView()
  let photoCard = UIView()
  let imageView = UIImageView()
  let labelStack = UIStackView()
  let actions = UIStackView()

  private let kickerDot = UIView()
  private let kickerLabel = UILabel()
  private let titleLabel = AFLabel.exhibit(nil, size: 34)
  private let bodyLabel = AFLabel.ui(nil, size: 15)
  private let content = UIView()
  private var photoHeight: NSLayoutConstraint?

  private(set) var accent: UIColor = AFColor.accentFallback

  init(photoFraction: CGFloat = 0.53) {
    super.init(frame: .zero)
    backgroundColor = AFColor.ground

    photoCard.backgroundColor = AFColor.filmBase
    photoCard.layer.cornerRadius = AFRadius.card
    photoCard.layer.cornerCurve = .continuous
    photoCard.clipsToBounds = true
    imageView.contentMode = .scaleAspectFill
    imageView.clipsToBounds = true
    imageView.translatesAutoresizingMaskIntoConstraints = false
    for axis in [NSLayoutConstraint.Axis.horizontal, .vertical] {
      imageView.setContentCompressionResistancePriority(.fittingSizeLevel, for: axis)
      imageView.setContentHuggingPriority(.fittingSizeLevel, for: axis)
    }
    photoCard.addSubview(imageView)

    kickerDot.layer.cornerRadius = 3.5
    kickerDot.translatesAutoresizingMaskIntoConstraints = false
    kickerLabel.adjustsFontForContentSizeCategory = true
    let kicker = UIStackView(arrangedSubviews: [kickerDot, kickerLabel])
    kicker.spacing = 8
    kicker.alignment = .center
    kicker.isAccessibilityElement = false

    titleLabel.font = AFFont.exhibit(size: 34, relativeTo: .largeTitle)
    titleLabel.numberOfLines = 0
    titleLabel.accessibilityTraits = .header
    for label in [kickerLabel, titleLabel, bodyLabel] {
      label.setContentCompressionResistancePriority(.required, for: .vertical)
    }
    bodyLabel.font = AFFont.ui(size: 15, relativeTo: .body)
    bodyLabel.numberOfLines = 0

    labelStack.addArrangedSubview(kicker)
    labelStack.addArrangedSubview(titleLabel)
    labelStack.addArrangedSubview(bodyLabel)
    labelStack.axis = .vertical
    labelStack.spacing = 10
    labelStack.alignment = .leading

    actions.axis = .vertical
    actions.spacing = 12
    actions.alignment = .fill

    scrollView.contentInsetAdjustmentBehavior = .never
    scrollView.showsVerticalScrollIndicator = false
    scrollView.translatesAutoresizingMaskIntoConstraints = false
    content.translatesAutoresizingMaskIntoConstraints = false
    addSubview(scrollView)
    scrollView.addSubview(content)
    for view in [photoCard, labelStack, actions] as [UIView] {
      view.translatesAutoresizingMaskIntoConstraints = false
      content.addSubview(view)
    }
    let frame = scrollView.frameLayoutGuide
    let compact = content.heightAnchor.constraint(equalTo: frame.heightAnchor)
    compact.priority = UILayoutPriority(260)
    let labelBottom = labelStack.bottomAnchor.constraint(lessThanOrEqualTo: actions.topAnchor, constant: -20)
    let photo = photoCard.heightAnchor.constraint(equalTo: heightAnchor, multiplier: photoFraction)
    photo.priority = .defaultLow
    photoHeight = photo
    let minimumPhoto = photoCard.heightAnchor.constraint(greaterThanOrEqualTo: heightAnchor, multiplier: 0.24)
    NSLayoutConstraint.activate([
      scrollView.topAnchor.constraint(equalTo: safeAreaLayoutGuide.topAnchor),
      scrollView.bottomAnchor.constraint(equalTo: safeAreaLayoutGuide.bottomAnchor),
      scrollView.leadingAnchor.constraint(equalTo: leadingAnchor),
      scrollView.trailingAnchor.constraint(equalTo: trailingAnchor),
      content.topAnchor.constraint(equalTo: scrollView.contentLayoutGuide.topAnchor),
      content.bottomAnchor.constraint(equalTo: scrollView.contentLayoutGuide.bottomAnchor),
      content.leadingAnchor.constraint(equalTo: scrollView.contentLayoutGuide.leadingAnchor),
      content.trailingAnchor.constraint(equalTo: scrollView.contentLayoutGuide.trailingAnchor),
      content.widthAnchor.constraint(equalTo: frame.widthAnchor),
      content.heightAnchor.constraint(greaterThanOrEqualTo: frame.heightAnchor),
      compact,
      photoCard.topAnchor.constraint(equalTo: content.topAnchor, constant: 18),
      photoCard.leadingAnchor.constraint(equalTo: readableLeading, constant: 12),
      photoCard.trailingAnchor.constraint(equalTo: readableTrailing, constant: -12),
      photo,
      minimumPhoto,
      imageView.topAnchor.constraint(equalTo: photoCard.topAnchor),
      imageView.leadingAnchor.constraint(equalTo: photoCard.leadingAnchor),
      imageView.trailingAnchor.constraint(equalTo: photoCard.trailingAnchor),
      imageView.bottomAnchor.constraint(equalTo: photoCard.bottomAnchor),
      kickerDot.widthAnchor.constraint(equalToConstant: 7),
      kickerDot.heightAnchor.constraint(equalToConstant: 7),
      labelStack.topAnchor.constraint(equalTo: photoCard.bottomAnchor, constant: 24),
      labelStack.leadingAnchor.constraint(equalTo: readableLeading, constant: 28),
      labelStack.trailingAnchor.constraint(equalTo: readableTrailing, constant: -28),
      labelBottom,
      actions.leadingAnchor.constraint(equalTo: readableLeading, constant: 24),
      actions.trailingAnchor.constraint(equalTo: readableTrailing, constant: -24),
      actions.bottomAnchor.constraint(equalTo: content.bottomAnchor, constant: -8),
    ])
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  private lazy var column: UILayoutGuide = {
    let guide = UILayoutGuide()
    content.addLayoutGuide(guide)
    let width = guide.widthAnchor.constraint(equalTo: content.widthAnchor)
    width.priority = .defaultHigh
    NSLayoutConstraint.activate([
      guide.centerXAnchor.constraint(equalTo: content.centerXAnchor),
      guide.widthAnchor.constraint(lessThanOrEqualToConstant: 430),
      guide.widthAnchor.constraint(lessThanOrEqualTo: content.widthAnchor),
      width,
      guide.topAnchor.constraint(equalTo: content.topAnchor),
      guide.bottomAnchor.constraint(equalTo: content.bottomAnchor),
    ])
    return guide
  }()

  override func layoutSubviews() {
    super.layoutSubviews()
    scrollView.layoutIfNeeded()
    scrollView.isScrollEnabled = scrollView.contentSize.height > scrollView.bounds.height + 0.5
  }

  private var readableLeading: NSLayoutXAxisAnchor { column.leadingAnchor }
  private var readableTrailing: NSLayoutXAxisAnchor { column.trailingAnchor }

  func configure(image: UIImage?, kicker: String, number: Int?, title: String, body: String) {
    imageView.image = image
    accent = image.map(AccentExtractor.accent(for:)) ?? AFColor.accentFallback
    kickerDot.backgroundColor = accent
    let text = NSMutableAttributedString(
      string: number == nil ? kicker : "\(kicker) · ",
      attributes: [.font: AFFont.exhibit(size: 17, relativeTo: .headline), .foregroundColor: AFColor.textPrimary]
    )
    if let number {
      text.append(NSAttributedString(
        string: "No. \(number)",
        attributes: [.font: AFFont.exhibit(size: 17, italic: true, relativeTo: .headline), .foregroundColor: AFColor.textPrimary]
      ))
    }
    kickerLabel.attributedText = text
    titleLabel.text = title
    bodyLabel.text = body
    bodyLabel.isHidden = body.isEmpty
    labelStack.isAccessibilityElement = true
    labelStack.accessibilityLabel = [kickerLabel.text, title, body].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: ", ")
  }

  func setPhotoFraction(_ fraction: CGFloat) {
    photoHeight?.isActive = false
    let photo = photoCard.heightAnchor.constraint(equalTo: heightAnchor, multiplier: fraction)
    photo.priority = .defaultLow
    photo.isActive = true
    photoHeight = photo
  }
}

@MainActor
enum AFTextButton {
  static func make(_ title: String, color: UIColor = AFColor.textSecondary, action: @escaping () -> Void) -> UIButton {
    var configuration = UIButton.Configuration.plain()
    configuration.baseForegroundColor = color
    configuration.titleTextAttributesTransformer = UIConfigurationTextAttributesTransformer { attributes in
      var updated = attributes
      updated.font = AFFont.ui(size: 15, relativeTo: .body)
      return updated
    }
    let button = UIButton(configuration: configuration, primaryAction: UIAction { _ in action() })
    button.setTitle(title, for: .normal)
    button.heightAnchor.constraint(greaterThanOrEqualToConstant: 44).isActive = true
    return button
  }
}
