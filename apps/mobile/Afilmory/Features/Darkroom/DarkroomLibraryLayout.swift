import UIKit

extension DarkroomLibraryCell {
  static func spreadColumns(laneWidth: CGFloat) -> Int {
    max(3, Int((laneWidth + 3) / 103))
  }

  static func laneCorners(index: Int, count: Int, columns: [Int]) -> CACornerMask {
    guard columns.count > 1 else { return corners(index: index, count: count, columns: columns.first ?? 3) }
    let spread = columns.reduce(0, +)
    let row = index / spread
    var position = index % spread
    var lane = 0
    while position >= columns[lane] {
      position -= columns[lane]
      lane += 1
    }
    let fullRows = count / spread
    let remainder = count % spread
    let before = columns[..<lane].reduce(0, +)
    let laneCount = fullRows * columns[lane] + min(columns[lane], max(0, remainder - before))
    return corners(index: row * columns[lane] + position, count: laneCount, columns: columns[lane])
  }

  static func layout(lanes: [ClosedRange<CGFloat>]) -> UICollectionViewLayout {
    guard lanes.count > 1 else { return layout() }
    let spacing: CGFloat = 3
    return UICollectionViewCompositionalLayout { _, environment in
      let width = environment.container.effectiveContentSize.width
      let columns = lanes.map { spreadColumns(laneWidth: $0.upperBound - $0.lowerBound) }
      let sides = zip(lanes, columns).map { lane, count -> (width: CGFloat, side: CGFloat) in
        let laneWidth = lane.upperBound - lane.lowerBound
        return (laneWidth, ((laneWidth - spacing * CGFloat(count - 1)) / CGFloat(count)).rounded(.down))
      }
      let subgroups = zip(sides, columns).map { size, count in
        let item = NSCollectionLayoutItem(layoutSize: NSCollectionLayoutSize(widthDimension: .absolute(size.side), heightDimension: .absolute(size.side)))
        let group = NSCollectionLayoutGroup.horizontal(
          layoutSize: NSCollectionLayoutSize(widthDimension: .absolute(size.width), heightDimension: .absolute(size.side)),
          repeatingSubitem: item,
          count: count
        )
        group.interItemSpacing = .flexible(spacing)
        return group
      }
      let gaps = zip(lanes, lanes.dropFirst()).map { $1.lowerBound - $0.upperBound }
      let spread = NSCollectionLayoutGroup.horizontal(
        layoutSize: NSCollectionLayoutSize(
          widthDimension: .absolute((lanes.last?.upperBound ?? width) - (lanes.first?.lowerBound ?? 0)),
          heightDimension: .absolute(sides.map(\.side).max() ?? 0)
        ),
        subitems: subgroups
      )
      spread.interItemSpacing = .fixed(gaps.first ?? spacing)
      let section = NSCollectionLayoutSection(group: spread)
      section.interGroupSpacing = spacing
      section.contentInsets = NSDirectionalEdgeInsets(
        top: 6, leading: lanes.first?.lowerBound ?? 16, bottom: 24, trailing: max(0, width - (lanes.last?.upperBound ?? width))
      )
      let header = NSCollectionLayoutBoundarySupplementaryItem(
        layoutSize: NSCollectionLayoutSize(widthDimension: .fractionalWidth(1), heightDimension: .estimated(44)),
        elementKind: UICollectionView.elementKindSectionHeader,
        alignment: .top
      )
      section.boundarySupplementaryItems = [header]
      return section
    }
  }
}
