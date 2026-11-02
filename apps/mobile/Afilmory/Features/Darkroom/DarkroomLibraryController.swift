import UIKit

final class DarkroomLibraryController: UIViewController, UICollectionViewDataSource, UICollectionViewDelegate {
  private var collection: UICollectionView!
  private let deleteButton = DarkroomPillButton(style: .filled, height: 50)
  private let emptyLabel = AFLabel.exhibit(String(localized: "No photos yet"), size: 22)
  private var items: [StudioFeedPhoto] = []
  private var selection = StudioLibrarySelection()
  private var feedToken: PhotoFeedObservationToken?
  private var mutating = false
  private var allowsEmptyState = false
  private let startsSelecting: Bool

  init(startsSelecting: Bool = false) {
    self.startsSelecting = startsSelecting
    super.init(nibName: nil, bundle: nil)
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  private var lanes: [ClosedRange<CGFloat>]?
  private var laneColumns = [3]

  override func viewWillLayoutSubviews() {
    super.viewWillLayoutSubviews()
    applyLanes()
  }

  private func applyLanes() {
    guard let collection else { return }
    let safe = view.safeAreaInsets
    let rect = CGRect(x: safe.left, y: 0, width: max(0, view.bounds.width - safe.left - safe.right), height: view.bounds.height)
    let pages = DuoGeometry.lanes(in: rect, context: traitCollection.duoContext, view: view)
    let next = pages.map { ($0.minX + 16)...($0.maxX - 16) }
    guard next != lanes, rect.width > 0 else { return }
    lanes = next
    if next.count > 1 {
      laneColumns = next.map { DarkroomLibraryCell.spreadColumns(laneWidth: $0.upperBound - $0.lowerBound) }
      collection.setCollectionViewLayout(DarkroomLibraryCell.layout(lanes: next), animated: false)
    } else {
      laneColumns = [3]
      collection.setCollectionViewLayout(DarkroomLibraryCell.layout(leading: 16 + safe.left, trailing: 16 + safe.right), animated: false)
    }
    collection.reloadData()
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = AFColor.ground
    collection = UICollectionView(frame: .zero, collectionViewLayout: DarkroomLibraryCell.layout())
    collection.backgroundColor = .clear
    collection.dataSource = self
    collection.delegate = self
    collection.allowsMultipleSelection = false
    collection.register(DarkroomLibraryCell.self, forCellWithReuseIdentifier: "photo")
    collection.register(DarkroomLibraryHeader.self, forSupplementaryViewOfKind: UICollectionView.elementKindSectionHeader, withReuseIdentifier: "header")
    collection.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(collection)
    deleteButton.configuration?.baseBackgroundColor = AFColor.destructive
    deleteButton.translatesAutoresizingMaskIntoConstraints = false
    deleteButton.isHidden = true
    deleteButton.addAction(UIAction { [weak self] _ in self?.confirmDelete() }, for: .primaryActionTriggered)
    view.addSubview(deleteButton)
    emptyLabel.textAlignment = .center
    emptyLabel.isHidden = true
    view.addSubview(emptyLabel)
    NSLayoutConstraint.activate([
      collection.topAnchor.constraint(equalTo: view.topAnchor),
      collection.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      collection.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      collection.bottomAnchor.constraint(equalTo: view.bottomAnchor),
      deleteButton.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 22),
      deleteButton.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -22),
      deleteButton.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -12),
      emptyLabel.centerXAnchor.constraint(equalTo: view.centerXAnchor),
      emptyLabel.centerYAnchor.constraint(equalTo: view.centerYAnchor),
    ])
    let feed = PhotoFeedStore.shared.feed(for: .studioLibrary)
    feedToken = feed.observe { [weak self, weak feed] in
      guard let feed else { return }
      self?.render(feed.studioPhotos)
    }
    render(feed.studioPhotos)
    PhotoFeedStore.shared.load(.studioLibrary)
    // The replica publishes an empty .loaded snapshot before the first studio sync lands.
    DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) { [weak self, weak feed] in
      guard let self, let feed else { return }
      self.allowsEmptyState = true
      self.render(feed.studioPhotos)
    }
    if startsSelecting { toggleSelecting() }
    updateChrome()
  }

  private func render(_ photos: [StudioFeedPhoto]) {
    items = photos
    selection.prune(keeping: Set(photos.map(\.asset.id)))
    let loaded = PhotoFeedStore.shared.feed(for: .studioLibrary).loadState == .loaded
    emptyLabel.isHidden = !photos.isEmpty || !loaded || !allowsEmptyState
    collection.reloadData()
    updateChrome()
  }

  private func toggleSelecting() {
    selection.isActive ? selection.end() : selection.begin()
    collection.visibleCells.compactMap { $0 as? DarkroomLibraryCell }.forEach { cell in
      guard let index = collection.indexPath(for: cell)?.item, items.indices.contains(index) else { return }
      cell.setSelectionState(selection.isActive ? selection.contains(items[index].asset.id) : nil)
    }
    updateChrome()
  }

  private func updateChrome() {
    if let header = collection?.visibleSupplementaryViews(ofKind: UICollectionView.elementKindSectionHeader).first as? DarkroomLibraryHeader {
      configure(header)
    }
    let count = selection.ids.count
    deleteButton.setTitle(String(localized: "Delete \(count)"), size: 16)
    deleteButton.isEnabled = count > 0 && !mutating
    let visible = selection.isActive
    if visible, deleteButton.isHidden {
      deleteButton.isHidden = false
      deleteButton.transform = CGAffineTransform(translationX: 0, y: 24)
      AFMotion.spring(duration: 0.35, animations: { self.deleteButton.transform = .identity })
    } else if !visible {
      deleteButton.isHidden = true
    }
    collection.contentInset.bottom = visible ? 74 : 0
  }

  private func configure(_ header: DarkroomLibraryHeader) {
    header.configure(
      meta: StudioLibrarySelection.meta(frames: items.count, selected: selection.isActive ? selection.ids.count : nil),
      action: selection.isActive ? String(localized: "Done") : String(localized: "Select"),
      enabled: !items.isEmpty
    ) { [weak self] in self?.toggleSelecting() }
  }

  func collectionView(_: UICollectionView, numberOfItemsInSection _: Int) -> Int {
    items.count
  }

  func collectionView(_ collectionView: UICollectionView, cellForItemAt indexPath: IndexPath) -> UICollectionViewCell {
    let cell = collectionView.dequeueReusableCell(withReuseIdentifier: "photo", for: indexPath) as! DarkroomLibraryCell
    let item = items[indexPath.item]
    cell.configure(
      photo: item.photo,
      frame: ExhibitFormat.frameNumber(items.count - indexPath.item),
      corners: DarkroomLibraryCell.laneCorners(index: indexPath.item, count: items.count, columns: laneColumns)
    )
    cell.setSelectionState(selection.isActive ? selection.contains(item.asset.id) : nil)
    return cell
  }

  func collectionView(_ collectionView: UICollectionView, viewForSupplementaryElementOfKind kind: String, at indexPath: IndexPath) -> UICollectionReusableView {
    let header = collectionView.dequeueReusableSupplementaryView(ofKind: kind, withReuseIdentifier: "header", for: indexPath) as! DarkroomLibraryHeader
    configure(header)
    return header
  }

  func collectionView(_ collectionView: UICollectionView, didSelectItemAt indexPath: IndexPath) {
    collectionView.deselectItem(at: indexPath, animated: false)
    let item = items[indexPath.item]
    guard selection.isActive else {
      let photos = items.map(\.photo)
      PhotoDetailPresenter.present(photos: photos, index: indexPath.item, gallerySlug: nil, from: self) { [weak self] id in
        guard let self, let index = self.items.firstIndex(where: { $0.photo.id == id }) else { return nil }
        return self.collection.cellForItem(at: IndexPath(item: index, section: 0))
      }
      return
    }
    selection.toggle(item.asset.id)
    UISelectionFeedbackGenerator().selectionChanged()
    (collectionView.cellForItem(at: indexPath) as? DarkroomLibraryCell)?.setSelectionState(selection.contains(item.asset.id))
    updateChrome()
  }

  private func confirmDelete() {
    let ids = selection.ids
    guard !ids.isEmpty, !mutating else { return }
    let providers = items.filter { ids.contains($0.asset.id) }.map(\.asset.storageProvider)
    let alert = UIAlertController(
      title: String(localized: "Delete selected photos?"),
      message: String(localized: "Delete \(ids.count) selected photos. Removing storage files cannot be undone."),
      preferredStyle: .actionSheet
    )
    for choice in StudioLibrarySelection.deleteChoices(storageProviders: providers) {
      let title = switch choice {
      case .removeRecord: String(localized: "Remove record only")
      case .deleteFiles: providers.isEmpty ? String(localized: "Delete") : String(localized: "Delete files too")
      }
      alert.addAction(UIAlertAction(title: title, style: .destructive) { [weak self] _ in
        self?.delete(ids, fromStorage: choice == .deleteFiles)
      })
    }
    alert.addAction(UIAlertAction(title: String(localized: "Cancel"), style: .cancel))
    alert.popoverPresentationController?.sourceView = deleteButton
    present(alert, animated: true)
  }

  private func delete(_ ids: [String], fromStorage: Bool) {
    mutating = true
    updateChrome()
    Task { [weak self] in
      do {
        let changes = try await StudioPhotoMutations.delete(assetIds: ids, fromStorage: fromStorage)
        changes.forEach(PhotoFeedStore.shared.applyCommitted)
        if let slug = AfilmorySessionStore.shared.current().state.session?.activeWorkspace?.slug {
          PhotoSyncEngine.shared.ensureSynced(slug: slug, includeStudio: true)
        }
        self?.mutating = false
        self?.toggleSelecting()
      } catch {
        self?.mutating = false
        self?.updateChrome()
        let alert = UIAlertController(title: String(localized: "Unable to delete photos"), message: error.localizedDescription, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: String(localized: "Done"), style: .default))
        self?.present(alert, animated: true)
      }
    }
  }
}
