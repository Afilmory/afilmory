import UIKit

@MainActor
final class DarkroomRows {
  let library = DarkroomRowButton(symbol: "square.grid.2x2", title: String(localized: "Library"))
  let replies = DarkroomRowButton(symbol: "bubble.left", title: String(localized: "Replies"))
  let data = DarkroomRowButton(symbol: "chart.bar", title: String(localized: "Data"))
  let sync = DarkroomRowButton(symbol: "arrow.triangle.2.circlepath", title: String(localized: "Sync"))
  let site = DarkroomRowButton(symbol: "globe", title: String(localized: "Site"))
  let domain = DarkroomRowButton(symbol: "link", title: String(localized: "Domain"))
  let workspace = DarkroomRowButton(symbol: "person", title: String(localized: "Workspace"))
  let plan = DarkroomRowButton(symbol: "creditcard", title: String(localized: "Plan"))
  let sponsor = DarkroomRowButton(symbol: "heart", title: String(localized: "Sponsor Afilmory"), style: .value)
  let accountSettings = DarkroomRowButton(symbol: "gearshape", title: String(localized: "Account settings"))
  let cache = DarkroomRowButton(symbol: "trash", title: String(localized: "Clear cache"), style: .value)
  let signOut = DarkroomRowButton(symbol: "rectangle.portrait.and.arrow.right", title: String(localized: "Sign out"), style: .destructive)
  weak var manageLabel: UIView?

  lazy var manageGroup = DarkroomGroupView(rows: [library, replies, data, sync, site, domain])
  lazy var accountGroup = DarkroomGroupView(rows: [workspace, plan, sponsor, accountSettings, cache, signOut])

  init() {
    workspace.showsMenuAsPrimaryAction = true
    sponsor.isHidden = !AfilmoryBuildConfiguration.supportsStoreKitSponsorship
  }
}
