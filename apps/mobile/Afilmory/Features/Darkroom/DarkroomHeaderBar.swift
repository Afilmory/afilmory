import UIKit

final class DarkroomHeaderBar: UIView {
  private(set) weak var backButton: UIView?

  static let contentHeight: CGFloat = 44

  private let backdrop = UIVisualEffectView(effect: UIBlurEffect(style: .dark))
  private let tint = UIView()
  private let hairline = AFHairlineView()
  let content = UIView()

  override init(frame: CGRect) {
    super.init(frame: frame)
    translatesAutoresizingMaskIntoConstraints = false
    backdrop.translatesAutoresizingMaskIntoConstraints = false
    tint.translatesAutoresizingMaskIntoConstraints = false
    hairline.translatesAutoresizingMaskIntoConstraints = false
    content.translatesAutoresizingMaskIntoConstraints = false
    hairline.backgroundColor = AFColor.hairline
    addSubview(backdrop)
    addSubview(tint)
    addSubview(content)
    addSubview(hairline)
    NSLayoutConstraint.activate([
      backdrop.topAnchor.constraint(equalTo: topAnchor),
      backdrop.leadingAnchor.constraint(equalTo: leadingAnchor),
      backdrop.trailingAnchor.constraint(equalTo: trailingAnchor),
      backdrop.bottomAnchor.constraint(equalTo: bottomAnchor),
      tint.topAnchor.constraint(equalTo: topAnchor),
      tint.leadingAnchor.constraint(equalTo: leadingAnchor),
      tint.trailingAnchor.constraint(equalTo: trailingAnchor),
      tint.bottomAnchor.constraint(equalTo: bottomAnchor),
      content.leadingAnchor.constraint(equalTo: leadingAnchor),
      content.trailingAnchor.constraint(equalTo: trailingAnchor),
      content.bottomAnchor.constraint(equalTo: bottomAnchor),
      content.heightAnchor.constraint(equalToConstant: Self.contentHeight),
      content.topAnchor.constraint(equalTo: safeAreaLayoutGuide.topAnchor),
      hairline.leadingAnchor.constraint(equalTo: leadingAnchor),
      hairline.trailingAnchor.constraint(equalTo: trailingAnchor),
      hairline.bottomAnchor.constraint(equalTo: bottomAnchor),
    ])
    applyTransparency()
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(applyTransparency),
      name: UIAccessibility.reduceTransparencyStatusDidChangeNotification,
      object: nil
    )
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  static func showsChrome(contentOffsetY: CGFloat, adjustedTopInset: CGFloat) -> Bool {
    contentOffsetY > -adjustedTopInset + 1
  }

  func setChromeVisible(_ visible: Bool, animated: Bool) {
    let alpha: CGFloat = visible ? 1 : 0
    guard backdrop.alpha != alpha else { return }
    let changes = { [backdrop, tint, hairline] in
      [backdrop, tint, hairline].forEach { $0.alpha = alpha }
    }
    animated ? UIView.animate(withDuration: 0.2, delay: 0, options: [.beginFromCurrentState, .allowUserInteraction], animations: changes) : changes()
  }

  @objc private func applyTransparency() {
    let opaque = UIAccessibility.isReduceTransparencyEnabled
    backdrop.isHidden = opaque
    tint.backgroundColor = AFColor.ground.withAlphaComponent(opaque ? 1 : 0.82)
  }

  static func root(title: String, accessory: UIView) -> DarkroomHeaderBar {
    let bar = DarkroomHeaderBar()
    let label = AFLabel.exhibit(title, size: 24)
    label.accessibilityTraits = .header
    accessory.translatesAutoresizingMaskIntoConstraints = false
    bar.content.addSubview(label)
    bar.content.addSubview(accessory)
    NSLayoutConstraint.activate([
      label.leadingAnchor.constraint(equalTo: bar.content.leadingAnchor, constant: 20),
      label.centerYAnchor.constraint(equalTo: bar.content.centerYAnchor),
      label.trailingAnchor.constraint(lessThanOrEqualTo: accessory.leadingAnchor, constant: -12),
      accessory.trailingAnchor.constraint(equalTo: bar.content.trailingAnchor, constant: -12),
      accessory.centerYAnchor.constraint(equalTo: bar.content.centerYAnchor),
    ])
    return bar
  }

  static func subpage(title: String, onBack: @escaping () -> Void) -> DarkroomHeaderBar {
    let bar = DarkroomHeaderBar()
    let back = AFGlassButton.symbol("chevron.left", accessibilityLabel: String(localized: "Back"), action: onBack)
    bar.backButton = back
    back.translatesAutoresizingMaskIntoConstraints = false
    let label = AFLabel.exhibit(title, size: 17)
    label.accessibilityTraits = .header
    label.textAlignment = .center
    bar.content.addSubview(back)
    bar.content.addSubview(label)
    NSLayoutConstraint.activate([
      back.leadingAnchor.constraint(equalTo: bar.content.leadingAnchor, constant: 12),
      back.centerYAnchor.constraint(equalTo: bar.content.centerYAnchor),
      back.widthAnchor.constraint(equalToConstant: 44),
      back.heightAnchor.constraint(equalToConstant: 44),
      label.centerXAnchor.constraint(equalTo: bar.content.centerXAnchor),
      label.centerYAnchor.constraint(equalTo: bar.content.centerYAnchor),
      label.leadingAnchor.constraint(greaterThanOrEqualTo: back.trailingAnchor, constant: 8),
    ])
    bar.setChromeVisible(false, animated: false)
    return bar
  }
}

final class DarkroomAvatarButton: UIButton {
  private let avatar = AFAvatarView()

  override init(frame: CGRect) {
    super.init(frame: frame)
    accessibilityLabel = String(localized: "Account")
    avatar.translatesAutoresizingMaskIntoConstraints = false
    avatar.isUserInteractionEnabled = false
    avatar.layer.cornerRadius = 17
    avatar.layer.borderWidth = 1
    avatar.layer.borderColor = AFColor.tick.cgColor
    avatar.clipsToBounds = true
    addSubview(avatar)
    NSLayoutConstraint.activate([
      widthAnchor.constraint(equalToConstant: 44),
      heightAnchor.constraint(equalToConstant: 44),
      avatar.centerXAnchor.constraint(equalTo: centerXAnchor),
      avatar.centerYAnchor.constraint(equalTo: centerYAnchor),
      avatar.widthAnchor.constraint(equalToConstant: 34),
      avatar.heightAnchor.constraint(equalToConstant: 34),
    ])
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  func configure(user: AfilmorySessionUser?) {
    avatar.setImage(user?.image, fallbackInitial: user?.name)
  }
}
