import UIKit

final class ViewingCardHeader: UIControl {
  static let minimumHeight: CGFloat = 52
  static let avatarSize: CGFloat = 36

  let avatar = AFAvatarView()
  private let nameLabel = AFLabel.exhibitUser(size: 17, color: AFColor.textPrimary)
  private let metaLabel = AFLabel.mono(size: 10)
  private let chevron = UIImageView()
  private var accentPhotoID: String?
  private let nameSize: CGFloat

  init(nameSize: CGFloat, showsChevron: Bool) {
    self.nameSize = nameSize
    super.init(frame: .zero)
    nameLabel.font = Self.nameFont(size: nameSize)
    metaLabel.font = Self.metaFont
    for label in [nameLabel, metaLabel] {
      label.translatesAutoresizingMaskIntoConstraints = true
      label.lineBreakMode = .byTruncatingTail
    }
    chevron.image = UIImage(systemName: "chevron.right", withConfiguration: UIImage.SymbolConfiguration(pointSize: 14, weight: .regular))
    chevron.tintColor = AFColor.textTertiary
    chevron.contentMode = .center
    chevron.isHidden = !showsChevron
    for view in [avatar, nameLabel, metaLabel, chevron] as [UIView] {
      view.isUserInteractionEnabled = false
      addSubview(view)
    }
    isAccessibilityElement = true
    accessibilityTraits = .button
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  static func nameFont(size: CGFloat) -> UIFont {
    UIFontMetrics(forTextStyle: .body).scaledFont(for: AFFont.exhibitUser(size: size), maximumPointSize: size * 1.5)
  }

  static var metaFont: UIFont {
    UIFontMetrics(forTextStyle: .caption2).scaledFont(for: AFFont.mono(size: 10), maximumPointSize: 13)
  }

  static func height(nameSize: CGFloat) -> CGFloat {
    let text = nameFont(size: nameSize).lineHeight + 2 + metaFont.lineHeight
    return max(minimumHeight, ceil(text + 12))
  }

  override var isHighlighted: Bool {
    didSet { alpha = isHighlighted ? 0.6 : 1 }
  }

  func configure(name: String, meta: String, avatarURL: String?, accentPhoto: GalleryCoverPhoto?) {
    nameLabel.text = name
    metaLabel.text = meta
    accessibilityLabel = String(localized: "Open \(name)’s gallery")
    accessibilityValue = meta
    avatar.setImage(avatarURL, fallbackInitial: name)
    accentPhotoID = accentPhoto?.id
    guard let accentPhoto else {
      avatar.ringColor = AFColor.accentFallback
      return
    }
    avatar.ringColor = AccentStore.shared.cachedAccent(photoId: accentPhoto.id) ?? AFColor.tick
    AccentStore.shared.accent(photoId: accentPhoto.id, thumbnailURL: URL(string: accentPhoto.thumbnailUrl)) { [weak self] color in
      guard let self, self.accentPhotoID == accentPhoto.id else { return }
      self.avatar.ringColor = color
      self.avatar.setNeedsLayout()
    }
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    let size = Self.avatarSize
    avatar.frame = CGRect(x: 0, y: (bounds.height - size) / 2, width: size, height: size)
    let chevronWidth: CGFloat = chevron.isHidden ? 0 : 22
    chevron.frame = CGRect(x: bounds.width - chevronWidth, y: 0, width: chevronWidth, height: bounds.height)
    let textX = size + 10
    let textWidth = max(0, bounds.width - textX - chevronWidth - (chevron.isHidden ? 0 : 6))
    let nameHeight = ceil(nameLabel.font.lineHeight)
    let metaHeight = ceil(metaLabel.font.lineHeight)
    let top = (bounds.height - nameHeight - 2 - metaHeight) / 2
    nameLabel.frame = CGRect(x: textX, y: top, width: textWidth, height: nameHeight)
    metaLabel.frame = CGRect(x: textX, y: top + nameHeight + 2, width: textWidth, height: metaHeight)
  }
}
