import SafariServices
import SwiftUI
import UIKit

final class GalleryDetailController: UIViewController {
  private let onRequestSignIn: () -> Void
  private let onSubscriptionChanged: (Bool) -> Void
  private let slug: String
  private let header: GalleryHeaderModel?
  private var focusPhotoID: String?
  private var didPresentFocusedPhoto = false
  private let masonryView: PhotoMasonryView
  private var feed: PhotoFeed!
  private var observation: PhotoFeedObservationToken?
  private var headerHost: UIHostingController<GalleryHeaderView>?
  private var pendingSubscriptionTarget: Bool?
  private var subscriptionTask: Task<Void, Never>?

  init(
    slug: String,
    title: String,
    header: GalleryHeaderModel? = nil,
    onRequestSignIn: @escaping () -> Void,
    onSubscriptionChanged: @escaping (Bool) -> Void = { _ in },
    focusPhotoID: String? = nil
  ) {
    self.slug = slug
    self.header = header
    self.onRequestSignIn = onRequestSignIn
    self.onSubscriptionChanged = onSubscriptionChanged
    self.focusPhotoID = focusPhotoID
    masonryView = PhotoMasonryView(frame: .zero)
    super.init(nibName: nil, bundle: nil)
    self.title = title
    configureMasonry()
  }

  deinit {
    subscriptionTask?.cancel()
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
    installHeaderIfNeeded()
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
    masonryView.gap = 2
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

  private func installHeaderIfNeeded() {
    guard let header else { return }
    let host = UIHostingController(rootView: makeHeaderView(header))
    host.view.backgroundColor = .clear
    host.sizingOptions = .intrinsicContentSize
    addChild(host)
    masonryView.headerView = host.view
    host.didMove(toParent: self)
    headerHost = host
    registerForTraitChanges([UITraitPreferredContentSizeCategory.self]) { (controller: Self, _) in
      controller.masonryView.refreshHeaderViewHeight()
    }
    loadSubscriptionsIfNeeded()
  }

  private func makeHeaderView(_ model: GalleryHeaderModel) -> GalleryHeaderView {
    GalleryHeaderView(
      model: model,
      subscriptionState: resolveGallerySubscriptionButtonState(
        isOwnGallery: isOwnGallery,
        isSubscribed: GallerySubscriptionStore.shared.isSubscribed(tenantId: model.tenantId),
        pendingTarget: pendingSubscriptionTarget
      ),
      onToggleSubscription: { [weak self] in self?.toggleSubscription() },
      onOpenDomain: { [weak self] domain in self?.openDomain(domain) }
    )
  }

  private func refreshHeader() {
    guard let header, let headerHost else { return }
    headerHost.rootView = makeHeaderView(header)
    masonryView.refreshHeaderViewHeight()
  }

  private var isOwnGallery: Bool {
    guard case .signedIn(let session) = AfilmorySessionStore.shared.current().state else {
      return false
    }
    return session.activeWorkspace?.slug == slug
  }

  private func loadSubscriptionsIfNeeded() {
    guard case .signedIn(let session) = AfilmorySessionStore.shared.current().state,
          !isOwnGallery
    else { return }
    Task { @MainActor [weak self] in
      await GallerySubscriptionStore.shared.load(userId: session.user.id, force: false)
      self?.refreshHeader()
    }
  }

  private func toggleSubscription() {
    guard let header, pendingSubscriptionTarget == nil, !isOwnGallery else { return }
    guard case .signedIn = AfilmorySessionStore.shared.current().state else {
      onRequestSignIn()
      return
    }
    let target = !GallerySubscriptionStore.shared.isSubscribed(tenantId: header.tenantId)
    pendingSubscriptionTarget = target
    refreshHeader()
    subscriptionTask = Task { @MainActor [weak self] in
      guard let self else { return }
      var failure: Error?
      do {
        if target {
          try await GallerySubscriptionStore.shared.subscribe(header)
        } else {
          try await GallerySubscriptionStore.shared.unsubscribe(tenantId: header.tenantId)
        }
      } catch {
        failure = error
      }
      pendingSubscriptionTarget = nil
      refreshHeader()
      if failure == nil, !Task.isCancelled {
        onSubscriptionChanged(GallerySubscriptionStore.shared.isSubscribed(tenantId: header.tenantId))
      }
      guard let failure, !Task.isCancelled else { return }
      if case APIError.unauthorized = failure {
        AfilmorySessionStore.shared.refreshSession()
        onRequestSignIn()
      } else {
        presentSubscriptionError(failure)
      }
    }
  }

  private func presentSubscriptionError(_ error: Error) {
    guard presentedViewController == nil else { return }
    let alert = UIAlertController(
      title: String(localized: "Couldn’t update subscription"),
      message: error.localizedDescription,
      preferredStyle: .alert
    )
    alert.addAction(UIAlertAction(title: String(localized: "Done"), style: .default))
    present(alert, animated: true)
  }

  private func openDomain(_ domain: String) {
    guard let url = URL(string: "https://\(domain)") else { return }
    present(SFSafariViewController(url: url), animated: true)
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
    presentFocusedPhotoIfNeeded()
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

  private func presentFocusedPhotoIfNeeded() {
    guard !didPresentFocusedPhoto, let focusPhotoID else { return }
    if let index = feed.photos.firstIndex(where: { $0.id == focusPhotoID }) {
      didPresentFocusedPhoto = true
      self.focusPhotoID = nil
      presentPhoto(at: index)
      return
    }
    if feed.loadState == .loaded || feed.loadState == .failed {
      didPresentFocusedPhoto = true
      self.focusPhotoID = nil
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
    if action == "share" {
      PhotoShareActivity.present(
        photoId: photo.id,
        gallerySlug: slug,
        from: self,
        sourceView: masonryView
      )
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
