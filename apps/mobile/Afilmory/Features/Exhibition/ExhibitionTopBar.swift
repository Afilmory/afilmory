import UIKit

final class ExhibitionTopBar: UIView {
  static let contentHeight: CGFloat = 44

  var onBack: (() -> Void)?
  var onSearch: (() -> Void)?
  var onProject: (() -> Void)?
  var onFollow: (() -> Void)?

  private let ground = UIVisualEffectView(effect: nil)
  private let tint = UIView()
  private let hairline = UIView()
  private let brand = AFLabel.mono("AFILMORY", size: 11)
  private let titleLabel = AFLabel.exhibitUser(size: 17)
  private let trailing = UIStackView()
  private(set) lazy var projectButton = AFGlassButton.titled(String(localized: "Project"), symbol: "play.fill") { [weak self] in
    self?.onProject?()
  }
  private(set) lazy var searchButton = AFGlassButton.symbol(
    "magnifyingglass", accessibilityLabel: String(localized: "Search and filters"), pointSize: 14
  ) { [weak self] in self?.onSearch?() }
  private lazy var backButton = AFGlassButton.symbol("chevron.left", accessibilityLabel: String(localized: "Back")) { [weak self] in
    self?.onBack?()
  }
  private lazy var followButton = AFGlassButton.titled(String(localized: "Follow")) { [weak self] in
    self?.onFollow?()
  }
  private var isGrounded = false
  private var isTitleShown = false
  private lazy var titleCenter = titleLabel.centerXAnchor.constraint(equalTo: centerXAnchor)

  init(showsBack: Bool) {
    super.init(frame: .zero)
    ground.alpha = 0
    tint.backgroundColor = AFColor.ground.withAlphaComponent(0.8)
    tint.alpha = 0
    hairline.backgroundColor = AFColor.hairline
    hairline.alpha = 0
    [ground, tint, hairline].forEach(addSubview)
    let brand = showsBack ? backButton : self.brand
    brand.translatesAutoresizingMaskIntoConstraints = false
    self.brand.isAccessibilityElement = false
    titleLabel.alpha = 0
    titleLabel.textAlignment = .center
    titleLabel.accessibilityTraits = .header
    trailing.axis = .horizontal
    trailing.spacing = 8
    trailing.alignment = .center
    trailing.translatesAutoresizingMaskIntoConstraints = false
    if showsBack {
      trailing.addArrangedSubview(followButton)
      followButton.isHidden = true
    } else {
      trailing.addArrangedSubview(searchButton)
    }
    trailing.addArrangedSubview(projectButton)
    projectButton.accessibilityLabel = String(localized: "Project")
    [brand, titleLabel, trailing].forEach(addSubview)
    NSLayoutConstraint.activate([
      brand.leadingAnchor.constraint(equalTo: leadingAnchor, constant: showsBack ? 12 : 20),
      brand.centerYAnchor.constraint(equalTo: bottomAnchor, constant: -Self.contentHeight / 2),
      trailing.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -12),
      trailing.centerYAnchor.constraint(equalTo: brand.centerYAnchor),
      titleLabel.centerYAnchor.constraint(equalTo: brand.centerYAnchor),
      titleLabel.leadingAnchor.constraint(greaterThanOrEqualTo: brand.trailingAnchor, constant: 8),
      titleLabel.trailingAnchor.constraint(lessThanOrEqualTo: trailing.leadingAnchor, constant: -8),
    ])
    titleLabel.setContentCompressionResistancePriority(UILayoutPriority(760), for: .horizontal)
    trailing.setContentCompressionResistancePriority(.required, for: .horizontal)
    [projectButton, searchButton, followButton].forEach {
      $0.setContentCompressionResistancePriority(.required, for: .horizontal)
      $0.titleLabel?.numberOfLines = 1
    }
    titleCenter.priority = .defaultHigh
    titleCenter.isActive = true
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    ground.frame = bounds
    tint.frame = bounds
    hairline.frame = CGRect(x: 0, y: bounds.height - 1, width: bounds.width, height: 1)
  }

  override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
    let hit = super.hitTest(point, with: event)
    if hit === self || hit === trailing {
      return isGrounded ? self : nil
    }
    return hit
  }

  func setTitle(_ title: String?) {
    titleLabel.text = title
    accessibilityLabel = title
  }

  func setFollow(_ state: GallerySubscriptionButtonState) {
    switch state {
    case .hidden:
      followButton.isHidden = true
    case .subscribe, .subscribed, .updating:
      followButton.isHidden = false
      let subscribed: Bool
      if case .updating(let target) = state { subscribed = target } else { subscribed = state == .subscribed }
      followButton.configuration?.title = subscribed ? String(localized: "Following") : String(localized: "Follow")
      followButton.configuration?.showsActivityIndicator = { if case .updating = state { return true } else { return false } }()
      followButton.isEnabled = { if case .updating = state { return false } else { return true } }()
    }
  }

  func setFilterActive(_ active: Bool, count: Int) {
    searchButton.configuration?.image = UIImage(
      systemName: active ? "line.3.horizontal.decrease.circle.fill" : "magnifyingglass",
      withConfiguration: UIImage.SymbolConfiguration(pointSize: 14, weight: .semibold)
    )
    searchButton.accessibilityLabel = active
      ? String(localized: "Search and filters, \(count) active")
      : String(localized: "Search and filters")
  }

  func update(scrollOffset: CGFloat, titleThreshold: CGFloat) {
    let grounded = scrollOffset > 24
    if grounded != isGrounded {
      isGrounded = grounded
      let reduceTransparency = UIAccessibility.isReduceTransparencyEnabled
      UIView.animate(withDuration: 0.3, delay: 0, options: [.allowUserInteraction, .beginFromCurrentState]) {
        self.ground.effect = grounded && !reduceTransparency ? UIBlurEffect(style: .systemUltraThinMaterialDark) : nil
        self.ground.alpha = grounded ? 1 : 0
        self.tint.alpha = grounded ? (reduceTransparency ? 1 : 0.8) : 0
        self.hairline.alpha = grounded ? 1 : 0
      }
    }
    let showsTitle = scrollOffset > titleThreshold
    guard showsTitle != isTitleShown else { return }
    isTitleShown = showsTitle
    if showsTitle {
      titleLabel.alpha = 0
      AFMotion.rackIn(titleLabel)
    } else {
      UIView.animate(withDuration: 0.25, delay: 0, options: [.allowUserInteraction, .beginFromCurrentState]) {
        self.titleLabel.alpha = 0
      }
    }
  }
}
