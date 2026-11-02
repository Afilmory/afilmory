#if DEBUG
  import UIKit

  @MainActor
  enum DetailCatalog {
    static var entries: [CatalogEntry] {
      [
        entry("detail.collapsed", "Detail · Collapsed sheet") { _ in },
        entry("detail.expanded", "Detail · Expanded sheet") { $0.setDetent(.expanded, animated: false) },
        entry("detail.zoomed", "Detail · Zoomed (immersive)") { detail in
          detail.currentCell?.scrollView.setZoomScale(2.4, animated: false)
          detail.zoomChanged(true)
        },
        entry("detail.comments", "Detail · Comments", settle: 5) { $0.presentComments() },
        entry("detail.reactions", "Detail · Reaction rail") { $0.showRail() },
        entry("detail.live", "Detail · Live Photo", photoIndex: 16) { _ in },
        entry("detail.located", "Detail · Located photo expanded", photoIndex: 4) { $0.setDetent(.expanded, animated: false) },
        CatalogEntry(id: "detail.titled", group: "Detail", title: "Detail · Real title headline", settle: 4.5, launch: .app { navigator in
          navigator.switchToTab(.exhibition, animated: false)
          ExhibitionCatalog.whenLoaded(navigator) { exhibition in
            let photos = exhibition.content.shown
            guard let first = photos.first else { return }
            let titled = retitled(first, title: "Robin at first light", description: "A robin waits on a bare branch before sunrise.")
            PhotoDetailPresenter.present(
              photos: [titled] + photos.dropFirst(),
              index: 0,
              gallerySlug: exhibition.feed.slug,
              from: exhibition,
              sourceProvider: { _ in nil }
            )
          }
        }),
        CatalogEntry(id: "detail.gallery", group: "Detail", title: "Detail · Someone else's photo", settle: 6, launch: .app { navigator in
          navigator.openGallery(GalleryRouteRequest(requestId: "catalog", slug: ExhibitionCatalog.gallerySlug, title: "Birdline"), level: .day)
          ExhibitionCatalog.after(2.5) {
            guard let top = (navigator.tabs?.viewControllers?[1] as? UINavigationController)?.topViewController as? ExhibitionController,
                  let first = top.content.shown.first
            else { return }
            top.openDetail(photoID: first.id)
          }
        }),
      ]
    }

    static func entry(
      _ id: String,
      _ title: String,
      photoIndex: Int = 0,
      settle: TimeInterval = 4.5,
      drive: @escaping @MainActor (PhotoDetailViewController) -> Void
    ) -> CatalogEntry {
      CatalogEntry(id: id, group: "Detail", title: title, settle: settle, launch: .app { navigator in
        navigator.switchToTab(.exhibition, animated: false)
        ExhibitionCatalog.whenLoaded(navigator) { exhibition in
          let photos = exhibition.content.shown
          guard photos.indices.contains(photoIndex) else { return }
          exhibition.openDetail(photoID: photos[photoIndex].id)
          ExhibitionCatalog.after(1.0) {
            let presented = exhibition.presentedViewController ?? exhibition.view.window?.rootViewController?.presentedViewController
            guard let presented, let detail = DetailTransitionAnimator.detail(in: presented) else { return }
            drive(detail)
          }
        }
      })
    }

    static func retitled(_ photo: GalleryPhoto, title: String, description: String) -> GalleryPhoto {
      GalleryPhoto(
        id: photo.id, title: title, description: description, originalUrl: photo.originalUrl,
        thumbnailUrl: photo.thumbnailUrl, thumbHash: photo.thumbHash, aspectRatio: photo.aspectRatio,
        width: photo.width, height: photo.height, format: photo.format, size: photo.size,
        dateTaken: photo.dateTaken, video: photo.video, tags: photo.tags, exif: photo.exif,
        toneAnalysis: photo.toneAnalysis, location: photo.location, camera: photo.camera,
        lens: photo.lens, rating: photo.rating, city: photo.city
      )
    }
  }
#endif
