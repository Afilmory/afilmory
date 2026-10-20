import UIKit

private func lerp(_ a: CGRect, _ b: CGRect, _ t: CGFloat) -> CGRect {
  CGRect(
    x: a.origin.x + (b.origin.x - a.origin.x) * t,
    y: a.origin.y + (b.origin.y - a.origin.y) * t,
    width: a.width + (b.width - a.width) * t,
    height: a.height + (b.height - a.height) * t
  )
}

final class MasonryLayout: UICollectionViewLayout {
  var gap: CGFloat = 2 {
    didSet { frameCache.removeAll() }
  }

  var aspectRatios: [CGFloat] = [] {
    didSet { frameCache.removeAll() }
  }

  // Continuous column position: 2.0 is a settled 2-column grid, 2.4 is 40% of the way
  // toward 3 columns. Pinch interpolates between the two adjacent integer layouts.
  var zoomPosition: CGFloat = 2

  private var frameCache: [Int: (frames: [CGRect], height: CGFloat)] = [:]
  private var cachedWidth: CGFloat = 0
  private var attributesCache: [UICollectionViewLayoutAttributes] = []
  private var contentHeight: CGFloat = 0

  var columnCount: Int {
    Int(zoomPosition.rounded())
  }

  var itemWidth: CGFloat {
    columnWidth(for: columnCount, width: availableWidth)
  }

  var availableWidth: CGFloat {
    guard let collectionView else { return 0 }
    let insets = collectionView.adjustedContentInset
    return max(0, collectionView.bounds.width - insets.left - insets.right)
  }

  private func columnWidth(for columns: Int, width: CGFloat) -> CGFloat {
    (width - gap * CGFloat(columns - 1)) / CGFloat(columns)
  }

  private func frames(for columns: Int, width: CGFloat) -> (frames: [CGRect], height: CGFloat) {
    if width != cachedWidth {
      frameCache.removeAll()
      cachedWidth = width
    }
    if let cached = frameCache[columns] {
      return cached
    }
    let cellWidth = columnWidth(for: columns, width: width)
    var columnHeights = [CGFloat](repeating: 0, count: columns)
    var frames = [CGRect]()
    frames.reserveCapacity(aspectRatios.count)
    for ratio in aspectRatios {
      var shortest = 0
      for column in 1..<columns where columnHeights[column] < columnHeights[shortest] {
        shortest = column
      }
      let x = (cellWidth + gap) * CGFloat(shortest)
      let y = columnHeights[shortest] == 0 ? 0 : columnHeights[shortest] + gap
      let height = max(1, cellWidth / max(ratio, 0.01))
      frames.append(CGRect(x: x, y: y, width: cellWidth, height: height))
      columnHeights[shortest] = y + height
    }
    let result = (frames, columnHeights.max() ?? 0)
    frameCache[columns] = result
    return result
  }

  func interpolatedFrame(at index: Int) -> CGRect {
    guard aspectRatios.indices.contains(index) else { return .zero }
    let width = availableWidth
    guard width > 0 else { return .zero }
    let lower = Int(zoomPosition.rounded(.down))
    let upper = Int(zoomPosition.rounded(.up))
    let lowerFrames = frames(for: lower, width: width)
    guard upper != lower else { return lowerFrames.frames[index] }
    let upperFrames = frames(for: upper, width: width)
    return lerp(lowerFrames.frames[index], upperFrames.frames[index], zoomPosition - CGFloat(lower))
  }

  func interpolatedContentHeight() -> CGFloat {
    let width = availableWidth
    guard width > 0, !aspectRatios.isEmpty else { return 0 }
    let lower = Int(zoomPosition.rounded(.down))
    let upper = Int(zoomPosition.rounded(.up))
    let lowerHeight = frames(for: lower, width: width).height
    guard upper != lower else { return lowerHeight }
    let upperHeight = frames(for: upper, width: width).height
    return lowerHeight + (upperHeight - lowerHeight) * (zoomPosition - CGFloat(lower))
  }

  override func prepare() {
    super.prepare()
    attributesCache.removeAll(keepingCapacity: true)
    contentHeight = 0
    let width = availableWidth
    guard width > 0, !aspectRatios.isEmpty else { return }

    let lower = Int(zoomPosition.rounded(.down))
    let upper = Int(zoomPosition.rounded(.up))
    let lowerResult = frames(for: lower, width: width)
    let t = zoomPosition - CGFloat(lower)
    let upperResult = upper == lower ? lowerResult : frames(for: upper, width: width)

    attributesCache.reserveCapacity(aspectRatios.count)
    for index in aspectRatios.indices {
      let attributes = UICollectionViewLayoutAttributes(forCellWith: IndexPath(item: index, section: 0))
      attributes.frame = t == 0
        ? lowerResult.frames[index]
        : lerp(lowerResult.frames[index], upperResult.frames[index], t)
      attributesCache.append(attributes)
    }
    contentHeight = lowerResult.height + (upperResult.height - lowerResult.height) * t
  }

  override var collectionViewContentSize: CGSize {
    CGSize(width: availableWidth, height: contentHeight)
  }

  override func layoutAttributesForElements(in rect: CGRect) -> [UICollectionViewLayoutAttributes]? {
    attributesCache.filter { $0.frame.intersects(rect) }
  }

  override func layoutAttributesForItem(at indexPath: IndexPath) -> UICollectionViewLayoutAttributes? {
    guard attributesCache.indices.contains(indexPath.item) else { return nil }
    return attributesCache[indexPath.item]
  }

  override func shouldInvalidateLayout(forBoundsChange newBounds: CGRect) -> Bool {
    guard let collectionView else { return false }
    return newBounds.width != collectionView.bounds.width
  }
}
