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
  struct Placement: Equatable {
    let height: CGFloat
    let lane: Int
  }

  var heroHeight: CGFloat = 0
  var placements: [Placement] = []
  var lanes: [ClosedRange<CGFloat>] = []
  var blockTop: CGFloat { heroHeight }
  var bottomPadding: CGFloat = 120

  private var cache: [UICollectionViewLayoutAttributes] = []
  private var contentHeight: CGFloat = 0

  override func prepare() {
    super.prepare()
    guard let collectionView else { return }
    let width = collectionView.bounds.width
    cache.removeAll(keepingCapacity: true)
    let lanes = self.lanes.isEmpty ? [0...width] : self.lanes
    let spanning = (lanes.first?.lowerBound ?? 0)...(lanes.last?.upperBound ?? width)
    let hero = UICollectionViewLayoutAttributes(forCellWith: IndexPath(item: 0, section: 0))
    hero.frame = CGRect(x: spanning.lowerBound, y: 0, width: spanning.upperBound - spanning.lowerBound, height: heroHeight)
    cache.append(hero)
    let spacing = ContactSheetLayout.blockSpacing
    var cursor = heroHeight
    var pair: (top: CGFloat, bottom: CGFloat, lane: Int)?
    func closePair() {
      guard let open = pair else { return }
      cursor = open.bottom + spacing
      pair = nil
    }
    let count = collectionView.numberOfSections > 1 ? collectionView.numberOfItems(inSection: 1) : 0
    for index in 0..<min(count, placements.count) {
      let placement = placements[index]
      let attributes = UICollectionViewLayoutAttributes(forCellWith: IndexPath(item: index, section: 1))
      if lanes.count < 2 || !lanes.indices.contains(placement.lane) {
        closePair()
        let range = lanes.count < 2 ? lanes[0] : spanning
        attributes.frame = CGRect(x: range.lowerBound, y: cursor, width: range.upperBound - range.lowerBound, height: placement.height)
        cursor = attributes.frame.maxY + spacing
      } else {
        if let open = pair, placement.lane <= open.lane { closePair() }
        let top = pair?.top ?? cursor
        let range = lanes[placement.lane]
        attributes.frame = CGRect(x: range.lowerBound, y: top, width: range.upperBound - range.lowerBound, height: placement.height)
        pair = (top, max(pair?.bottom ?? top, attributes.frame.maxY), placement.lane)
        if placement.lane == lanes.count - 1 { closePair() }
      }
      cache.append(attributes)
    }
    closePair()
    contentHeight = cursor + bottomPadding
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
