import UIKit

extension ExhibitionController: UICollectionViewDataSource, UICollectionViewDelegate {
  func configureCollection() {
    collectionView.backgroundColor = .clear
    collectionView.contentInsetAdjustmentBehavior = .never
    collectionView.alwaysBounceVertical = true
    collectionView.showsVerticalScrollIndicator = true
    collectionView.indicatorStyle = .white
    collectionView.dataSource = self
    collectionView.delegate = self
    collectionView.register(ExhibitionHostCell.self, forCellWithReuseIdentifier: ExhibitionHostCell.reuseID)
    collectionView.register(ContactSheetRowCell.self, forCellWithReuseIdentifier: ContactSheetRowCell.reuseID)
    collectionView.register(ContactSheetYearCell.self, forCellWithReuseIdentifier: ContactSheetYearCell.reuseID)
    let pinch = UIPinchGestureRecognizer(target: self, action: #selector(handlePinch(_:)))
    collectionView.addGestureRecognizer(pinch)
  }

  func numberOfSections(in _: UICollectionView) -> Int {
    2
  }

  func collectionView(_: UICollectionView, numberOfItemsInSection section: Int) -> Int {
    guard !content.shown.isEmpty else { return 0 }
    if section == 0 { return 1 }
    return level == .infinity ? 1 : content.blocks.count
  }

  func collectionView(_ collectionView: UICollectionView, cellForItemAt indexPath: IndexPath) -> UICollectionViewCell {
    if indexPath.section == 0 || level == .infinity {
      let cell = collectionView.dequeueReusableCell(withReuseIdentifier: ExhibitionHostCell.reuseID, for: indexPath) as! ExhibitionHostCell
      cell.host(indexPath.section == 0 ? hero : mapCard)
      return cell
    }
    switch content.blocks[indexPath.item] {
    case .year(let year):
      let cell = collectionView.dequeueReusableCell(withReuseIdentifier: ContactSheetYearCell.reuseID, for: indexPath) as! ContactSheetYearCell
      cell.configure(year: year)
      return cell
    case .row(let groups):
      let cell = collectionView.dequeueReusableCell(withReuseIdentifier: ContactSheetRowCell.reuseID, for: indexPath) as! ContactSheetRowCell
      cell.configure(groups: groups, level: level, photos: photoLookup)
      cell.onOpen = { [weak self] id in self?.openDetail(photoID: id) }
      return cell
    }
  }

  var photoLookup: [String: GalleryPhoto] {
    Dictionary(content.shown.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
  }

  func scrollViewDidScroll(_ scrollView: UIScrollView) {
    let offset = scrollView.contentOffset.y
    hero.opener.applyScroll(offset: offset)
    topBar.update(scrollOffset: offset, titleThreshold: hero.headerTop - topBar.bounds.height + 20)
  }

  @objc func handlePinch(_ pinch: UIPinchGestureRecognizer) {
    switch pinch.state {
    case .began:
      pinchHandled = false
    case .changed:
      guard !pinchHandled else { return }
      let levels = content.availableLevels
      guard let index = levels.firstIndex(of: level) else { return }
      if pinch.scale > 1.25, index + 1 < levels.count {
        pinchHandled = true
        setLevel(levels[index + 1], animated: true)
      } else if pinch.scale < 0.8, index > 0 {
        pinchHandled = true
        setLevel(levels[index - 1], animated: true)
      }
    default:
      pinchHandled = false
    }
  }

  func setLevel(_ next: ContactSheetLevel, animated: Bool) {
    guard next != level, !content.shown.isEmpty else { return }
    let flying = animated && next == .infinity
      ? ExhibitionFlyIn.capture(
        from: collectionView.visibleCells.compactMap { $0 as? ContactSheetRowCell },
        located: Set(content.map.located),
        in: view
      )
      : []
    level = next
    UISelectionFeedbackGenerator().selectionChanged()
    render(animatedLevelChange: animated)
    guard animated else { return }
    if next == .infinity {
      ExhibitionFlyIn.run(flying, card: mapCard, in: view)
      riseBlocks(baseDelay: 0, step: 0.04)
    } else {
      riseBlocks(baseDelay: 0, step: 0.04)
    }
    UIAccessibility.post(notification: .announcement, argument: content.caption())
  }

  func riseBlocks(baseDelay: TimeInterval, step: TimeInterval) {
    let cells = collectionView.indexPathsForVisibleItems
      .filter { $0.section == 1 }
      .sorted { $0.item < $1.item }
      .compactMap { collectionView.cellForItem(at: $0) }
    for (index, cell) in cells.enumerated() {
      ExhibitionMotion.rise(cell.contentView, delay: baseDelay + Double(min(index, 10)) * step)
    }
  }

  func scrollToMap() {
    guard let frame = sheetLayout.frameOfBlock(0) else { return }
    let target = frame.minY - topBar.bounds.height - 16
    collectionView.setContentOffset(CGPoint(x: 0, y: max(0, min(target, collectionView.contentSize.height - collectionView.bounds.height))), animated: false)
  }

  func playEntranceIfReady() {
    guard !hasPlayedEntrance, view.window != nil, !content.shown.isEmpty, hero.opener.photoID != nil else { return }
    hasPlayedEntrance = true
    hero.opener.playExposure()
    hero.opener.captionViews.forEach { ExhibitionMotion.rise($0, delay: 0.65) }
    ExhibitionMotion.rise(hero.header, delay: 0.82)
    riseBlocks(baseDelay: 0.98, step: 0.07)
    topBar.alpha = 0
    UIView.animate(withDuration: 0.6, delay: 0.9, options: [.allowUserInteraction]) { self.topBar.alpha = 1 }
    if isOwnSource, let bar = AppNavigator.shared.tabs?.focusBar, !(AppNavigator.shared.tabs?.isFocusBarHidden ?? true) {
      ExhibitionMotion.rise(bar, delay: 1.1)
    }
  }
}

@MainActor
enum ExhibitionMotion {
  static func rise(_ view: UIView, delay: TimeInterval) {
    guard !AFMotion.reduceMotion else {
      view.alpha = 0
      UIView.animate(withDuration: 0.2, delay: min(delay, 0.3), options: [.allowUserInteraction]) { view.alpha = 1 }
      return
    }
    view.alpha = 0
    view.transform = CGAffineTransform(translationX: 0, y: 22)
    AFMotion.spring(duration: 0.76, delay: delay, damping: 0.9, animations: {
      view.alpha = 1
      view.transform = .identity
    })
  }

}
