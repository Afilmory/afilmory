import UIKit

final class ViewingFollowButton: UIControl {
  private let pill = UIView()
  private let label = UILabel()
  private static let pillHeight: CGFloat = 32

  override init(frame: CGRect) {
    super.init(frame: frame)
    pill.isUserInteractionEnabled = false
    pill.layer.cornerRadius = Self.pillHeight / 2
    pill.layer.cornerCurve = .continuous
    pill.layer.borderWidth = 1
    label.font = UIFontMetrics(forTextStyle: .footnote).scaledFont(for: AFFont.ui(size: 13, weight: .medium), maximumPointSize: 17)
    label.adjustsFontForContentSizeCategory = true
    label.textAlignment = .center
    addSubview(pill)
    pill.addSubview(label)
    isAccessibilityElement = true
    accessibilityTraits = .button
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  func apply(isFollowing: Bool, isUpdating: Bool, galleryName: String) {
    let title = isFollowing ? String(localized: "Following") : String(localized: "Follow")
    let changes = {
      self.label.text = title
      self.pill.backgroundColor = isFollowing ? .clear : AFColor.textPrimary
      self.pill.layer.borderColor = (isFollowing ? AFColor.tick : AFColor.textPrimary).cgColor
      self.label.textColor = isFollowing ? AFColor.textSecondary : AFColor.onLight
    }
    if window != nil, label.text != nil, label.text != title {
      UIView.transition(with: pill, duration: AFMotion.reduceMotion ? 0.15 : 0.3, options: [.transitionCrossDissolve, .allowUserInteraction], animations: changes)
    } else {
      changes()
    }
    label.alpha = isUpdating ? 0.45 : 1
    isEnabled = !isUpdating
    accessibilityLabel = isFollowing
      ? String(localized: "Unfollow \(galleryName)")
      : String(localized: "Follow \(galleryName)")
    accessibilityTraits = isFollowing ? [.button, .selected] : .button
    invalidateIntrinsicContentSize()
    setNeedsLayout()
  }

  override func sizeThatFits(_: CGSize) -> CGSize {
    let text = label.sizeThatFits(CGSize(width: 200, height: Self.pillHeight))
    return CGSize(width: ceil(text.width) + 28, height: max(44, ceil(text.height) + 16))
  }

  override var intrinsicContentSize: CGSize {
    sizeThatFits(.zero)
  }

  override var isHighlighted: Bool {
    didSet { pill.alpha = isHighlighted ? 0.7 : 1 }
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    let height = min(bounds.height, max(Self.pillHeight, ceil(label.font.lineHeight) + 14))
    pill.frame = CGRect(x: 0, y: (bounds.height - height) / 2, width: bounds.width, height: height)
    pill.layer.cornerRadius = height / 2
    label.frame = pill.bounds
  }
}
