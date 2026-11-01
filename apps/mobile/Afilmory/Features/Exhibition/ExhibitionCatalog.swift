#if DEBUG
  import UIKit

  @MainActor
  enum ExhibitionCatalog {
    static let gallerySlug = "birdline"

    static var entries: [CatalogEntry] {
      [
        entry("exhibition.day", "Exhibition · Day") { _ in },
        entry("exhibition.month", "Exhibition · Month") { $0.show(level: .month) },
        entry("exhibition.year", "Exhibition · Year") { $0.show(level: .year) },
        entry("exhibition.infinity", "Exhibition · ∞ map") { exhibition in
          exhibition.show(level: .infinity)
          exhibition.scrollToMap()
        },
        entry("exhibition.map-fullscreen", "Exhibition · Full-screen map", settle: 4.5) { exhibition in
          exhibition.show(level: .infinity)
          exhibition.scrollToMap()
          after(1.2) { exhibition.mapCard.onFullScreen?() }
        },
        entry("exhibition.projection", "Exhibition · Projection", settle: 4) { $0.openProjection() },
        entry("exhibition.search", "Exhibition · Search & filter", settle: 4) { exhibition in
          ExhibitionFilterPresenter.present(from: exhibition, photos: exhibition.feed.snapshot.photos)
        },
        entry("exhibition.filtered", "Exhibition · Filtered by query", settle: 4) { exhibition in
          var filters = PhotoFilters.empty
          filters.query = "bird"
          PhotoFilterStore.shared.replace(filters)
          after(0.4) { exhibition.collectionView.setContentOffset(CGPoint(x: 0, y: exhibition.hero.headerTop - 140), animated: false) }
        },
        entry("exhibition.scrolled", "Exhibition · Scrolled into strips", settle: 4) { exhibition in
          exhibition.collectionView.setContentOffset(CGPoint(x: 0, y: exhibition.hero.headerTop - 100), animated: false)
        },
        CatalogEntry(id: "exhibition.empty", group: "Exhibition", title: "Exhibition · Empty", scenario: .empty, launch: .app { $0.switchToTab(.exhibition, animated: false) }),
        CatalogEntry(id: "exhibition.offline", group: "Exhibition", title: "Exhibition · Offline", scenario: .offline, launch: .app { $0.switchToTab(.exhibition, animated: false) }),
        CatalogEntry(id: "exhibition.gallery", group: "Exhibition", title: "Gallery page · Birdline", settle: 4, launch: .app { navigator in
          navigator.openGallery(GalleryRouteRequest(requestId: "catalog", slug: gallerySlug, title: "Birdline"), level: .day)
        }),
        CatalogEntry(id: "exhibition.gallery-infinity", group: "Exhibition", title: "Gallery page · ∞", settle: 4, launch: .app { navigator in
          navigator.openGallery(GalleryRouteRequest(requestId: "catalog", slug: gallerySlug, title: "Birdline"), level: .infinity)
        }),
        CatalogEntry(id: "exhibition.visitor-gallery", group: "Exhibition", title: "Visitor · Gallery page", scenario: .visitor, settle: 4, launch: .app { navigator in
          navigator.openGallery(GalleryRouteRequest(requestId: "catalog", slug: gallerySlug, title: "Birdline"), level: .day)
        }),
      ]
    }

    static func entry(
      _ id: String,
      _ title: String,
      settle: TimeInterval = 3.5,
      drive: @escaping @MainActor (ExhibitionController) -> Void
    ) -> CatalogEntry {
      CatalogEntry(id: id, group: "Exhibition", title: title, settle: settle, launch: .app { navigator in
        navigator.switchToTab(.exhibition, animated: false)
        whenLoaded(navigator, drive)
      })
    }

    static func ownExhibition(_ navigator: AppNavigator) -> ExhibitionController? {
      (navigator.tabs?.viewControllers?.first as? UINavigationController)?.viewControllers.first as? ExhibitionController
    }

    static func whenLoaded(_ navigator: AppNavigator, attempts: Int = 40, _ drive: @escaping @MainActor (ExhibitionController) -> Void) {
      if let exhibition = ownExhibition(navigator), !exhibition.content.shown.isEmpty || !exhibition.feed.snapshot.photos.isEmpty {
        after(0.3) { drive(exhibition) }
        return
      }
      guard attempts > 0 else { return }
      after(0.1) { whenLoaded(navigator, attempts: attempts - 1, drive) }
    }

    static func after(_ delay: TimeInterval, _ work: @escaping @MainActor () -> Void) {
      DispatchQueue.main.asyncAfter(deadline: .now() + delay) { MainActor.assumeIsolated { work() } }
    }
  }
#endif
