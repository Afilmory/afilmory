import MapKit
import UIKit

@MainActor
enum BackSwipeRule {
  static func isBackDrag(velocity: CGPoint) -> Bool {
    velocity.x > 0 && velocity.x > abs(velocity.y)
  }

  static func isBlocked(at point: CGPoint, in root: UIView) -> Bool {
    var view = root.hitTest(point, with: nil)
    while let current = view {
      if current is MKMapView { return true }
      if let scroll = current as? UIScrollView, scroll.contentSize.width > scroll.bounds.width,
         scroll.contentOffset.x > -scroll.adjustedContentInset.left + 1
      {
        return true
      }
      view = current.superview
    }
    return false
  }
}
