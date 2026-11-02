import UIKit

final class DarkroomAccountCard: UIControl {
  private let avatar = AFAvatarView()
  private let nameLabel = AFLabel.exhibitUser(size: 20)
  private let detailLabel = AFLabel.ui(nil, size: 12, color: AFColor.textTertiary)

  override init(frame: CGRect) {
    super.init(frame: frame)
    isAccessibilityElement = true
    accessibilityTraits = .button
    avatar.layer.cornerRadius = 26
    avatar.clipsToBounds = true
    avatar.isUserInteractionEnabled = false
    let labels = UIStackView(arrangedSubviews: [nameLabel, detailLabel])
    labels.axis = .vertical
    labels.spacing = 2
    labels.isUserInteractionEnabled = false
    let row = UIStackView(arrangedSubviews: [avatar, labels])
    row.axis = .horizontal
    row.alignment = .center
    row.spacing = 12
    row.isUserInteractionEnabled = false
    row.translatesAutoresizingMaskIntoConstraints = false
    addSubview(row)
    NSLayoutConstraint.activate([
      avatar.widthAnchor.constraint(equalToConstant: 52),
      avatar.heightAnchor.constraint(equalToConstant: 52),
      row.topAnchor.constraint(equalTo: topAnchor, constant: 4),
      row.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -4),
      row.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 6),
      row.trailingAnchor.constraint(lessThanOrEqualTo: trailingAnchor, constant: -6),
    ])
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  func configure(session: AfilmorySession?) {
    let name = session?.activeWorkspace?.name ?? session?.user.name ?? String(localized: "Account")
    avatar.setImage(session?.user.image, fallbackInitial: session?.user.name)
    nameLabel.text = name
    detailLabel.text = session?.user.name
    accessibilityLabel = String(localized: "Account")
    accessibilityValue = name
  }
}
