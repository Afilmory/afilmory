import SwiftUI
import UIKit

final class GalleryDetailController: UIViewController {
  private let onRequestSignIn: () -> Void
  private let slug: String
  private let masonryView: PhotoMasonryView
  private var feed: PhotoFeed!
  private var observation: PhotoFeedObservationToken?

  init(
    slug: String,
    title: String,
    onRequestSignIn: @escaping () -> Void
  ) {
    self.slug = slug
    self.onRequestSignIn = onRequestSignIn
    masonryView = PhotoMasonryView(frame: .zero)
    super.init(nibName: nil, bundle: nil)
    self.title = title
    configureMasonry()
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) is not supported")
  }

  override func loadView() {
    view = masonryView
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .systemBackground
    feed = PhotoFeedStore.shared.feed(for: .manifest(slug))
    observation = feed.observe { [weak self] in
      self?.render()
    }
    PhotoFeedStore.shared.load(.manifest(slug))
    render()
  }

  private func configureMasonry() {
    masonryView.chromeVisible = false
    masonryView.contextMenuInfoTitle = String(localized: "Photo information")
    masonryView.contextMenuShareTitle = String(localized: "Share photo")
    masonryView.defaultColumnCount = 2
    masonryView.extraBottomInset = 96
    masonryView.gap = 4
    masonryView.livePhotoAccessibilityLabel = String(localized: "Live Photo")
    masonryView.onNativePhotoPress = { [weak self] index in
      self?.presentPhoto(at: index)
    }
    masonryView.onNativeRefresh = { [weak self] in
      guard let self else { return }
      PhotoFeedStore.shared.load(.manifest(slug), force: true)
    }
    masonryView.onNativeContextMenuAction = { [weak self] action, photoId in
      self?.performContextAction(action, photoId: photoId)
    }
  }

  private func render() {
    masonryView.setRefreshing(feed.loadState == .loading && !feed.photos.isEmpty)
    if feed.loadState == .loading, feed.photos.isEmpty {
      contentUnavailableConfiguration = UIContentUnavailableConfiguration.loading()
      return
    }
    if feed.loadState == .failed, feed.photos.isEmpty {
      masonryView.setPhotos([])
      var configuration = UIContentUnavailableConfiguration.empty()
      configuration.image = UIImage(systemName: "exclamationmark.triangle")
      configuration.text = String(localized: "Failed to load photos")
      configuration.secondaryText = String(localized: "Check your connection and try again.")
      configuration.button = .filled()
      configuration.button.title = String(localized: "Retry")
      configuration.buttonProperties.primaryAction = UIAction { [weak self] _ in
        guard let self else { return }
        PhotoFeedStore.shared.load(.manifest(slug), force: true)
      }
      contentUnavailableConfiguration = configuration
      return
    }
    masonryView.setPhotos(feed.photos.map(MasonryPhoto.init(photo:)))
    masonryView.setRefreshing(false)
    if feed.photos.isEmpty {
      var configuration = UIContentUnavailableConfiguration.empty()
      configuration.image = UIImage(systemName: "photo.on.rectangle.angled")
      configuration.text = String(localized: "No photos yet")
      configuration.secondaryText = String(localized: "Upload photos from the web dashboard and they will appear here.")
      contentUnavailableConfiguration = configuration
    } else {
      contentUnavailableConfiguration = nil
    }
  }

  private func presentPhoto(at index: Int) {
    guard feed.photos.indices.contains(index) else { return }
    let controller = PhotoDetailViewController(
      photos: feed.photos,
      initialIndex: index,
      gallerySlug: slug,
      onRequestSignIn: onRequestSignIn,
      sourceProvider: { [weak masonryView] photoId in
        masonryView?.visibleTransitionSourceView(for: photoId)
      }
    )
    present(controller, animated: true)
  }

  private func performContextAction(_ action: String, photoId: String) {
    guard let photo = feed.photos.first(where: { $0.id == photoId }) else { return }
    if action == "share", let url = URL(string: photo.originalUrl) {
      let controller = UIActivityViewController(activityItems: [url], applicationActivities: nil)
      controller.popoverPresentationController?.sourceView = masonryView
      controller.popoverPresentationController?.sourceRect = masonryView.bounds
      present(controller, animated: true)
      return
    }
    guard action == "info" else { return }
    let model = PhotoInfoModel.build(
      photo: photo,
      localeIdentifier: PhotoDateLanguage.activeLocaleIdentifier
    )
    let host = UIHostingController(rootView: PhotoInfoSectionsList(info: model))
    host.navigationItem.title = String(localized: "Info")
    host.navigationItem.rightBarButtonItem = UIBarButtonItem(
      title: String(localized: "Done"),
      image: nil,
      primaryAction: UIAction { [weak host] _ in host?.dismiss(animated: true) },
      menu: nil
    )
    let navigation = UINavigationController(rootViewController: host)
    navigation.modalPresentationStyle = .pageSheet
    navigation.sheetPresentationController?.detents = [.medium(), .large()]
    navigation.sheetPresentationController?.prefersGrabberVisible = true
    present(navigation, animated: true)
  }
}
