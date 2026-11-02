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
    presenter.present(container(for: detail, context: presenter.traitCollection.duoContext), animated: true)
  }

  static func container(for detail: PhotoDetailViewController, context: DuoContext) -> UIViewController {
    guard context.hasVerticalBar else { return detail }
    let navigation = AFNavigationController(rootViewController: detail)
    navigation.loadViewIfNeeded()
    navigation.view.backgroundColor = .clear
    navigation.modalPresentationStyle = .custom
    navigation.transitioningDelegate = detail.transitionDelegateRef
    navigation.modalPresentationCapturesStatusBarAppearance = true
    return navigation
  }
}
