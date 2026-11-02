import UIKit

final class ViewingColumnsLayout: UICollectionViewFlowLayout {
  var columns: [ClosedRange<CGFloat>] = [] {
    didSet { if columns != oldValue { invalidateLayout() } }
  }

  private var items: [IndexPath: UICollectionViewLayoutAttributes] = [:]
  private var supplementary: [String: [IndexPath: UICollectionViewLayoutAttributes]] = [:]
  private var contentHeight: CGFloat = 0
  private var assigned: [IndexPath: Int] = [:]
  private static let headerIndent: CGFloat = 16

  private var usesColumns: Bool { columns.count > 1 }

  static func columns(
    for context: DuoContext,
    in rect: CGRect,
    fold: CGRect?,
    inset: CGFloat,
    spacing: CGFloat
  ) -> [ClosedRange<CGFloat>] {
    switch context.posture {
    case .single:
      return []
    case .book:
      guard let fold, fold.minX > rect.minX, fold.maxX < rect.maxX else { return [] }
      let pages = DuoGeometry.pages(in: rect, fold: fold)
      return [pages.left, pages.right].map { ($0.minX + inset)...($0.maxX - inset) }
    case .flat:
      let usable = rect.insetBy(dx: inset, dy: 0)
      let width = (usable.width - spacing * 2) / 3
      return (0..<3).map { index in
        let minX = usable.minX + CGFloat(index) * (width + spacing)
        return minX...(minX + width)
      }
    }
  }

  func itemWidth(at indexPath: IndexPath) -> CGFloat? {
    guard usesColumns else { return nil }
    let column = columns[assigned[indexPath] ?? indexPath.item % columns.count]
    return column.upperBound - column.lowerBound
  }

  override func prepare() {
    guard usesColumns, let collectionView else {
      items = [:]
      supplementary = [:]
      assigned = [:]
      super.prepare()
      return
    }
    super.prepare()
    items = [:]
    supplementary = [:]
    assigned = [:]
    let delegate = collectionView.delegate as? UICollectionViewDelegateFlowLayout
    var bottoms = Array(repeating: CGFloat(0), count: columns.count)
    func place(_ indexPath: IndexPath, column: Int, y: CGFloat) -> CGRect {
      assigned[indexPath] = column
      let range = columns[column]
      let size = delegate?.collectionView?(collectionView, layout: self, sizeForItemAt: indexPath) ?? itemSize
      let attributes = UICollectionViewLayoutAttributes(forCellWith: indexPath)
      attributes.frame = CGRect(x: range.lowerBound, y: y, width: range.upperBound - range.lowerBound, height: size.height)
      items[indexPath] = attributes
      return attributes.frame
    }
    for section in 0..<collectionView.numberOfSections {
      let count = collectionView.numberOfItems(inSection: section)
      let headerHeight = delegate?.collectionView?(collectionView, layout: self, referenceSizeForHeaderInSection: section).height ?? 0
      if count > 0, count < columns.count {
        let column = bottoms.indices.min { bottoms[$0] < bottoms[$1] } ?? 0
        let range = columns[column]
        var y = bottoms[column]
        if headerHeight > 0 {
          let x = range.lowerBound - Self.headerIndent
          add(UICollectionView.elementKindSectionHeader, section: section, frame: CGRect(x: x, y: y, width: range.upperBound - x, height: headerHeight))
          y += headerHeight
        }
        for item in 0..<count {
          y = place(IndexPath(item: item, section: section), column: column, y: y).maxY + (item < count - 1 ? minimumLineSpacing : 0)
        }
        bottoms[column] = y
      } else {
        var y = bottoms.max() ?? 0
        if headerHeight > 0 {
          add(UICollectionView.elementKindSectionHeader, section: section, frame: CGRect(x: 0, y: y, width: collectionView.bounds.width, height: headerHeight))
          y += headerHeight
        }
        var tops = Array(repeating: y, count: columns.count)
        for item in 0..<count {
          let column = item % columns.count
          tops[column] = place(IndexPath(item: item, section: section), column: column, y: tops[column]).maxY + minimumLineSpacing
        }
        y = max(y, (tops.max() ?? y) - (count > 0 ? minimumLineSpacing : 0))
        bottoms = Array(repeating: y, count: columns.count)
      }
      let footerHeight = delegate?.collectionView?(collectionView, layout: self, referenceSizeForFooterInSection: section).height ?? 0
      if footerHeight > 0 {
        let y = bottoms.max() ?? 0
        add(UICollectionView.elementKindSectionFooter, section: section, frame: CGRect(x: 0, y: y, width: collectionView.bounds.width, height: footerHeight))
        bottoms = Array(repeating: y + footerHeight, count: columns.count)
      }
    }
    contentHeight = bottoms.max() ?? 0
  }

  private func add(_ kind: String, section: Int, frame: CGRect) {
    let attributes = UICollectionViewLayoutAttributes(forSupplementaryViewOfKind: kind, with: IndexPath(item: 0, section: section))
    attributes.frame = frame
    supplementary[kind, default: [:]][attributes.indexPath] = attributes
  }

  override var collectionViewContentSize: CGSize {
    guard usesColumns, let collectionView else { return super.collectionViewContentSize }
    return CGSize(width: collectionView.bounds.width, height: contentHeight)
  }

  override func layoutAttributesForElements(in rect: CGRect) -> [UICollectionViewLayoutAttributes]? {
    guard usesColumns else { return super.layoutAttributesForElements(in: rect) }
    let all = Array(items.values) + supplementary.values.flatMap(\.values)
    return all.filter { $0.frame.intersects(rect) }
  }

  override func layoutAttributesForItem(at indexPath: IndexPath) -> UICollectionViewLayoutAttributes? {
    guard usesColumns else { return super.layoutAttributesForItem(at: indexPath) }
    return items[indexPath]
  }

  override func layoutAttributesForSupplementaryView(ofKind kind: String, at indexPath: IndexPath) -> UICollectionViewLayoutAttributes? {
    guard usesColumns else { return super.layoutAttributesForSupplementaryView(ofKind: kind, at: indexPath) }
    return supplementary[kind]?[indexPath]
  }

  override func shouldInvalidateLayout(forBoundsChange newBounds: CGRect) -> Bool {
    guard usesColumns, let collectionView else { return super.shouldInvalidateLayout(forBoundsChange: newBounds) }
    return newBounds.width != collectionView.bounds.width
  }
}
