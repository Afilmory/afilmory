#if DEBUG
  import UIKit

  @MainActor
  enum ViewingCatalog {
    static var entries: [CatalogEntry] {
      [
        CatalogEntry(id: "viewing.rolls", group: "Viewing", title: "New Rolls", launch: .app { drive($0) { $0.select(.rolls, animated: false) } }),
        CatalogEntry(id: "viewing.rolls-empty", group: "Viewing", title: "New Rolls · no follows", scenario: .newcomer, launch: .app { drive($0) { $0.select(.rolls, animated: false) } }),
        CatalogEntry(id: "viewing.galleries", group: "Viewing", title: "Galleries", launch: .app { drive($0) { $0.select(.galleries, animated: false) } }),
        CatalogEntry(id: "viewing.galleries-newcomer", group: "Viewing", title: "Galleries · newcomer default", scenario: .newcomer, launch: .app { drive($0) { _ in } }),
        CatalogEntry(id: "viewing.galleries-search", group: "Viewing", title: "Galleries · search", launch: .app { drive($0) { $0.catalogSearch("bird") } }),
        CatalogEntry(id: "viewing.galleries-search-empty", group: "Viewing", title: "Galleries · search no match", launch: .app { drive($0) { $0.catalogSearch("zzzz") } }),
        CatalogEntry(id: "viewing.visitor", group: "Viewing", title: "Visitor · Galleries only", scenario: .visitor, launch: .app { drive($0) { _ in } }),
        CatalogEntry(id: "viewing.offline", group: "Viewing", title: "Offline · New Rolls", scenario: .offline, launch: .app { drive($0) { $0.select(.rolls, animated: false) } }),
        CatalogEntry(id: "viewing.offline-galleries", group: "Viewing", title: "Offline · Galleries", scenario: .offline, launch: .app { drive($0) { $0.select(.galleries, animated: false) } }),
        CatalogEntry(id: "viewing.gallery-open", group: "Viewing", title: "Gallery page pushed", settle: 4, launch: .app { navigator in
          drive(navigator) { _ in
            navigator.openGallery(GalleryRouteRequest(requestId: "catalog", slug: catalogGallerySlug, title: catalogGallerySlug), level: .day)
          }
        }),
      ]
    }

    static let catalogGallerySlug = "birdline"

    private static func drive(_ navigator: AppNavigator, _ action: @escaping (ViewingController) -> Void) {
      navigator.switchToTab(.viewing, animated: false)
      DispatchQueue.main.async {
        guard let viewing = viewingController(navigator) else { return }
        action(viewing)
      }
    }

    private static func viewingController(_ navigator: AppNavigator) -> ViewingController? {
      if let navigation = navigator.tabs?.viewControllers?[safeIndex: AppTab.viewing.rawValue] as? UINavigationController {
        return navigation.viewControllers.first as? ViewingController
      }
      let root = UIApplication.shared.connectedScenes
        .compactMap { ($0 as? UIWindowScene)?.keyWindow?.rootViewController }
        .first
      return (root as? UINavigationController)?.viewControllers.first as? ViewingController
    }
  }

  private extension Array {
    subscript(safeIndex index: Int) -> Element? {
      indices.contains(index) ? self[index] : nil
    }
  }
#endif
