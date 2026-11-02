import CoreGraphics

enum DetailGeometry {
  static let chipsGap: CGFloat = 12
  static let expandedMaxHeight: CGFloat = 736

  static func collapsedSheet(bounds: CGRect, height: CGFloat) -> CGRect {
    CGRect(x: bounds.minX + 8, y: bounds.height - 8 - height, width: bounds.width - 16, height: height)
  }

  static func expandedSheet(bounds: CGRect, safeTop: CGFloat) -> CGRect {
    let chromeBottom = max(safeTop, 20) + 4 + 44
    let height = min(expandedMaxHeight, bounds.height - chromeBottom - chipsGap - 44 - chipsGap)
    return CGRect(x: bounds.minX, y: bounds.height - height, width: bounds.width, height: height)
  }

  static func sheet(bounds: CGRect, safeTop: CGFloat, collapsedHeight: CGFloat, progress: CGFloat) -> CGRect {
    let from = collapsedSheet(bounds: bounds, height: collapsedHeight)
    let to = expandedSheet(bounds: bounds, safeTop: safeTop)
    let t = min(1, max(0, progress))
    return CGRect(
      x: from.minX + (to.minX - from.minX) * t,
      y: from.minY + (to.minY - from.minY) * t,
      width: from.width + (to.width - from.width) * t,
      height: from.height + (to.height - from.height) * t
    )
  }

  static func progress(sheetTop: CGFloat, bounds: CGRect, safeTop: CGFloat, collapsedHeight: CGFloat) -> CGFloat {
    let from = collapsedSheet(bounds: bounds, height: collapsedHeight).minY
    let to = expandedSheet(bounds: bounds, safeTop: safeTop).minY
    guard from != to else { return 0 }
    return min(1, max(0, (from - sheetTop) / (from - to)))
  }

  static func chips(sheet: CGRect) -> CGRect {
    CGRect(x: sheet.minX + 6, y: sheet.minY - chipsGap - 44, width: sheet.width - 12, height: 44)
  }

  static func photoArea(bounds: CGRect, safeTop: CGFloat, collapsedSheet: CGRect) -> CGRect {
    let top = max(safeTop, 20)
    return CGRect(x: bounds.minX, y: top, width: bounds.width, height: max(120, collapsedSheet.minY - chipsGap - top))
  }
}
