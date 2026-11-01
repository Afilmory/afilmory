import CoreGraphics

struct MosaicLayout: Equatable, Sendable {
  static let maximumTiles = 6
  static let singleCap: CGFloat = 400
  static let rowCap: CGFloat = 300
  static let multiRowCap: CGFloat = 260

  let tiles: [CGRect]
  let overflow: Int
  let size: CGSize

  init(aspectRatios: [CGFloat], width: CGFloat, gap: CGFloat = 3) {
    let shown = Array(aspectRatios.prefix(Self.maximumTiles)).map(Self.sanitized)
    overflow = max(0, aspectRatios.count - shown.count)
    guard !shown.isEmpty, width > 0 else {
      tiles = []
      size = .zero
      return
    }
    let split = Self.rowSplit(count: shown.count)
    var frames: [CGRect] = []
    var y: CGFloat = 0
    var widest: CGFloat = 0
    var start = 0
    for count in split {
      let ratios = Array(shown[start..<(start + count)])
      start += count
      let cap = split.count == 1 ? (count == 1 ? Self.singleCap : Self.rowCap) : Self.multiRowCap
      let available = width - gap * CGFloat(count - 1)
      let fitted = available / ratios.reduce(0, +)
      let height = min(fitted, cap)
      let fills = fitted <= cap
      let rowHeight = fills ? height : height.rounded()
      var x: CGFloat = 0
      for (index, ratio) in ratios.enumerated() {
        let isLast = index == ratios.count - 1
        let tileWidth = isLast && fills ? width - x : (rowHeight * ratio).rounded()
        frames.append(CGRect(x: x, y: y, width: tileWidth, height: rowHeight))
        x += tileWidth + gap
      }
      widest = max(widest, x - gap)
      y += rowHeight + gap
    }
    tiles = frames
    size = CGSize(width: widest, height: y - gap)
  }

  static func rowSplit(count: Int) -> [Int] {
    switch min(count, maximumTiles) {
    case ...0: []
    case 1...3: [count]
    case 4: [2, 2]
    case 5: [2, 3]
    default: [3, 3]
    }
  }

  private static func sanitized(_ ratio: CGFloat) -> CGFloat {
    guard ratio.isFinite, ratio > 0 else { return 1 }
    return min(max(ratio, 0.2), 5)
  }
}
