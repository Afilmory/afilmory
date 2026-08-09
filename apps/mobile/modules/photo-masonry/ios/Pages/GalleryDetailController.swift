import SwiftUI
import UIKit

final class GalleryDetailController: UIViewController {
  private let onRequestSignIn: () -> Void
  private let slug: String
  private let localization = Localization.shared
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
    masonryView.contextMenuInfoTitle = localization.value("photo.info")
    masonryView.contextMenuShareTitle = localization.value("photo.share")
    masonryView.defaultColumnCount = 2
    masonryView.extraBottomInset = 96
    masonryView.gap = 4
    masonryView.livePhotoAccessibilityLabel = localization.value("photo.livePhoto")
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
      configuration.text = localization.value("gallery.failed.photos")
      configuration.secondaryText = localization.value("gallery.failed.detail")
      configuration.button = .filled()
      configuration.button.title = localization.value("common.retry")
      configuration.buttonProperties.primaryAction = UIAction { [weak self] _ in
        guard let self else { return }
        PhotoFeedStore.shared.load(.manifest(slug), force: true)
      }
      contentUnavailableConfiguration = configuration
      return
    }
    masonryView.setPhotos(feed.photos.map { MasonryPhoto(photo: $0, localization: localization) })
    masonryView.setRefreshing(false)
    if feed.photos.isEmpty {
      var configuration = UIContentUnavailableConfiguration.empty()
      configuration.image = UIImage(systemName: "photo.on.rectangle.angled")
      configuration.text = localization.value("gallery.empty.title")
      configuration.secondaryText = localization.value("gallery.empty.subtitle")
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
      localization: localization,
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
      localization: localization,
      localeIdentifier: localization.language.localeIdentifier
    )
    guard let info = PhotoInfoSheetRecord.decode(
      json: model.detailJSON(localization: localization)
    ) else { return }
    let host = UIHostingController(rootView: PhotoInfoSectionsList(info: info))
    host.navigationItem.title = info.localization.title
    host.navigationItem.rightBarButtonItem = UIBarButtonItem(
      title: info.localization.done,
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
