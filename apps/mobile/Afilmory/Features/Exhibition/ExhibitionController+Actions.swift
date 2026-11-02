import UIKit

extension ExhibitionController {
  static func anchoredOffset(photoID: String, content: ExhibitionContent, layout: ExhibitionSheetLayout, topInset: CGFloat) -> CGFloat? {
    guard let index = content.blockIndex(containing: photoID), let frame = layout.frameOfBlock(index) else { return nil }
    return max(0, frame.minY - topInset)
  }

  func topVisiblePhotoID() -> String? {
    let line = collectionView.contentOffset.y + topBar.bounds.height
    for (index, placement) in content.placements.enumerated() {
      guard let frame = sheetLayout.frameOfBlock(index), frame.maxY > line else { continue }
      if let id = placement.block.groups?.first?.frames.first?.photoID { return id }
    }
    return nil
  }

  func sheetPages() -> [CGRect] {
    let safe = view.safeAreaInsets
    let content = CGRect(x: safe.left, y: 0, width: max(0, view.bounds.width - safe.left - safe.right), height: view.bounds.height)
    return DuoGeometry.lanes(in: content, context: traitCollection.duoContext, view: view)
  }

  func applyVerticalBar() {
    topBar.usesVerticalBar = traitCollection.duoContext.hasVerticalBar
    DuoBarItems.install(topBar.verticalBarItems(), on: self)
  }

  func wireTopBar() {
    topBar.onBack = { [weak self] in self?.navigationController?.popViewController(animated: true) }
    topBar.onSearch = { [weak self] in
      guard let self else { return }
      ExhibitionFilterPresenter.present(from: self, photos: feed.snapshot.photos)
    }
    topBar.onProject = { [weak self] in self?.openProjection() }
    topBar.onFollow = { [weak self] in self?.toggleFollow() }
  }

  func wireHero() {
    hero.opener.onOpen = { [weak self] in
      guard let self, let id = openerID else { return }
      openDetail(photoID: id)
    }
    hero.opener.onReExpose = { [weak self] in self?.reExpose() }
    hero.header.onSelectLevel = { [weak self] level in self?.setLevel(level, animated: true) }
    hero.header.onEditQuery = { [weak self] in
      guard let self else { return }
      ExhibitionFilterPresenter.present(from: self, photos: feed.snapshot.photos)
    }
    hero.header.onClearQuery = { PhotoFilterStore.shared.clear() }
  }

  func makeMapCard() -> ExhibitionMapCard {
    let card = ExhibitionMapCard()
    card.onOpen = { [weak self] id in self?.openDetail(photoID: id) }
    card.onFullScreen = { [weak self] in
      guard let self else { return }
      mapFullScreen.open(in: view, photos: content.shown, numbers: content.numbers)
    }
    return card
  }

  func makeMapFullScreen() -> ExhibitionMapFullScreen {
    let fullScreen = ExhibitionMapFullScreen(card: mapCard)
    fullScreen.onOpen = { [weak self] id in self?.openDetail(photoID: id) }
    return fullScreen
  }

  func reExpose() {
    guard let next = ExhibitionOpener.pick(from: content.shown, excluding: openerID) else { return }
    openerID = next.id
    configureOpener(next)
    hero.opener.playExposure()
    UIAccessibility.post(notification: .announcement, argument: String(localized: "Opener · No. \(ExhibitFormat.frameNumber(content.number(of: next.id)))"))
  }

  func openDetail(photoID: String) {
    let photos = content.shown
    guard let index = photos.firstIndex(where: { $0.id == photoID }) else { return }
    PhotoDetailPresenter.present(
      photos: photos,
      index: index,
      numbers: content.numbers,
      gallerySlug: feed.slug,
      from: self,
      sourceProvider: { [weak self] id in self?.sourceView(for: id) }
    )
  }

  func sourceView(for photoID: String) -> UIView? {
    if mapFullScreen.isOpen {
      return mapFullScreen.sourceView(for: photoID)
    }
    if hero.opener.photoID == photoID, collectionView.contentOffset.y < hero.opener.cardFrame.maxY {
      return hero.opener.imageView
    }
    if level == .infinity {
      return mapCard.pinViews()[photoID]?.imageView
    }
    for cell in collectionView.visibleCells.compactMap({ $0 as? ContactSheetRowCell }) {
      if let image = cell.imageView(for: photoID) {
        let frame = image.convert(image.bounds, to: view)
        if view.bounds.intersects(frame) { return image }
      }
    }
    return nil
  }

  func openProjection() {
    let photos = content.shown
    guard !photos.isEmpty else { return }
    let start = photos.firstIndex { $0.id == openerID } ?? 0
    let button = topBar.projectButton
    let center = button.convert(CGPoint(x: button.bounds.midX, y: button.bounds.midY), to: view)
    let projection = ProjectionController(photos: photos, startIndex: start, numbers: content.numbers, revealCenter: center)
    present(projection, animated: false)
  }

  func resolveGalleryHeader() {
    guard case .gallery(let slug, _) = source, galleryHeader == nil else { return }
    galleryHeader = GallerySubscriptionStore.shared.subscriptions
      .first { $0.gallery.slug == slug }
      .map(GalleryHeaderModel.init(subscription:))
      ?? GalleryDirectoryStore().loadCached()?
      .first { $0.slug == slug }
      .map(GalleryHeaderModel.init(featured:))
    guard case .signedIn(let session) = AfilmorySessionStore.shared.current().state else { return }
    Task { @MainActor [weak self] in
      await GallerySubscriptionStore.shared.load(userId: session.user.id, force: false)
      guard let self else { return }
      if galleryHeader == nil {
        galleryHeader = GallerySubscriptionStore.shared.subscriptions
          .first { $0.gallery.slug == slug }
          .map(GalleryHeaderModel.init(subscription:))
      }
      refreshFollowButton()
      topBar.setTitle(galleryHeader?.name ?? slug)
    }
  }

  func refreshFollowButton() {
    guard !isOwnSource else { return }
    guard let header = galleryHeader else {
      topBar.setFollow(.hidden)
      return
    }
    topBar.setFollow(resolveGallerySubscriptionButtonState(
      isOwnGallery: feed.isOwnGallery,
      isSubscribed: GallerySubscriptionStore.shared.isSubscribed(tenantId: header.tenantId),
      pendingTarget: pendingFollowTarget
    ))
  }

  func toggleFollow() {
    guard let header = galleryHeader, pendingFollowTarget == nil else { return }
    guard case .signedIn = AfilmorySessionStore.shared.current().state else {
      onRequestSignIn()
      return
    }
    let target = !GallerySubscriptionStore.shared.isSubscribed(tenantId: header.tenantId)
    pendingFollowTarget = target
    refreshFollowButton()
    Task { @MainActor [weak self] in
      do {
        if target {
          try await GallerySubscriptionStore.shared.subscribe(header)
          await GalleryNotificationPermissionCoordinator().requestAfterFollowIfUndecided()
        } else {
          try await GallerySubscriptionStore.shared.unsubscribe(tenantId: header.tenantId)
        }
      } catch {
        UIAccessibility.post(notification: .announcement, argument: String(localized: "Couldn't update following. Please try again."))
      }
      self?.pendingFollowTarget = nil
      self?.refreshFollowButton()
    }
  }
}
