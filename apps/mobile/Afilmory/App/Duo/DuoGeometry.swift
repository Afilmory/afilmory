import UIKit

enum DuoGeometry {
  static func pages(in rect: CGRect, fold: CGRect) -> (left: CGRect, right: CGRect) {
    let leftEdge = min(max(fold.minX, rect.minX), rect.maxX)
    let rightEdge = min(max(fold.maxX, rect.minX), rect.maxX)
    let left = CGRect(x: rect.minX, y: rect.minY, width: leftEdge - rect.minX, height: rect.height)
    let right = CGRect(x: rightEdge, y: rect.minY, width: rect.maxX - rightEdge, height: rect.height)
    return (left, right)
  }

  static func flatColumns(in rect: CGRect, secondaryFraction: CGFloat, spacing: CGFloat) -> (main: CGRect, secondary: CGRect) {
    let usable = max(0, rect.width - spacing)
    let secondaryWidth = (usable * secondaryFraction).rounded()
    let mainWidth = usable - secondaryWidth
    let main = CGRect(x: rect.minX, y: rect.minY, width: mainWidth, height: rect.height)
    let secondary = CGRect(x: rect.maxX - secondaryWidth, y: rect.minY, width: secondaryWidth, height: rect.height)
    return (main, secondary)
  }

  static func fold(of context: DuoContext, in view: UIView) -> CGRect? {
    guard case .book(let fold) = context.posture else { return nil }
    guard view.window != nil else { return fold }
    var origin: CGFloat = 0
    var current: UIView = view
    while let parent = current.superview {
      origin += current.center.x - current.bounds.width / 2 - parent.bounds.minX
      current = parent
    }
    return CGRect(x: fold.minX - origin + view.bounds.minX, y: fold.minY, width: fold.width, height: fold.height)
  }

  static func lanes(in rect: CGRect, context: DuoContext, view: UIView) -> [CGRect] {
    guard let fold = fold(of: context, in: view), fold.minX > rect.minX, fold.maxX < rect.maxX else { return [rect] }
    let pages = pages(in: rect, fold: fold)
    return [pages.left, pages.right]
  }
}
