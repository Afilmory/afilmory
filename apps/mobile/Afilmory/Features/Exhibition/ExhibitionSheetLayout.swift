import UIKit

final class ExhibitionHostCell: UICollectionViewCell {
  static let reuseID = "host"

  func host(_ view: UIView) {
    guard view.superview !== contentView else { return }
    contentView.subviews.forEach { $0.removeFromSuperview() }
    view.frame = contentView.bounds
    view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    contentView.addSubview(view)
  }
}

final class ExhibitionSheetLayout: UICollectionViewLayout {
  var heroHeight: CGFloat = 0
  var blockHeights: [CGFloat] = []
  var blockTop: CGFloat { heroHeight }
  var bottomPadding: CGFloat = 120

  private var cache: [UICollectionViewLayoutAttributes] = []
  private var contentHeight: CGFloat = 0

  override func prepare() {
    super.prepare()
    guard let collectionView else { return }
    let width = collectionView.bounds.width
    cache.removeAll(keepingCapacity: true)
    let hero = UICollectionViewLayoutAttributes(forCellWith: IndexPath(item: 0, section: 0))
    hero.frame = CGRect(x: 0, y: 0, width: width, height: heroHeight)
    cache.append(hero)
    var y = heroHeight
    let count = collectionView.numberOfSections > 1 ? collectionView.numberOfItems(inSection: 1) : 0
    for index in 0..<min(count, blockHeights.count) {
      let attributes = UICollectionViewLayoutAttributes(forCellWith: IndexPath(item: index, section: 1))
      attributes.frame = CGRect(x: 0, y: y, width: width, height: blockHeights[index])
      cache.append(attributes)
      y += blockHeights[index] + ContactSheetLayout.blockSpacing
    }
    contentHeight = y + bottomPadding
  }

  override var collectionViewContentSize: CGSize {
    CGSize(width: collectionView?.bounds.width ?? 0, height: contentHeight)
  }

  override func layoutAttributesForElements(in rect: CGRect) -> [UICollectionViewLayoutAttributes]? {
    cache.filter { $0.frame.intersects(rect) }
  }

  override func layoutAttributesForItem(at indexPath: IndexPath) -> UICollectionViewLayoutAttributes? {
    cache.first { $0.indexPath == indexPath }
  }

  override func shouldInvalidateLayout(forBoundsChange newBounds: CGRect) -> Bool {
    newBounds.width != collectionView?.bounds.width
  }

  func frameOfBlock(_ index: Int) -> CGRect? {
    cache.first { $0.indexPath == IndexPath(item: index, section: 1) }?.frame
  }
}
