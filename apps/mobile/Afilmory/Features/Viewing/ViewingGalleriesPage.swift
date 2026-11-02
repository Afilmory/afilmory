import UIKit

final class ViewingGalleriesPage: ViewingPageController, UICollectionViewDataSource, UICollectionViewDataSourcePrefetching {
  private enum Section: Int {
    case following
    case discover
  }

  private static let searchGap: CGFloat = 14
  private let searchField = ViewingSearchField()
  private var following: [ViewingGalleryCard] = []
  private var discover: [ViewingGalleryCard] = []
  private var coverRequests: Set<String> = []

  init(model: ViewingModel) {
    super.init(page: .galleries, model: model)
  }

  override var extraTopInset: CGFloat {
    Self.searchGap + ViewingSearchField.height
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    collectionView.dataSource = self
    collectionView.prefetchDataSource = self
    collectionView.accessibilityIdentifier = "viewing.galleries"
    collectionView.register(ViewingGalleryCell.self, forCellWithReuseIdentifier: ViewingGalleryCell.reuseID)
    collectionView.register(
      ViewingSectionLabel.self,
      forSupplementaryViewOfKind: UICollectionView.elementKindSectionHeader,
      withReuseIdentifier: ViewingSectionLabel.reuseID
    )
    searchField.setText(model.query)
    searchField.onChange = { [weak self] text in self?.model.setQuery(text) }
    collectionView.addSubview(searchField)
    stateView.onAction = { [weak self] in self?.model.loadDirectory(force: true) }
    reload()
  }

  override func viewDidLayoutSubviews() {
    super.viewDidLayoutSubviews()
    layoutSearchField()
  }

  override func insetsDidChange() {
    layoutSearchField()
  }

  func setQuery(_ text: String) {
    loadViewIfNeeded()
    searchField.setText(text)
    model.setQuery(text)
  }

  private func layoutSearchField() {
    let height = ViewingSearchField.height
    let safe = view.safeAreaInsets
    searchField.frame = CGRect(x: 16 + safe.left, y: -height - 2, width: max(0, collectionView.bounds.width - 32 - safe.left - safe.right), height: height)
  }

  override func modelChanged(_ change: ViewingModel.Change) {
    guard change != .timeline else { return }
    reload()
  }

  private func reload() {
    let cards = model.cards
    following = cards.following
    discover = cards.discover
    collectionView.reloadData()
    stateView.apply(stateContent)
    scheduleAccentUpdate(delay: 0.05)
  }

  private var stateContent: ViewingStateView.Content? {
    guard following.isEmpty, discover.isEmpty else { return nil }
    switch model.directoryState {
    case .idle, .loading:
      return .loading
    case .failed:
      return .init(
        title: String(localized: "Couldn’t load galleries"),
        message: String(localized: "Check your connection and try again."),
        action: String(localized: "Retry")
      )
    case .loaded:
      return model.query.trimmingCharacters(in: .whitespaces).isEmpty
        ? .init(title: String(localized: "No galleries yet"), message: nil, action: nil, glyph: .viewfinder)
        : .init(
          title: String(localized: "No galleries found"),
          message: String(localized: "Try a gallery name, handle, or photographer."),
          action: nil,
          glyph: .viewfinder
        )
    }
  }

  private func cards(in section: Int) -> [ViewingGalleryCard] {
    Section(rawValue: section) == .following ? following : discover
  }

  private func covers(for card: ViewingGalleryCard) -> [GalleryCoverPhoto] {
    if let covers = card.covers, !covers.isEmpty { return covers }
    let recent = ViewingPhotoLoader.shared.cachedRecentPhotos(slug: card.slug) ?? []
    return recent.prefix(ViewingContent.galleryCoverLimit).map(GalleryCoverPhoto.init(photo:))
  }

