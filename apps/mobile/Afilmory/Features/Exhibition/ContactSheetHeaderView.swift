import UIKit

final class ContactSheetHeaderView: UIView {
  var onSelectLevel: ((ContactSheetLevel) -> Void)? {
    get { scale.onSelect }
    set { scale.onSelect = newValue }
  }

  var onEditQuery: (() -> Void)?
  var onClearQuery: (() -> Void)?

  let titleLabel = AFLabel.exhibit(size: 30)
  private let captionLabel = AFLabel.mono(size: 11)
  let scale = ContactSheetScaleControl()
  private let chip = UIView()
  private let chipLabel = AFLabel.exhibitUser(size: 14)
  private lazy var chipEdit = UIButton(type: .custom, primaryAction: UIAction { [weak self] _ in self?.onEditQuery?() })
  private lazy var chipClear = UIButton(type: .system, primaryAction: UIAction { [weak self] _ in self?.onClearQuery?() })
  private var query: String?

  override init(frame: CGRect) {
    super.init(frame: frame)
    titleLabel.attributedText = NSAttributedString(
      string: String(localized: "Contact Sheet"),
      attributes: [.kern: -0.6]
    )
    titleLabel.accessibilityTraits = .header
    titleLabel.translatesAutoresizingMaskIntoConstraints = true
    captionLabel.translatesAutoresizingMaskIntoConstraints = true
    captionLabel.numberOfLines = 1
    captionLabel.adjustsFontSizeToFitWidth = true
    captionLabel.minimumScaleFactor = 0.8
    chip.backgroundColor = AFColor.fill
    chip.layer.cornerRadius = 18
    chip.layer.cornerCurve = .continuous
    chip.isHidden = true
    chipLabel.translatesAutoresizingMaskIntoConstraints = true
    chipLabel.textColor = AFColor.textPrimary
    chipEdit.accessibilityLabel = String(localized: "Edit search and filters")
    chipClear.setImage(UIImage(systemName: "xmark", withConfiguration: UIImage.SymbolConfiguration(pointSize: 11, weight: .bold)), for: .normal)
    chipClear.tintColor = AFColor.textSecondary
    chipClear.accessibilityLabel = String(localized: "Clear search and filters")
    let glass = UIImageView(image: UIImage(systemName: "magnifyingglass", withConfiguration: UIImage.SymbolConfiguration(pointSize: 12, weight: .semibold)))
    glass.tintColor = AFColor.textTertiary
    glass.tag = 1
    [glass, chipLabel, chipEdit, chipClear].forEach(chip.addSubview)
    [titleLabel, captionLabel, scale, chip].forEach(addSubview)
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  func configure(caption: String, level: ContactSheetLevel, levels: [ContactSheetLevel], query: String?, animated: Bool) {
    captionLabel.text = caption
    scale.setAvailable(levels)
    scale.select(level, animated: animated)
    self.query = query
    chipLabel.text = query
    chip.isHidden = query == nil
    chipEdit.accessibilityValue = query
    setNeedsLayout()
  }

  func height(for width: CGFloat) -> CGFloat {
    layout(width: width, apply: false)
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    _ = layout(width: bounds.width, apply: true)
  }

  private func layout(width: CGFloat, apply: Bool) -> CGFloat {
    let titleSize = titleLabel.sizeThatFits(CGSize(width: width, height: .greatestFiniteMagnitude))
    let captionHeight = captionLabel.font.lineHeight
    let scaleSize = scale.systemLayoutSizeFitting(UIView.layoutFittingCompressedSize)
    let textHeight = titleSize.height + 6 + captionHeight
    let inline = titleSize.width + 16 + scaleSize.width <= width
    var y: CGFloat
    if inline {
      let rowHeight = max(textHeight, scaleSize.height)
      if apply {
        titleLabel.frame = CGRect(x: 0, y: rowHeight - textHeight, width: titleSize.width, height: titleSize.height)
        captionLabel.frame = CGRect(x: 0, y: titleLabel.frame.maxY + 6, width: width - scaleSize.width - 8, height: captionHeight)
        scale.frame = CGRect(x: width - scaleSize.width, y: rowHeight - scaleSize.height, width: scaleSize.width, height: scaleSize.height)
      }
      y = rowHeight
    } else {
      if apply {
        titleLabel.frame = CGRect(x: 0, y: 0, width: min(width, titleSize.width), height: titleSize.height)
        captionLabel.frame = CGRect(x: 0, y: titleLabel.frame.maxY + 6, width: width, height: captionHeight)
        scale.frame = CGRect(x: width - scaleSize.width, y: captionLabel.frame.maxY + 8, width: scaleSize.width, height: scaleSize.height)
      }
      y = textHeight + 8 + scaleSize.height
    }
    guard query != nil else { return y }
    let chipTop = y + 12
    if apply {
      let maxLabel = width - 34 - 40
      let labelSize = chipLabel.sizeThatFits(CGSize(width: maxLabel, height: 36))
      let chipWidth = min(width, 34 + min(maxLabel, labelSize.width) + 40)
      chip.frame = CGRect(x: 0, y: chipTop, width: chipWidth, height: 36)
      chip.viewWithTag(1)?.frame = CGRect(x: 12, y: 11, width: 14, height: 14)
      chipLabel.frame = CGRect(x: 34, y: 0, width: min(maxLabel, labelSize.width), height: 36)
      chipEdit.frame = CGRect(x: 0, y: 0, width: chipWidth - 40, height: 36)
      chipClear.frame = CGRect(x: chipWidth - 40, y: 0, width: 40, height: 36)
    }
    return chipTop + 36
  }
}
