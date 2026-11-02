import UIKit

final class AFFocusTabBar: UIView {
  static let barHeight: CGFloat = 52

  var onSelect: ((AppTab) -> Void)?
  private(set) var selectedTab: AppTab = .exhibition
  var accentColor: UIColor = AFColor.accentFallback {
    didSet { items.forEach { $0.dot.backgroundColor = accentColor } }
  }

  var axis: NSLayoutConstraint.Axis = .horizontal {
    didSet {
      guard axis != oldValue else { return }
      applyAxis()
    }
  }

  var itemTitles: [String] { items.map { $0.button.accessibilityLabel ?? "" } }

  private struct Item {
    let button: UIButton
    let dot: UIView
    let verticalLabel: AFFocusTabVerticalLabel
    let horizontalConstraints: [NSLayoutConstraint]
    let verticalConstraints: [NSLayoutConstraint]
  }

  private var items: [Item] = []
  private let stack = UIStackView()
  private let backdrop = UIVisualEffectView(effect: UIBlurEffect(style: .systemUltraThinMaterialDark))
  private let tint = UIView()
  private let hairline = AFHairlineView()
  private var horizontalLayout: [NSLayoutConstraint] = []
  private var verticalLayout: [NSLayoutConstraint] = []

  override init(frame: CGRect) {
    super.init(frame: frame)
    isAccessibilityElement = false
    accessibilityTraits = .tabBar
    shouldGroupAccessibilityChildren = true

    [backdrop, tint, hairline, stack].forEach {
      $0.translatesAutoresizingMaskIntoConstraints = false
      addSubview($0)
    }
    tint.backgroundColor = AFColor.ground.withAlphaComponent(0.72)
    hairline.backgroundColor = AFColor.hairline
    stack.axis = .horizontal
    stack.distribution = .fillEqually

    for tab in AppTab.allCases {
      let item = makeItem(for: tab)
      items.append(item)
      stack.addArrangedSubview(item.button)
    }

    NSLayoutConstraint.activate([
      backdrop.topAnchor.constraint(equalTo: topAnchor),
      backdrop.leadingAnchor.constraint(equalTo: leadingAnchor),
      backdrop.trailingAnchor.constraint(equalTo: trailingAnchor),
      backdrop.bottomAnchor.constraint(equalTo: bottomAnchor),
      tint.topAnchor.constraint(equalTo: topAnchor),
      tint.leadingAnchor.constraint(equalTo: leadingAnchor),
      tint.trailingAnchor.constraint(equalTo: trailingAnchor),
      tint.bottomAnchor.constraint(equalTo: bottomAnchor),
      hairline.topAnchor.constraint(equalTo: topAnchor),
      hairline.leadingAnchor.constraint(equalTo: leadingAnchor),
      hairline.trailingAnchor.constraint(equalTo: trailingAnchor),
    ])
    horizontalLayout = [
      stack.topAnchor.constraint(equalTo: topAnchor),
      stack.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 24),
      stack.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -24),
      stack.heightAnchor.constraint(equalToConstant: Self.barHeight),
    ]
    verticalLayout = [
      stack.centerXAnchor.constraint(equalTo: centerXAnchor),
      stack.centerYAnchor.constraint(equalTo: centerYAnchor),
      stack.widthAnchor.constraint(equalTo: widthAnchor),
    ]
    applyAxis()
    apply(selected: .exhibition, animated: false)
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  func select(_ tab: AppTab, animated: Bool) {
    guard tab != selectedTab else { return }
    selectedTab = tab
    apply(selected: tab, animated: animated)
  }

  private func applyAxis() {
    let vertical = axis == .vertical
    NSLayoutConstraint.deactivate(vertical ? horizontalLayout : verticalLayout)
    NSLayoutConstraint.activate(vertical ? verticalLayout : horizontalLayout)
    stack.axis = axis
    stack.distribution = vertical ? .equalSpacing : .fillEqually
    stack.alignment = vertical ? .center : .fill
    stack.spacing = vertical ? 26 : 0
    [backdrop, tint, hairline].forEach { $0.isHidden = vertical }
    for (index, item) in items.enumerated() {
      let title = AppTab.allCases[index].title
      NSLayoutConstraint.deactivate(vertical ? item.horizontalConstraints : item.verticalConstraints)
      NSLayoutConstraint.activate(vertical ? item.verticalConstraints : item.horizontalConstraints)
      item.button.setTitle(vertical ? nil : title, for: .normal)
      item.verticalLabel.isHidden = !vertical
    }
    apply(selected: selectedTab, animated: false)
  }

  private func makeItem(for tab: AppTab) -> Item {
    let button = UIButton(type: .custom)
    button.setTitle(tab.title, for: .normal)
    button.titleLabel?.font = AFFont.ui(size: 13, weight: .medium)
    button.titleLabel?.adjustsFontForContentSizeCategory = false
    button.setTitleColor(AFColor.textTertiary, for: .normal)
    button.contentVerticalAlignment = .top
    button.titleEdgeInsets = UIEdgeInsets(top: 10, left: 0, bottom: 0, right: 0)
    button.accessibilityLabel = tab.title
    button.accessibilityIdentifier = "tab.\(tab)"
    button.addAction(UIAction { [weak self] _ in self?.onSelect?(tab) }, for: .touchUpInside)

    let verticalLabel = AFFocusTabVerticalLabel(title: tab.title)
    verticalLabel.translatesAutoresizingMaskIntoConstraints = false
    verticalLabel.isUserInteractionEnabled = false
    button.addSubview(verticalLabel)

    let dot = UIView()
    dot.translatesAutoresizingMaskIntoConstraints = false
    dot.backgroundColor = accentColor
    dot.layer.cornerRadius = 2
    dot.isUserInteractionEnabled = false
    button.addSubview(dot)
    NSLayoutConstraint.activate([
      dot.widthAnchor.constraint(equalToConstant: 4),
      dot.heightAnchor.constraint(equalToConstant: 4),
      dot.centerXAnchor.constraint(equalTo: button.centerXAnchor),
    ])
    let horizontal = [dot.topAnchor.constraint(equalTo: button.topAnchor, constant: 34)]
    let vertical = [
      verticalLabel.topAnchor.constraint(equalTo: button.topAnchor, constant: 6),
      verticalLabel.centerXAnchor.constraint(equalTo: button.centerXAnchor),
      button.widthAnchor.constraint(equalToConstant: 44),
      dot.topAnchor.constraint(equalTo: verticalLabel.bottomAnchor, constant: 6),
      button.bottomAnchor.constraint(equalTo: dot.bottomAnchor, constant: 6),
    ]
    return Item(button: button, dot: dot, verticalLabel: verticalLabel, horizontalConstraints: horizontal, verticalConstraints: vertical)
  }

  private func apply(selected: AppTab, animated: Bool) {
    for tab in AppTab.allCases {
      let item = items[tab.rawValue]
      let isSelected = tab == selected
      let color = isSelected ? AFColor.textPrimary : AFColor.textTertiary
      item.button.setTitleColor(color, for: .normal)
      item.verticalLabel.textColor = color
      item.button.accessibilityTraits = isSelected ? [.button, .selected] : .button
      if !isSelected {
        item.dot.layer.removeAllAnimations()
        item.dot.alpha = 0
      }
    }
    let dot = items[selected.rawValue].dot
    dot.layer.removeAllAnimations()
    dot.alpha = 1
    dot.transform = .identity
    guard animated else { return }
    UISelectionFeedbackGenerator().selectionChanged()
    guard !AFMotion.reduceMotion else { return }
    dot.transform = CGAffineTransform(scaleX: 0.01, y: 0.01)
    UIView.animate(withDuration: 0.22, delay: 0, options: [.allowUserInteraction, .beginFromCurrentState, .curveEaseOut]) {
      dot.transform = .identity
    }
  }
}
