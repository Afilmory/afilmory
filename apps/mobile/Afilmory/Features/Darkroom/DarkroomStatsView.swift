import UIKit

final class DarkroomStatsView: UIStackView {
  private let frames = DarkroomStatCard(caption: String(localized: "frames"))
  private let megabytes = DarkroomStatCard(caption: String(localized: "MB originals"))
  private let bodies = DarkroomStatCard(caption: String(localized: "camera bodies"))

  init() {
    super.init(frame: .zero)
    axis = .horizontal
    distribution = .fillEqually
    alignment = .fill
    spacing = 10
    [frames, megabytes, bodies].forEach(addArrangedSubview)
  }

  @available(*, unavailable)
  required init(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  func apply(_ stats: DarkroomStats?) {
    frames.value = stats.map { NativeStudioFormatters.count($0.frames) }
    megabytes.value = stats.map { NativeStudioFormatters.count($0.megabytes) }
    bodies.value = stats.map { NativeStudioFormatters.count($0.bodies) }
  }
}

private final class DarkroomStatCard: UIView {
  private let valueLabel = AFLabel.exhibit("–", size: 28)
  private let captionLabel = AFLabel.mono(nil, size: 10)
  private let caption: String

  var value: String? {
    didSet {
      valueLabel.text = value ?? "–"
      accessibilityLabel = "\(value ?? "–") \(caption)"
    }
  }

  init(caption: String) {
    self.caption = caption
    super.init(frame: .zero)
    backgroundColor = AFColor.raised
    layer.cornerRadius = 20
    layer.cornerCurve = .continuous
    layer.borderWidth = 1
    layer.borderColor = AFColor.hairline.cgColor
    valueLabel.font = AFFont.exhibit(size: 28, relativeTo: .title1)
    valueLabel.adjustsFontSizeToFitWidth = true
    valueLabel.minimumScaleFactor = 0.5
    captionLabel.text = caption
    captionLabel.numberOfLines = 0
    captionLabel.font = UIFontMetrics(forTextStyle: .caption2).scaledFont(for: AFFont.mono(size: 10))
    let stack = UIStackView(arrangedSubviews: [valueLabel, captionLabel])
    stack.axis = .vertical
    stack.spacing = 4
    stack.translatesAutoresizingMaskIntoConstraints = false
    addSubview(stack)
    NSLayoutConstraint.activate([
      stack.topAnchor.constraint(equalTo: topAnchor, constant: 14),
      stack.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 14),
      stack.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -14),
      stack.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -14),
    ])
    isAccessibilityElement = true
    accessibilityLabel = "– \(caption)"
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }
}

final class DarkroomQuotaRow: UIButton {
  private let titleText = UILabel()
  private let detailText = UILabel()

  init(title: String, detail: String) {
    super.init(frame: .zero)
    backgroundColor = AFColor.raised
    layer.cornerRadius = 22
    layer.cornerCurve = .continuous
    layer.borderWidth = 1
    layer.borderColor = AFColor.destructive.withAlphaComponent(0.35).cgColor
    let icon = UIImageView(image: UIImage(systemName: "exclamationmark.triangle", withConfiguration: UIImage.SymbolConfiguration(pointSize: 16, weight: .regular)))
    icon.tintColor = AFColor.destructive
    icon.setContentHuggingPriority(.required, for: .horizontal)
    titleText.text = title
    titleText.font = AFFont.ui(size: 15, weight: .medium, relativeTo: .subheadline)
    titleText.textColor = AFColor.destructive
    titleText.numberOfLines = 0
    titleText.adjustsFontForContentSizeCategory = true
    detailText.text = detail
    detailText.font = UIFontMetrics(forTextStyle: .caption1).scaledFont(for: AFFont.mono(size: 11))
    detailText.textColor = AFColor.destructive.withAlphaComponent(0.8)
    detailText.adjustsFontForContentSizeCategory = true
    let chevron = UIImageView(image: UIImage(systemName: "chevron.right", withConfiguration: UIImage.SymbolConfiguration(pointSize: 13)))
    chevron.tintColor = AFColor.destructive
    chevron.setContentHuggingPriority(.required, for: .horizontal)
    let texts = UIStackView(arrangedSubviews: [titleText, detailText])
    texts.axis = .vertical
    texts.spacing = 3
    let row = UIStackView(arrangedSubviews: [icon, texts, chevron])
    row.spacing = 12
    row.alignment = .center
    row.isUserInteractionEnabled = false
    row.translatesAutoresizingMaskIntoConstraints = false
    addSubview(row)
    NSLayoutConstraint.activate([
      row.topAnchor.constraint(equalTo: topAnchor, constant: 14),
      row.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 16),
      row.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -14),
      row.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -14),
    ])
    accessibilityLabel = title
    accessibilityValue = detail
    accessibilityHint = String(localized: "Opens your plan")
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  override var isHighlighted: Bool {
    didSet { backgroundColor = isHighlighted ? AFColor.fill : AFColor.raised }
  }
}
