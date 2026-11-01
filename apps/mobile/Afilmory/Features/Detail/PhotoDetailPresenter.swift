import UIKit

@MainActor
enum PhotoDetailPresenter {
  static func present(
    photos: [GalleryPhoto],
    index: Int,
    numbers: [String: Int]? = nil,
    gallerySlug: String?,
    from presenter: UIViewController,
    sourceProvider: @escaping (String) -> UIView?
  ) {
    guard photos.indices.contains(index), presenter.presentedViewController == nil else { return }
    let detail = PhotoDetailViewController(
      photos: photos,
      index: index,
      numbers: numbers,
      gallerySlug: gallerySlug,
      sourceProvider: sourceProvider
    )
    UIImpactFeedbackGenerator(style: .soft).impactOccurred()
    presenter.present(detail, animated: true)
  }
}
