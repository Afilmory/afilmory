import UIKit

final class DarkroomAccountSheetController: DarkroomSheetController {
  private let user: AfilmorySessionUser?
  private let subtitle: String

  var onAccountSettings: (() -> Void)?

  init(user: AfilmorySessionUser?, subtitle: String) {
    self.user = user
    self.subtitle = subtitle
    super.init()
  }

  static func roleName(_ role: String?) -> String? {
    switch role {
    case "owner": String(localized: "Owner")
    case "admin": String(localized: "Administrator")
    case "member": String(localized: "Member")
    default: nil
    }
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    let avatar = AFAvatarView()
    avatar.layer.cornerRadius = 28
    avatar.layer.borderWidth = 1
    avatar.layer.borderColor = AFColor.tick.cgColor
    avatar.clipsToBounds = true
    avatar.setImage(user?.image, fallbackInitial: user?.name)
    let name = AFLabel.exhibitUser(user?.name, size: 22)
    name.font = AFFont.exhibitUser(size: 22, relativeTo: .title2)
    name.numberOfLines = 0
    let meta = AFLabel.mono(subtitle, size: 11)
    meta.numberOfLines = 0
    let texts = UIStackView(arrangedSubviews: [name, meta])
    texts.axis = .vertical
    texts.spacing = 3
    let identity = UIStackView(arrangedSubviews: [avatar, texts])
    identity.spacing = 14
    identity.alignment = .center
    identity.isAccessibilityElement = true
    identity.accessibilityLabel = [user?.name, subtitle].compactMap { $0 }.joined(separator: ", ")

    let settings = DarkroomPillButton(style: .filled, height: 50)
    settings.setTitle(String(localized: "Account settings"))
    settings.configuration?.baseBackgroundColor = AFColor.fill
    settings.configuration?.baseForegroundColor = AFColor.textPrimary
    settings.addAction(UIAction { [weak self] _ in
      let action = self?.onAccountSettings
      self?.dismiss(animated: true) { action?() }
    }, for: .primaryActionTriggered)
    let done = DarkroomPillButton(style: .outline, height: 50)
    done.layer.borderWidth = 0
    done.setTitle(String(localized: "Done"))
    done.configuration?.baseForegroundColor = AFColor.textSecondary
    done.addAction(UIAction { [weak self] _ in self?.dismiss(animated: true) }, for: .primaryActionTriggered)

    let stack = UIStackView(arrangedSubviews: [identity, settings, done])
    stack.axis = .vertical
    stack.spacing = 8
    stack.setCustomSpacing(18, after: identity)
    stack.translatesAutoresizingMaskIntoConstraints = false
    sheetContent.addSubview(stack)
    NSLayoutConstraint.activate([
      avatar.widthAnchor.constraint(equalToConstant: 56),
      avatar.heightAnchor.constraint(equalToConstant: 56),
      stack.topAnchor.constraint(equalTo: sheetContent.topAnchor, constant: 4),
      stack.leadingAnchor.constraint(equalTo: sheetContent.leadingAnchor, constant: 22),
      stack.trailingAnchor.constraint(equalTo: sheetContent.trailingAnchor, constant: -22),
      stack.bottomAnchor.constraint(equalTo: sheetContent.bottomAnchor, constant: -30),
    ])
  }
}
