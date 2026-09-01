import UIKit

final class FollowingGalleriesController: UIViewController, UICollectionViewDataSource, UICollectionViewDelegate {
  var onBrowseExploreHandler: () -> Void
  private let onRequestSignIn: () -> Void
  private let onOpenGallery: (GalleryHeaderModel, String?) -> Void
  private let layout = UICollectionViewFlowLayout()
  private lazy var collectionView = UICollectionView(frame: .zero, collectionViewLayout: layout)
  private let refreshControl = UIRefreshControl()
  private var items: [GallerySubscriptionItem] = []
  private var previousLayoutWidth: CGFloat = 0

  init(
    onRequestSignIn: @escaping () -> Void,
    onOpenGallery: @escaping (GalleryHeaderModel, String?) -> Void,
    onBrowseExplore: @escaping () -> Void
  ) {
    self.onRequestSignIn = onRequestSignIn
    self.onOpenGallery = onOpenGallery
    onBrowseExploreHandler = onBrowseExplore
    super.init(nibName: nil, bundle: nil)
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) is not supported")
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .systemGroupedBackground
    collectionView.backgroundColor = .systemGroupedBackground
    collectionView.alwaysBounceVertical = true
    collectionView.dataSource = self
    collectionView.delegate = self
    collectionView.register(GalleryCardCell.self, forCellWithReuseIdentifier: GalleryCardCell.reuseIdentifier)
    refreshControl.addTarget(self, action: #selector(refresh), for: .valueChanged)
    collectionView.refreshControl = refreshControl
    collectionView.frame = view.bounds
    collectionView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    view.addSubview(collectionView)
    reloadFromStore()
  }

  override func viewDidLayoutSubviews() {
    super.viewDidLayoutSubviews()
    let width = collectionView.bounds.width
    guard abs(width - previousLayoutWidth) >= 0.5 else { return }
    previousLayoutWidth = width
    configureLayout(width: width)
  }

  func reloadFromStore() {
    items = GallerySubscriptionStore.shared.subscriptions
    collectionView.reloadData()
    if items.isEmpty {
      var configuration = UIContentUnavailableConfiguration.empty()
      configuration.text = String(localized: "Subscribe to galleries to see new photos.")
      configuration.button = .filled()
      configuration.button.title = String(localized: "Browse galleries")
      configuration.buttonProperties.primaryAction = UIAction { [weak self] _ in
        self?.onBrowseExploreHandler()
      }
      contentUnavailableConfiguration = configuration
    } else {
      contentUnavailableConfiguration = nil
    }
  }

  @objc private func refresh() {
    Task { @MainActor [weak self] in
      if case .signedIn(let session) = AfilmorySessionStore.shared.current().state {
        await GallerySubscriptionStore.shared.load(userId: session.user.id, force: true)
      }
      self?.reloadFromStore()
      self?.refreshControl.endRefreshing()
    }
  }

  func collectionView(_ collectionView: UICollectionView, numberOfItemsInSection section: Int) -> Int {
    items.count
  }

  func collectionView(
    _ collectionView: UICollectionView,
    cellForItemAt indexPath: IndexPath
  ) -> UICollectionViewCell {
    guard let cell = collectionView.dequeueReusableCell(
      withReuseIdentifier: GalleryCardCell.reuseIdentifier,
      for: indexPath
    ) as? GalleryCardCell else {
      return UICollectionViewCell()
    }
    let item = items[indexPath.item]
    let featured = FeaturedGallery(
      id: item.gallery.id,
      name: item.gallery.name,
      slug: item.gallery.slug,
      domain: item.gallery.domain,
      description: nil,
      author: item.gallery.author,
      photoCount: item.gallery.photoCount,
      isSubscribed: true,
      isOwnGallery: false,
      tags: [],
      createdAt: item.createdAt,
      lastUpload: item.gallery.lastUpload
    )
    cell.configure(
      gallery: featured,
      covers: item.recentPhotos.map {
        GalleryCoverPhoto(
          id: $0.id,
          thumbnailUrl: $0.thumbnailUrl,
          thumbHash: $0.thumbHash,
          aspectRatio: $0.aspectRatio,
          isLivePhoto: $0.isLivePhoto
        )
      },
      photoCount: String(localized: "\(item.gallery.photoCount) photos"),
      subscriptionState: .subscribed,
      subscribeTitle: String(localized: "Subscribe"),
      subscribedTitle: String(localized: "Subscribed"),
      unsubscribeTitle: String(localized: "Unsubscribe"),
      accessibilityLabel: String(localized: "Open \(item.gallery.name)"),
      onSubscriptionToggle: { [weak self] in
        self?.unsubscribe(item)
      },
      onPhotoTap: { [weak self] photoID in
        self?.onOpenGallery(GalleryHeaderModel(subscription: item), photoID)
      }
    )
    return cell
  }

  func collectionView(_ collectionView: UICollectionView, didSelectItemAt indexPath: IndexPath) {
    collectionView.deselectItem(at: indexPath, animated: true)
    let item = items[indexPath.item]
    onOpenGallery(GalleryHeaderModel(subscription: item), nil)
  }

  func collectionView(
    _ collectionView: UICollectionView,
    contextMenuConfigurationForItemAt indexPath: IndexPath,
    point: CGPoint
  ) -> UIContextMenuConfiguration? {
    let item = items[indexPath.item]
    return UIContextMenuConfiguration(actionProvider: { [weak self] _ in
      UIMenu(children: [
        UIAction(title: String(localized: "Unsubscribe"), attributes: .destructive) { _ in
          self?.unsubscribe(item)
        },
      ])
    })
  }

  private func unsubscribe(_ item: GallerySubscriptionItem) {
    GallerySubscriptionStore.shared.remove(tenantId: item.tenantId)
    GalleryTimelineStore.shared.removeEvents(tenantId: item.tenantId)
    reloadFromStore()
    Task { @MainActor [weak self] in
      do {
        let _: GallerySubscriptionMutationResponse = try await AfilmoryAPI.shared.request(
          GallerySubscriptionAPI.unsubscribe(tenantId: item.tenantId)
        )
      } catch {
        if case .signedIn(let session) = AfilmorySessionStore.shared.current().state {
          await GallerySubscriptionStore.shared.load(userId: session.user.id, force: true)
        }
        self?.reloadFromStore()
        self?.presentSubscriptionError()
      }
    }
  }

  private func presentSubscriptionError() {
    guard presentedViewController == nil else { return }
    let alert = UIAlertController(
      title: String(localized: "Couldn’t update subscription"),
      message: String(localized: "Check your connection and try again."),
      preferredStyle: .alert
    )
    alert.addAction(UIAlertAction(title: String(localized: "Done"), style: .default))
    present(alert, animated: true)
  }

  private func configureLayout(width: CGFloat) {
    let horizontalPadding: CGFloat = width >= 1000 ? 28 : width >= 600 ? 20 : 16
    let gap: CGFloat = width < 600 ? 14 : 16
    let availableWidth = max(0, width - horizontalPadding * 2)
    let columns = max(1, min(3, Int(floor((availableWidth + gap) / (300 + gap)))))
    let itemWidth = floor((availableWidth - CGFloat(columns - 1) * gap) / CGFloat(columns))
    layout.minimumInteritemSpacing = gap
    layout.minimumLineSpacing = gap
    layout.sectionInset = UIEdgeInsets(top: 12, left: horizontalPadding, bottom: 16, right: horizontalPadding)
    layout.itemSize = CGSize(width: itemWidth, height: GalleryCardCell.preferredHeight(for: itemWidth))
    layout.invalidateLayout()
  }
}
