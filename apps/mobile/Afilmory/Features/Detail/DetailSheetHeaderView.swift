import UIKit

final class DetailSheetHeaderView: UIView {
  private let largeLabel = UILabel()
  private let italicLabel = AFLabel.exhibit(size: 17, italic: true, color: AFColor.textSecondary)
  private let gearLabel = AFLabel.ui(size: 13, color: AFColor.textSecondary)
  private let exifLabel = AFLabel.mono(size: 12)
  private let tagsScroller = UIScrollView()
  private let tagsStack = UIStackView()
  private let stack = UIStackView()
  private let headlineRow = UIStackView()

  override init(frame: CGRect) {
    super.init(frame: frame)
    largeLabel.textColor = AFColor.textPrimary
    largeLabel.adjustsFontForContentSizeCategory = true
    largeLabel.numberOfLines = 2
    largeLabel.setContentCompressionResistancePriority(.required, for: .horizontal)
    italicLabel.numberOfLines = 1
    italicLabel.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
    italicLabel.font = AFFont.exhibit(size: 17, italic: true, relativeTo: .body)
    gearLabel.font = AFFont.ui(size: 13, relativeTo: .footnote)
    gearLabel.numberOfLines = 1
    exifLabel.numberOfLines = 1
    exifLabel.adjustsFontSizeToFitWidth = true
    exifLabel.minimumScaleFactor = 0.8
    headlineRow.axis = .horizontal
    headlineRow.alignment = .firstBaseline
    headlineRow.spacing = 10
    headlineRow.addArrangedSubview(largeLabel)
    headlineRow.addArrangedSubview(italicLabel)
    tagsScroller.showsHorizontalScrollIndicator = false
    tagsStack.axis = .horizontal
    tagsStack.spacing = 8
    tagsStack.translatesAutoresizingMaskIntoConstraints = false
    tagsScroller.addSubview(tagsStack)
    tagsScroller.translatesAutoresizingMaskIntoConstraints = false
    stack.axis = .vertical
    stack.alignment = .fill
    stack.spacing = 8
    stack.translatesAutoresizingMaskIntoConstraints = false
    [headlineRow, gearLabel, exifLabel, tagsScroller].forEach(stack.addArrangedSubview)
    stack.setCustomSpacing(14, after: exifLabel)
    addSubview(stack)
    NSLayoutConstraint.activate([
      stack.topAnchor.constraint(equalTo: topAnchor),
      stack.leadingAnchor.constraint(equalTo: leadingAnchor),
      stack.trailingAnchor.constraint(equalTo: trailingAnchor),
      stack.bottomAnchor.constraint(lessThanOrEqualTo: bottomAnchor),
      tagsScroller.heightAnchor.constraint(equalToConstant: 28),
      tagsStack.leadingAnchor.constraint(equalTo: tagsScroller.contentLayoutGuide.leadingAnchor),
      tagsStack.trailingAnchor.constraint(equalTo: tagsScroller.contentLayoutGuide.trailingAnchor),
      tagsStack.topAnchor.constraint(equalTo: tagsScroller.contentLayoutGuide.topAnchor),
      tagsStack.bottomAnchor.constraint(equalTo: tagsScroller.contentLayoutGuide.bottomAnchor),
      tagsStack.heightAnchor.constraint(equalTo: tagsScroller.frameLayoutGuide.heightAnchor),
    ])
    isAccessibilityElement = false
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  func configure(_ model: DetailSheetModel) {
    let headline = model.headline
    let font = headline.isUserText ? AFFont.exhibitUser(size: 28, relativeTo: .title1) : AFFont.exhibit(size: 28, relativeTo: .title1)
    largeLabel.attributedText = NSAttributedString(string: headline.large, attributes: [.font: font, .kern: -0.56])
    largeLabel.accessibilityTraits = .header
    let stacked = headline.isUserText || traitCollection.preferredContentSizeCategory.isAccessibilityCategory
    headlineRow.axis = stacked ? .vertical : .horizontal
    headlineRow.alignment = stacked ? .leading : .firstBaseline
    headlineRow.spacing = stacked ? 4 : 10
    gearLabel.numberOfLines = traitCollection.preferredContentSizeCategory.isAccessibilityCategory ? 2 : 1
    italicLabel.text = headline.italic
    italicLabel.isHidden = headline.italic == nil
    gearLabel.text = model.gear
    gearLabel.isHidden = model.gear == nil
    exifLabel.text = model.exifLine
    exifLabel.isHidden = model.exifLine == nil
    tagsStack.arrangedSubviews.forEach { $0.removeFromSuperview() }
    for tag in model.tags {
      tagsStack.addArrangedSubview(Self.chip(tag))
    }
    tagsScroller.isHidden = model.tags.isEmpty
    tagsScroller.contentOffset = .zero
    accessibilityElements = [largeLabel, italicLabel, gearLabel, exifLabel, tagsStack].filter { !$0.isHidden }
  }

  func fittingHeight(width: CGFloat) -> CGFloat {
    stack.systemLayoutSizeFitting(
      CGSize(width: width, height: UIView.layoutFittingCompressedSize.height),
      withHorizontalFittingPriority: .required,
      verticalFittingPriority: .fittingSizeLevel
    ).height
  }

  private static func chip(_ text: String) -> UIView {
    let label = PaddedLabel()
    label.text = text
    label.font = AFFont.exhibitUser(size: 13)
    label.textColor = AFColor.textPrimary
    label.layer.cornerRadius = 14
    label.layer.borderWidth = 1
    label.layer.borderColor = AFColor.tick.cgColor
    label.accessibilityLabel = String(localized: "Tag \(text)")
    return label
  }
}

final class PaddedLabel: UILabel {
  var insets = UIEdgeInsets(top: 0, left: 12, bottom: 0, right: 12)

  override var intrinsicContentSize: CGSize {
    let size = super.intrinsicContentSize
    return CGSize(width: size.width + insets.left + insets.right, height: 28)
  }

  override func drawText(in rect: CGRect) {
    super.drawText(in: rect.inset(by: insets))
  }
}