  private func requestCovers(for card: ViewingGalleryCard) {
    guard card.covers?.isEmpty ?? true,
          ViewingPhotoLoader.shared.cachedRecentPhotos(slug: card.slug) == nil,
          !coverRequests.contains(card.slug)
    else { return }
    coverRequests.insert(card.slug)
    Task { [weak self] in
      let photos = await ViewingPhotoLoader.shared.recentPhotos(slug: card.slug)
      guard let self else { return }
      if photos.isEmpty { return }
      coverRequests.remove(card.slug)
      let paths = indexPaths(slug: card.slug)
      guard !paths.isEmpty else { return }
      UIView.performWithoutAnimation {
        collectionView.performBatchUpdates { collectionView.reloadItems(at: paths) }
      }
    }
  }

  private func indexPaths(slug: String) -> [IndexPath] {
    [Section.following, .discover].flatMap { section in
      cards(in: section.rawValue).enumerated()
        .filter { $0.element.slug == slug }
        .map { IndexPath(item: $0.offset, section: section.rawValue) }
    }
  }

  private func card(at indexPath: IndexPath) -> ViewingGalleryCard? {
    let list = cards(in: indexPath.section)
    return list.indices.contains(indexPath.item) ? list[indexPath.item] : nil
  }

  func numberOfSections(in _: UICollectionView) -> Int {
    2
  }

  func collectionView(_: UICollectionView, numberOfItemsInSection section: Int) -> Int {
    cards(in: section).count
  }

  func collectionView(_ collectionView: UICollectionView, cellForItemAt indexPath: IndexPath) -> UICollectionViewCell {
    let cell = collectionView.dequeueReusableCell(withReuseIdentifier: ViewingGalleryCell.reuseID, for: indexPath)
    guard let galleryCell = cell as? ViewingGalleryCell, let card = card(at: indexPath) else { return cell }
    let covers = covers(for: card)
    galleryCell.configure(
      card,
      covers: covers,
      isFollowing: model.isFollowing(card.id),
      isUpdating: model.isUpdatingFollow(card.id)
    )
    galleryCell.onOpenGallery = { [weak self] in self?.host?.pageOpenGallery(card.header) }
    galleryCell.onToggleFollow = { [weak self] in self?.toggleFollow(card) }
    galleryCell.onSelectPhoto = { [weak self, weak galleryCell] cover in
      guard let self else { return }
      self.host?.pageOpenPhoto(cover, covers: covers, gallery: card.header) { [weak self, weak galleryCell] photoID in
        guard let self, let galleryCell, galleryCell.card?.id == card.id else { return nil }
        return self.sourceView(cell: galleryCell, photoID: photoID)
      }
    }
    requestCovers(for: card)
    return cell
  }

  private func toggleFollow(_ card: ViewingGalleryCard) {
    let handled = model.toggleFollow(card) { [weak self] error in
      self?.host?.pageFollowFailed(error)
    }
    if !handled { host?.pageRequestSignIn() }
  }

  func collectionView(_: UICollectionView, prefetchItemsAt indexPaths: [IndexPath]) {
    indexPaths.compactMap(card(at:)).forEach(requestCovers(for:))
  }

  func collectionView(
    _ collectionView: UICollectionView,
    viewForSupplementaryElementOfKind kind: String,
    at indexPath: IndexPath
  ) -> UICollectionReusableView {
    let view = collectionView.dequeueReusableSupplementaryView(ofKind: kind, withReuseIdentifier: ViewingSectionLabel.reuseID, for: indexPath)
    let title = Section(rawValue: indexPath.section) == .following
      ? String(localized: "Galleries you follow")
      : String(localized: "Discover")
    (view as? ViewingSectionLabel)?.configure(title)
    return view
  }

  func collectionView(_: UICollectionView, layout _: UICollectionViewLayout, sizeForItemAt indexPath: IndexPath) -> CGSize {
    guard let card = card(at: indexPath) else { return .zero }
    let width = cardWidth(at: indexPath)
    return CGSize(width: width, height: ViewingGalleryCell.height(covers: covers(for: card), width: width))
  }

  func collectionView(_ collectionView: UICollectionView, layout _: UICollectionViewLayout, referenceSizeForHeaderInSection section: Int) -> CGSize {
    guard !cards(in: section).isEmpty else { return .zero }
    let isFirst = section == Section.following.rawValue || following.isEmpty
    return CGSize(width: collectionView.bounds.width, height: ViewingSectionLabel.height(topMargin: isFirst ? 10 : 28) + 12)
  }
}
