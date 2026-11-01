import UIKit

final class AFFocusTabBar: UIView {
  static let barHeight: CGFloat = 52

  var onSelect: ((AppTab) -> Void)?
  private(set) var selectedTab: AppTab = .exhibition
  var accentColor: UIColor = AFColor.accentFallback {
    didSet { dots.forEach { $0.backgroundColor = accentColor } }
  }

  var itemTitles: [String] { buttons.map { $0.title(for: .normal) ?? "" } }

  private var buttons: [UIButton] = []
  private var dots: [UIView] = []
  private let backdrop = UIVisualEffectView(effect: UIBlurEffect(style: .systemUltraThinMaterialDark))
  private let tint = UIView()
  private let hairline = AFHairlineView()

  override init(frame: CGRect) {
    super.init(frame: frame)
    isAccessibilityElement = false
    accessibilityTraits = .tabBar
    shouldGroupAccessibilityChildren = true

    backdrop.translatesAutoresizingMaskIntoConstraints = false
    tint.translatesAutoresizingMaskIntoConstraints = false
    tint.backgroundColor = AFColor.ground.withAlphaComponent(0.72)
    hairline.translatesAutoresizingMaskIntoConstraints = false
    hairline.backgroundColor = AFColor.hairline
    addSubview(backdrop)
    addSubview(tint)
    addSubview(hairline)

    let stack = UIStackView()
    stack.axis = .horizontal
    stack.distribution = .fillEqually
    stack.translatesAutoresizingMaskIntoConstraints = false
    addSubview(stack)

    for tab in AppTab.allCases {
      let (button, dot) = makeItem(for: tab)
      buttons.append(button)
      dots.append(dot)
      stack.addArrangedSubview(button)
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
      stack.topAnchor.constraint(equalTo: topAnchor),
      stack.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 24),
      stack.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -24),
      stack.heightAnchor.constraint(equalToConstant: Self.barHeight),
    ])
    apply(selected: .exhibition, previous: nil, animated: false)
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  func select(_ tab: AppTab, animated: Bool) {
    guard tab != selectedTab else { return }
    let previous = selectedTab
    selectedTab = tab
    apply(selected: tab, previous: previous, animated: animated)
  }

  private func makeItem(for tab: AppTab) -> (UIButton, UIView) {
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
      dot.topAnchor.constraint(equalTo: button.topAnchor, constant: 34),
    ])
    return (button, dot)
  }

  private func apply(selected: AppTab, previous: AppTab?, animated: Bool) {
    for tab in AppTab.allCases {
      let button = buttons[tab.rawValue]
      let isSelected = tab == selected
      button.setTitleColor(isSelected ? AFColor.textPrimary : AFColor.textTertiary, for: .normal)
      button.accessibilityTraits = isSelected ? [.button, .selected] : .button
      if !isSelected {
        dots[tab.rawValue].alpha = 0
      }
    }
    let dot = dots[selected.rawValue]
    guard animated, let label = buttons[selected.rawValue].titleLabel else {
      dot.alpha = 1
      dot.transform = .identity
      return
    }
    AFMotion.afLock(label: label, dot: dot)
    if let previous, let previousLabel = buttons[previous.rawValue].titleLabel, !AFMotion.reduceMotion {
      AFMotion.defocus(previousLabel, amount: 0.4)
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.28) {
        AFMotion.refocus(previousLabel)
      }
    }
  }
}
