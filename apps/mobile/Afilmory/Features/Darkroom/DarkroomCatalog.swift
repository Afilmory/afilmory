#if DEBUG
  import UIKit

  @MainActor
  enum DarkroomCatalog {
    static var entries: [CatalogEntry] {
      [
        entry("darkroom.idle", "Idle stage") { _ in },
        entry("darkroom.review", "Review sheet · fixture picks") { $0.uploadFlow.review(DarkroomFixturePicks.picks()) },
        entry("darkroom.developing", "Developing · mid progress", settle: 4.5) { $0.uploadFlow.debugDevelopFixtures() },
        entry("darkroom.done", "Developed · done", settle: 13) { $0.uploadFlow.debugDevelopFixtures() },
        entry("darkroom.failed", "Upload failed · retry", settle: 7) { controller in
          UserDefaults.standard.set(true, forKey: "fixture.uploadFails")
          controller.uploadFlow.debugDevelopFixtures()
        },
        entry("darkroom.offline", "Offline · API unreachable", scenario: .offline, settle: 4) { _ in },
        entry("darkroom.quota", "Quota warning") { controller in
          controller.debugQuotaWarnings = [
            BillingOverview.QuotaDimension(limit: 1000, nearingLimit: true, reason: "library_items", unit: "items", used: 960),
          ]
          controller.render()
        },
        entry("darkroom.empty", "Empty library", scenario: .empty) { _ in },
        entry("darkroom.account-rows", "Account group") { controller in controller.debugScrollToBottom() },
        entry("darkroom.account", "Account sheet") { $0.presentAccountSheet() },
        route("darkroom.library", "Library", .library),
        entry("darkroom.library-select", "Library · select mode") { controller in
          controller.navigationController?.pushViewController(controller.makeSubpage(.library, librarySelecting: true), animated: false)
        },
        route("darkroom.replies", "Replies", .comments),
        route("darkroom.replies-empty", "Replies · empty", .comments, scenario: .empty),
        route("darkroom.data", "Data", .analytics),
        route("darkroom.sync", "Sync", .operations),
        route("darkroom.site", "Site", .site),
        route("darkroom.domain", "Domain", .domain),
      ]
    }

    private static func entry(
      _ id: String,
      _ title: String,
      scenario: FixtureScenario = .owner,
      settle: TimeInterval = 3,
      _ body: @escaping @MainActor (DarkroomController) -> Void
    ) -> CatalogEntry {
      CatalogEntry(id: id, group: "Darkroom", title: title, scenario: scenario, settle: settle, launch: .app { navigator in
        UserDefaults.standard.removeObject(forKey: "fixture.uploadFails")
        UploadCenter.shared.cancelAll()
        UploadCenter.shared.clearFinished()
        navigator.switchToTab(.darkroom, animated: false)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
          guard let navigation = navigator.tabs?.viewControllers?[AppTab.darkroom.rawValue] as? UINavigationController,
                let controller = navigation.viewControllers.first as? DarkroomController
          else { return }
          body(controller)
        }
      })
    }

    private static func route(_ id: String, _ title: String, _ route: StudioHomeRoute, scenario: FixtureScenario = .owner) -> CatalogEntry {
      CatalogEntry(id: id, group: "Darkroom", title: title, scenario: scenario, launch: .app { navigator in
        navigator.openDarkroom(route: route)
      })
    }
  }

  extension DarkroomController {
    func debugScrollToBottom() {
      guard let scroll = view.subviews.compactMap({ $0 as? UIScrollView }).first else { return }
      scroll.layoutIfNeeded()
      let bottom = scroll.contentSize.height - scroll.bounds.height + scroll.adjustedContentInset.bottom
      scroll.setContentOffset(CGPoint(x: 0, y: max(-scroll.adjustedContentInset.top, bottom)), animated: false)
    }
  }
#endif
