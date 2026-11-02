import UIKit

extension PhotoDetailViewController: UICollectionViewDataSource, UICollectionViewDelegateFlowLayout {
  func configurePager() {
    pager.backgroundColor = .clear
    pager.isPagingEnabled = true
    pager.showsHorizontalScrollIndicator = false
    pager.contentInsetAdjustmentBehavior = .never
    pager.dataSource = self
    pager.delegate = self
    pager.register(DetailPageCell.self, forCellWithReuseIdentifier: DetailPageCell.reuseID)
  }

  func collectionView(_: UICollectionView, numberOfItemsInSection _: Int) -> Int {
    photos.count
  }

  func collectionView(_ collectionView: UICollectionView, cellForItemAt indexPath: IndexPath) -> UICollectionViewCell {
    let cell = collectionView.dequeueReusableCell(withReuseIdentifier: DetailPageCell.reuseID, for: indexPath) as! DetailPageCell
    let photo = photos[indexPath.item]
    cell.photoArea = photoArea
    cell.progressFloor = progressFloor
    let placeholder = indexPath.item == currentIndex ? initialPlaceholder : nil
    cell.configure(photo: photo, number: number(of: photo), placeholder: placeholder)
    cell.scrollView.pinchGestureRecognizer?.isEnabled = rules.zoomEnabled
    cell.onZoomChange = { [weak self] zoomed in self?.zoomChanged(zoomed) }
    cell.onSingleTap = { [weak self] in self?.photoTapped() }
    return cell
  }

  func collectionView(_ collectionView: UICollectionView, layout _: UICollectionViewLayout, sizeForItemAt _: IndexPath) -> CGSize {
    collectionView.bounds.size
  }

  func scrollViewDidEndDecelerating(_ scrollView: UIScrollView) {
    guard scrollView === pager, pager.bounds.width > 0 else { return }
    let index = Int((pager.contentOffset.x / pager.bounds.width).rounded())
    guard index != currentIndex, photos.indices.contains(index) else { return }
    if let previous = pager.cellForItem(at: IndexPath(item: currentIndex, section: 0)) as? DetailPageCell {
      previous.resetZoom(animated: false)
    }
    initialPlaceholder = nil
    showPage(index, animated: true)
    UIAccessibility.post(notification: .pageScrolled, argument: String(localized: "No. \(ExhibitFormat.frameNumber(number(of: photos[index])))"))
  }

  func zoomChanged(_ zoomed: Bool) {
    guard zoomed != rules.isZoomed else { return }
    rules.isZoomed = zoomed
    applyRules()
  }

  func photoTapped() {
    if isRailShown {
      hideRail()
    } else if rules.detent == .expanded {
      setDetent(.collapsed, animated: true)
    }
  }
}
