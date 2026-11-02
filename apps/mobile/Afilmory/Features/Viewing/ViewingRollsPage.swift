import UIKit

final class ViewingRollsPage: ViewingPageController, UICollectionViewDataSource {
  private var chapters: [ViewingRollChapter] = []
  private let refreshControl = UIRefreshControl()

  init(model: ViewingModel) {
    super.init(page: .rolls, model: model)
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    collectionView.dataSource = self
    collectionView.register(ViewingRollCell.self, forCellWithReuseIdentifier: ViewingRollCell.reuseID)
    collectionView.register(
      ViewingChapterHeader.self,
      forSupplementaryViewOfKind: UICollectionView.elementKindSectionHeader,
      withReuseIdentifier: ViewingChapterHeader.reuseID
    )
    collectionView.register(
      ViewingLoadingFooter.self,
      forSupplementaryViewOfKind: UICollectionView.elementKindSectionFooter,
      withReuseIdentifier: ViewingLoadingFooter.reuseID
    )
    collectionView.accessibilityIdentifier = "viewing.rolls"
    refreshControl.tintColor = AFColor.textTertiary
    refreshControl.addAction(UIAction { [weak self] _ in self?.pullToRefresh() }, for: .valueChanged)
    collectionView.refreshControl = refreshControl
    stateView.onAction = { [weak self] in self?.stateAction() }
    reload()
  }

  override func modelChanged(_ change: ViewingModel.Change) {
    guard change != .directory else { return }
    reload()
  }

  private func reload() {
    chapters = ViewingContent.chapters(from: model.timelineEvents)
    collectionView.reloadData()
    stateView.apply(stateContent)
    if !model.timelineIsLoading, refreshControl.isRefreshing {
      refreshControl.endRefreshing()
    }
    scheduleAccentUpdate(delay: 0.05)
  }

  private var emptyKind: TimelineEmptyKind {
    resolveTimelineEmptyKind(
      hasSubscriptions: !model.subscriptions.isEmpty,
      eventCount: model.timelineEvents.count,
      isLoading: model.timelineIsLoading || (!model.subscriptionsLoaded && model.subscriptions.isEmpty),
      loadFailed: model.timelineFailed
    )
  }

  private var stateContent: ViewingStateView.Content? {
    guard model.timelineEvents.isEmpty else { return nil }
    if model.timelineFailed, !model.timelineIsLoading {
      return .init(
        title: String(localized: "Couldn’t load new rolls"),
        message: String(localized: "Check your connection and try again."),
        action: String(localized: "Retry")
      )
    }
    switch emptyKind {
    case .none:
      return refreshControl.isRefreshing ? nil : .loading
    case .noSubscriptions:
      return .init(
        title: String(localized: "You aren’t following any galleries yet."),
        message: String(localized: "Follow a gallery and its new rolls develop here."),
        action: String(localized: "Go to Galleries"),
        glyph: .filmFrame
      )
    case .noRecentUpdates:
      return .init(
        title: String(localized: "No new rolls yet"),
        message: String(localized: "Galleries you follow appear here when they develop new photos."),
        action: nil,
        glyph: .filmFrame
      )
    }
  }

  private func stateAction() {
    if model.timelineFailed {
      Task { await model.refreshTimeline() }
    } else {
      host?.pageShowGalleries()
    }
  }

  private func pullToRefresh() {
    Task {
      await model.refreshSubscriptions()
      await model.refreshTimeline()
      refreshControl.endRefreshing()
    }
  }

  func numberOfSections(in _: UICollectionView) -> Int {
    chapters.count
  }

  func collectionView(_: UICollectionView, numberOfItemsInSection section: Int) -> Int {
    chapters[section].rolls.count
  }

  func collectionView(_ collectionView: UICollectionView, cellForItemAt indexPath: IndexPath) -> UICollectionViewCell {
    let cell = collectionView.dequeueReusableCell(withReuseIdentifier: ViewingRollCell.reuseID, for: indexPath)
    guard let roll = cell as? ViewingRollCell else { return cell }
    let event = chapters[indexPath.section].rolls[indexPath.item]
    roll.configure(event)
    let header = GalleryHeaderModel(timelineEvent: event)
    roll.onOpenGallery = { [weak self] in self?.host?.pageOpenGallery(header) }
    roll.onSelectPhoto = { [weak self, weak roll] cover in
      guard let self, let roll else { return }
      let eventID = event.id
      self.host?.pageOpenPhoto(cover, covers: ViewingRollCell.covers(for: event), gallery: header) { [weak self, weak roll] photoID in
        guard let self, let roll, roll.event?.id == eventID else { return nil }
        return self.sourceView(cell: roll, photoID: photoID)
      }
    }
    return cell
  }

  func collectionView(
    _ collectionView: UICollectionView,
    viewForSupplementaryElementOfKind kind: String,
    at indexPath: IndexPath
  ) -> UICollectionReusableView {
    if kind == UICollectionView.elementKindSectionFooter {
      let footer = collectionView.dequeueReusableSupplementaryView(ofKind: kind, withReuseIdentifier: ViewingLoadingFooter.reuseID, for: indexPath)
      (footer as? ViewingLoadingFooter)?.setLoading(model.timelineIsLoading)
      return footer
    }
    let view = collectionView.dequeueReusableSupplementaryView(ofKind: kind, withReuseIdentifier: ViewingChapterHeader.reuseID, for: indexPath)
    (view as? ViewingChapterHeader)?.configure(chapters[indexPath.section])
    return view
  }

  func collectionView(_: UICollectionView, layout _: UICollectionViewLayout, sizeForItemAt indexPath: IndexPath) -> CGSize {
    let event = chapters[indexPath.section].rolls[indexPath.item]
    let width = cardWidth(at: indexPath)
    return CGSize(width: width, height: ViewingRollCell.height(for: event, width: width))
  }

  func collectionView(_ collectionView: UICollectionView, layout _: UICollectionViewLayout, referenceSizeForHeaderInSection _: Int) -> CGSize {
    CGSize(width: collectionView.bounds.width, height: ViewingChapterHeader.height)
  }

  func collectionView(_ collectionView: UICollectionView, layout _: UICollectionViewLayout, referenceSizeForFooterInSection section: Int) -> CGSize {
    let isLast = section == chapters.count - 1
    return CGSize(width: collectionView.bounds.width, height: isLast && model.timelineHasMore ? 64 : 0)
  }

  override func scrollViewDidScroll(_ scrollView: UIScrollView) {
    super.scrollViewDidScroll(scrollView)
    let remaining = scrollView.contentSize.height - scrollView.contentOffset.y - scrollView.bounds.height
    if remaining < 600, scrollView.contentSize.height > 0 {
      model.loadMoreTimeline()
    }
  }
}
