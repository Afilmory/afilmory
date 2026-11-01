import UIKit

final class DetailChipsBar: UIView {
  static let height: CGFloat = 44

  var onReaction: (() -> Void)?
  var onShare: (() -> Void)?

  private let pill = UIVisualEffectView(effect: AdaptiveGlass.effect())
  private let dot = UIView()
  private let pillLabel = AFLabel.exhibit(size: 16)
  private(set) lazy var reactionButton = AFGlassButton.symbol("heart", accessibilityLabel: String(localized: "React"), pointSize: 17) { [weak self] in
    self?.onReaction?()
  }
  private(set) lazy var shareButton = AFGlassButton.symbol("square.and.arrow.up", accessibilityLabel: String(localized: "Share"), pointSize: 17) { [weak self] in
    self?.onShare?()
  }

  override init(frame: CGRect) {
    super.init(frame: frame)
    pill.layer.cornerRadius = Self.height / 2
    pill.layer.cornerCurve = .continuous
    pill.clipsToBounds = true
    if #unavailable(iOS 26.0) {
      pill.backgroundColor = UIColor(afHex: 0x262421, alpha: 0.72)
      pill.layer.borderWidth = 1
      pill.layer.borderColor = AFColor.textPrimary.withAlphaComponent(0.1).cgColor
    }
    dot.layer.cornerRadius = 3
    dot.backgroundColor = AFColor.accentFallback
    pillLabel.translatesAutoresizingMaskIntoConstraints = true
    pill.contentView.addSubview(dot)
    pill.contentView.addSubview(pillLabel)
    pill.isAccessibilityElement = true
    pill.accessibilityTraits = .staticText
    [pill, reactionButton, shareButton].forEach(addSubview)
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
    let hit = super.hitTest(point, with: event)
    return hit === self ? nil : hit
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    let labelSize = pillLabel.sizeThatFits(CGSize(width: 200, height: Self.height))
    pill.frame = CGRect(x: 0, y: 0, width: 18 + 6 + 8 + labelSize.width + 18, height: Self.height)
    dot.frame = CGRect(x: 18, y: (Self.height - 6) / 2, width: 6, height: 6)
    pillLabel.frame = CGRect(x: 32, y: 0, width: labelSize.width, height: Self.height)
    shareButton.frame = CGRect(x: bounds.width - Self.height, y: 0, width: Self.height, height: Self.height)
    reactionButton.frame = shareButton.frame.offsetBy(dx: -(Self.height + 8), dy: 0)
  }

  func configure(number: String, accent: UIColor, animated: Bool) {
    pillLabel.text = "No. \(number)"
    pill.accessibilityLabel = String(localized: "No. \(number)")
    setAccent(accent)
    setNeedsLayout()
    if animated { AFMotion.afLock(label: pillLabel, dot: dot, haptic: false) }
  }

  func setAccent(_ color: UIColor) {
    UIView.animate(withDuration: 0.4) { self.dot.backgroundColor = color }
  }

  func setReacted(_ reacted: Bool) {
    reactionButton.configuration?.image = UIImage(
      systemName: reacted ? "heart.fill" : "heart",
      withConfiguration: UIImage.SymbolConfiguration(pointSize: 17, weight: .semibold)
    )
  }
}
