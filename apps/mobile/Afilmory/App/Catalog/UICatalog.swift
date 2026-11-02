#if DEBUG
  import UIKit

  struct CatalogEntry {
    enum Launch {
      case screen(@MainActor () -> UIViewController)
      case app(@MainActor (AppNavigator) -> Void)
    }

    let id: String
    let group: String
    let title: String
    let scenario: FixtureScenario
    let settle: TimeInterval
    let launch: Launch

    init(
      id: String,
      group: String,
      title: String,
      scenario: FixtureScenario = .owner,
      settle: TimeInterval = 3,
      launch: Launch
    ) {
      self.id = id
      self.group = group
      self.title = title
      self.scenario = scenario
      self.settle = settle
      self.launch = launch
    }
  }

  @MainActor
  enum UICatalog {
    static var entries: [CatalogEntry] {
      ShellCatalog.entries
        + ExhibitionCatalog.entries
        + DetailCatalog.entries
        + ViewingCatalog.entries
        + DarkroomCatalog.entries
        + OnboardingCatalog.entries
    }

    static func entry(_ id: String) -> CatalogEntry? {
      entries.first { $0.id == id }
    }

    static func listing() -> String {
      entries.map { "\($0.id)\t\($0.scenario.rawValue)\t\($0.settle)\t\($0.title)" }.joined(separator: "\n")
    }

    static func open(_ entry: CatalogEntry, over root: UIViewController) {
      switch entry.launch {
      case .screen(let make):
        let controller = make()
        controller.modalPresentationStyle = .fullScreen
        controller.view.accessibilityIdentifier = "catalog.\(entry.id)"
        topmost(from: root).present(controller, animated: false)
      case .app(let drive):
        drive(AppNavigator.shared)
      }
    }

    private static func topmost(from root: UIViewController) -> UIViewController {
      var current = root
      while let presented = current.presentedViewController {
        current = presented
      }
      return current
    }
  }

  @MainActor
  enum ShellCatalog {
    static var entries: [CatalogEntry] {
      [
        CatalogEntry(id: "shell.exhibition", group: "Shell", title: "Tabs · Exhibition", launch: .app { $0.switchToTab(.exhibition, animated: false) }),
        CatalogEntry(id: "shell.viewing", group: "Shell", title: "Tabs · Viewing", launch: .app { $0.switchToTab(.viewing, animated: false) }),
        CatalogEntry(id: "shell.darkroom", group: "Shell", title: "Tabs · Darkroom", launch: .app { $0.switchToTab(.darkroom, animated: false) }),
        CatalogEntry(id: "shell.visitor", group: "Shell", title: "Visitor · Galleries", scenario: .visitor, launch: .app { _ in }),
        CatalogEntry(id: "shell.offline", group: "Shell", title: "Offline · Exhibition", scenario: .offline, launch: .app { $0.switchToTab(.exhibition, animated: false) }),
        CatalogEntry(id: "shell.catalog", group: "Shell", title: "UI Catalog list", launch: .screen { UINavigationController(rootViewController: UICatalogController()) }),
      ]
    }
  }
#endif
