import UIKit

final class DarkroomRowButton: UIButton {
  enum Style {
    case navigation
    case value
    case destructive
  }

  private let iconView = UIImageView()
  private let titleText = UILabel()
  private let detailText = UILabel()
  private let chevron = UIImageView()
  private let separator = AFHairlineView()
  private let spinner = UIActivityIndicatorView(style: .medium)

  var detail: String? {
    didSet {
      detailText.text = detail
      detailText.isHidden = detail?.isEmpty ?? true
      accessibilityValue = detail
    }
  }

  var showsSeparator = true {
    didSet { separator.isHidden = !showsSeparator }
  }

  override var isSelected: Bool {
    didSet { backgroundColor = isSelected ? AFColor.fill : .clear }
  }

  var isBusy = false {
    didSet {
      isBusy ? spinner.startAnimating() : spinner.stopAnimating()
      chevron.alpha = isBusy ? 0 : 1
    }
  }

  init(symbol: String, title: String, style: Style = .navigation) {
    super.init(frame: .zero)
    let tint = style == .destructive ? AFColor.destructive : AFColor.textPrimary
    iconView.image = UIImage(systemName: symbol, withConfiguration: UIImage.SymbolConfiguration(pointSize: 17, weight: .light))
    iconView.tintColor = style == .destructive ? AFColor.destructive : AFColor.textTertiary
    iconView.contentMode = .center
    titleText.text = title
    titleText.font = AFFont.ui(size: 16, relativeTo: .body)
    titleText.textColor = tint
    titleText.adjustsFontForContentSizeCategory = true
    titleText.numberOfLines = 0
    detailText.font = UIFontMetrics(forTextStyle: .footnote).scaledFont(for: AFFont.mono(size: 12))
    detailText.textColor = AFColor.textTertiary
    detailText.adjustsFontForContentSizeCategory = true
    detailText.textAlignment = .right
    detailText.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
    detailText.isHidden = true
    chevron.image = UIImage(systemName: "chevron.right", withConfiguration: UIImage.SymbolConfiguration(pointSize: 13, weight: .regular))
    chevron.tintColor = AFColor.textTertiary
    chevron.isHidden = style != .navigation
    chevron.setContentHuggingPriority(.required, for: .horizontal)
    separator.backgroundColor = AFColor.hairline
    spinner.color = AFColor.textTertiary
    spinner.hidesWhenStopped = true
    accessibilityLabel = title
    accessibilityTraits = .button
    layout()
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  override var isHighlighted: Bool {
    didSet { backgroundColor = isHighlighted ? AFColor.fill : .clear }
  }

  override var isEnabled: Bool {
    didSet { alpha = isEnabled ? 1 : 0.45 }
  }

  private func layout() {
    let trailing = UIStackView(arrangedSubviews: [detailText, spinner, chevron])
    trailing.spacing = 6
    trailing.alignment = .center
    for view in [iconView, titleText, trailing, separator] as [UIView] {
      view.translatesAutoresizingMaskIntoConstraints = false
      view.isUserInteractionEnabled = false
      addSubview(view)
    }
    titleText.setContentCompressionResistancePriority(.required, for: .horizontal)
    NSLayoutConstraint.activate([
      heightAnchor.constraint(greaterThanOrEqualToConstant: 54),
      iconView.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 16),
      iconView.widthAnchor.constraint(equalToConstant: 22),
      iconView.centerYAnchor.constraint(equalTo: centerYAnchor),
      titleText.leadingAnchor.constraint(equalTo: iconView.trailingAnchor, constant: 14),
      titleText.topAnchor.constraint(greaterThanOrEqualTo: topAnchor, constant: 14),
      titleText.bottomAnchor.constraint(lessThanOrEqualTo: bottomAnchor, constant: -14),
      titleText.centerYAnchor.constraint(equalTo: centerYAnchor),
      trailing.leadingAnchor.constraint(greaterThanOrEqualTo: titleText.trailingAnchor, constant: 10),
      trailing.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -14),
      trailing.centerYAnchor.constraint(equalTo: centerYAnchor),
      separator.leadingAnchor.constraint(equalTo: titleText.leadingAnchor),
      separator.trailingAnchor.constraint(equalTo: trailingAnchor),
      separator.bottomAnchor.constraint(equalTo: bottomAnchor),
    ])
  }
}

final class DarkroomGroupView: UIView {
  private let stack = UIStackView()

  init(rows: [UIView]) {
    super.init(frame: .zero)
    backgroundColor = AFColor.raised
    layer.cornerRadius = 22
    layer.cornerCurve = .continuous
    layer.borderWidth = 1
    layer.borderColor = AFColor.hairline.cgColor
    clipsToBounds = true
    stack.axis = .vertical
    stack.translatesAutoresizingMaskIntoConstraints = false
    addSubview(stack)
    NSLayoutConstraint.activate([
      stack.topAnchor.constraint(equalTo: topAnchor),
      stack.leadingAnchor.constraint(equalTo: leadingAnchor),
      stack.trailingAnchor.constraint(equalTo: trailingAnchor),
      stack.bottomAnchor.constraint(equalTo: bottomAnchor),
    ])
    rows.forEach(stack.addArrangedSubview)
    refreshSeparators()
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  func refreshSeparators() {
    let visible = stack.arrangedSubviews.filter { !$0.isHidden }
    for row in stack.arrangedSubviews.compactMap({ $0 as? DarkroomRowButton }) {
      row.showsSeparator = row !== visible.last
    }
  }

  static func sectionLabel(_ text: String) -> UILabel {
    let label = UILabel()
    label.attributedText = NSAttributedString(
      string: text.uppercased(),
      attributes: [.kern: 1.0, .font: AFFont.mono(size: 10), .foregroundColor: AFColor.textTertiary]
    )
    label.accessibilityTraits = .header
    label.accessibilityLabel = text
    return label
  }
}
