import UIKit

enum AccountSheetRow: Equatable {
  case manageSubscription
  case replayIntro
  case signOut
  case deleteAccount

  static let primary: [AccountSheetRow] = [.manageSubscription, .replayIntro, .signOut]
  static let destructive: AccountSheetRow = .deleteAccount

  var title: String {
    switch self {
    case .manageSubscription: String(localized: "Manage subscription")
    case .replayIntro: String(localized: "Replay introduction")
    case .signOut: String(localized: "Sign out")
    case .deleteAccount: String(localized: "Delete account")
    }
  }

  var symbol: String {
    switch self {
    case .manageSubscription: "creditcard"
    case .replayIntro: "play.rectangle"
    case .signOut: "rectangle.portrait.and.arrow.right"
    case .deleteAccount: "trash"
    }
  }
}

enum AccountRoute: Equatable {
  case sheet
  case deletion

  init(startsDeletion: Bool) {
    self = startsDeletion ? .deletion : .sheet
  }
}

final class DarkroomAccountSheetController: AFSheetController {
  private let user: AfilmorySessionUser?
  private let subtitle: String

  var onRow: ((AccountSheetRow) -> Void)?

  init(user: AfilmorySessionUser?, subtitle: String) {
    self.user = user
    self.subtitle = subtitle
    super.init(title: String(localized: "Account"), detent: .fit)
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

    let rows = AccountSheetRow.primary.map { row in
      let button = DarkroomRowButton(symbol: row.symbol, title: row.title)
      button.addAction(UIAction { [weak self] _ in self?.choose(row) }, for: .primaryActionTriggered)
      return button
    }
    let group = DarkroomGroupView(rows: rows)

    let delete = AFTextButton.make(AccountSheetRow.destructive.title, color: AFColor.destructive) { [weak self] in
      self?.choose(.deleteAccount)
    }

    let stack = UIStackView(arrangedSubviews: [identity, group, delete])
    stack.axis = .vertical
    stack.spacing = 8
    stack.setCustomSpacing(20, after: identity)
    stack.setCustomSpacing(18, after: group)
    stack.translatesAutoresizingMaskIntoConstraints = false
    sheetContent.addSubview(stack)
    NSLayoutConstraint.activate([
      avatar.widthAnchor.constraint(equalToConstant: 56),
      avatar.heightAnchor.constraint(equalToConstant: 56),
      stack.topAnchor.constraint(equalTo: sheetContent.topAnchor, constant: 4),
      stack.leadingAnchor.constraint(equalTo: sheetContent.leadingAnchor, constant: 22),
      stack.trailingAnchor.constraint(equalTo: sheetContent.trailingAnchor, constant: -22),
      stack.bottomAnchor.constraint(equalTo: sheetContent.bottomAnchor, constant: -22),
    ])
  }

  private func choose(_ row: AccountSheetRow) {
    let handler = onRow
    dismiss(animated: true) { handler?(row) }
  }
}
