import UIKit

final class ContactSheetScaleControl: UIView {
  var onSelect: ((ContactSheetLevel) -> Void)?

  private var buttons: [ContactSheetLevel: UIButton] = [:]
  private var markers: [ContactSheetLevel: UILabel] = [:]
  private var labels: [ContactSheetLevel: UILabel] = [:]
  private let stack = UIStackView()
  private(set) var selected: ContactSheetLevel = .day
  private var accent = AFColor.accentFallback

  override init(frame: CGRect) {
    super.init(frame: frame)
    stack.axis = .horizontal
    stack.alignment = .bottom
    stack.spacing = 0
    stack.translatesAutoresizingMaskIntoConstraints = false
    addSubview(stack)
    NSLayoutConstraint.activate([
      stack.leadingAnchor.constraint(equalTo: leadingAnchor),
      stack.trailingAnchor.constraint(equalTo: trailingAnchor),
      stack.topAnchor.constraint(equalTo: topAnchor),
      stack.bottomAnchor.constraint(equalTo: bottomAnchor),
    ])
    for level in ContactSheetLevel.allCases {
      let button = makeButton(level)
      buttons[level] = button
      stack.addArrangedSubview(button)
    }
    accessibilityElements = ContactSheetLevel.allCases.compactMap { buttons[$0] }
    apply(animated: false)
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  func setAvailable(_ levels: [ContactSheetLevel]) {
    for (level, button) in buttons {
      button.isHidden = !levels.contains(level)
    }
  }

  func select(_ level: ContactSheetLevel, animated: Bool) {
    guard level != selected else { return }
    selected = level
    apply(animated: animated)
  }

  func setAccent(_ color: UIColor) {
    accent = color
    markers[selected]?.textColor = color
  }

  private func makeButton(_ level: ContactSheetLevel) -> UIButton {
    let button = UIButton(type: .custom)
    button.accessibilityLabel = Self.accessibilityName(level)
    button.addAction(UIAction { [weak self] _ in self?.onSelect?(level) }, for: .primaryActionTriggered)
    let marker = UILabel()
    marker.text = "▾"
    marker.font = .systemFont(ofSize: 9)
    let label = UILabel()
    label.text = level.label
    label.font = AFFont.exhibit(size: 17, relativeTo: .body)
    label.adjustsFontForContentSizeCategory = true
    let ticks = UIStackView(arrangedSubviews: [7, 4, 4, 4].map { height in
      let tick = UIView()
      tick.backgroundColor = AFColor.tick
      tick.translatesAutoresizingMaskIntoConstraints = false
      NSLayoutConstraint.activate([tick.widthAnchor.constraint(equalToConstant: 1), tick.heightAnchor.constraint(equalToConstant: height)])
      return tick
    })
    ticks.axis = .horizontal
    ticks.spacing = 5
    ticks.alignment = .bottom
    let column = UIStackView(arrangedSubviews: [marker, label, ticks])
    column.axis = .vertical
    column.alignment = .center
    column.spacing = 5
    column.isUserInteractionEnabled = false
    column.translatesAutoresizingMaskIntoConstraints = false
    button.addSubview(column)
    NSLayoutConstraint.activate([
      column.centerXAnchor.constraint(equalTo: button.centerXAnchor),
      column.bottomAnchor.constraint(equalTo: button.bottomAnchor, constant: -4),
      column.topAnchor.constraint(equalTo: button.topAnchor, constant: 2),
      button.widthAnchor.constraint(greaterThanOrEqualToConstant: 40),
      button.widthAnchor.constraint(greaterThanOrEqualTo: column.widthAnchor, constant: 10),
      button.heightAnchor.constraint(greaterThanOrEqualToConstant: 48),
    ])
    markers[level] = marker
    labels[level] = label
    return button
  }

  private func apply(animated: Bool) {
    let changes = {
      for level in ContactSheetLevel.allCases {
        let active = level == self.selected
        self.labels[level]?.textColor = active ? AFColor.textPrimary : AFColor.textTertiary
        self.markers[level]?.alpha = active ? 1 : 0
        self.markers[level]?.textColor = self.accent
        self.markers[level]?.transform = active ? .identity : CGAffineTransform(translationX: 0, y: -4)
        self.buttons[level]?.accessibilityTraits = active ? [.button, .selected] : .button
      }
    }
    animated ? AFMotion.spring(duration: 0.42, animations: changes) : changes()
  }

  private static func accessibilityName(_ level: ContactSheetLevel) -> String {
    switch level {
    case .day: String(localized: "By day")
    case .month: String(localized: "By month")
    case .year: String(localized: "By year")
    case .infinity: String(localized: "Map")
    }
  }
}
