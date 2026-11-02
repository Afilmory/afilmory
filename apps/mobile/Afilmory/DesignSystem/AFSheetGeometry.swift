import UIKit

enum AFSheetDetent: Sendable {
  case fit
  case fitAndExpanded
}

enum AFSheetRest: Equatable, Sendable {
  case collapsed
  case expanded
}

enum AFSheetRelease: Equatable, Sendable {
  case rest(AFSheetRest)
  case dismiss
}

struct AFSheetGeometry: Equatable, Sendable {
  static let minimumHeight: CGFloat = 200
  static let collapsedFraction: CGFloat = 0.55
  static let flingVelocity: CGFloat = 900
  static let dismissFraction: CGFloat = 0.3

  let containerHeight: CGFloat
  let topInset: CGFloat
  let inset: CGFloat
  let fittingHeight: CGFloat
  let detent: AFSheetDetent

  var maximumHeight: CGFloat {
    max(Self.minimumHeight, containerHeight - topInset - inset * 2)
  }

  var canExpand: Bool {
    height(for: .expanded) > height(for: .collapsed)
  }

  func height(for rest: AFSheetRest) -> CGFloat {
    let fit = min(maximumHeight, max(Self.minimumHeight, fittingHeight))
    switch (detent, rest) {
    case (.fit, _):
      return fit
    case (.fitAndExpanded, .collapsed):
      return min(fit, containerHeight * Self.collapsedFraction)
    case (.fitAndExpanded, .expanded):
      return maximumHeight
    }
  }

  func release(from rest: AFSheetRest, translation: CGFloat, velocity: CGFloat) -> AFSheetRelease {
    let collapsed = height(for: .collapsed)
    let travel = height(for: .expanded) - collapsed
    switch rest {
    case .expanded where canExpand:
      if translation > travel + collapsed * Self.dismissFraction { return .dismiss }
      if translation > travel * 0.5 || velocity > Self.flingVelocity { return .rest(.collapsed) }
      return .rest(.expanded)
    case .collapsed, .expanded:
      if canExpand, -translation > travel * Self.dismissFraction || velocity < -Self.flingVelocity {
        return .rest(.expanded)
      }
      if translation > collapsed * Self.dismissFraction || velocity > Self.flingVelocity { return .dismiss }
      return .rest(.collapsed)
    }
  }
}

@MainActor
enum AFSheetHandoff {
  static func scrollView(at point: CGPoint, in root: UIView) -> UIScrollView? {
    var view = root.hitTest(point, with: nil)
    while let current = view, current !== root {
      if let scroll = current as? UIScrollView, scroll.isScrollEnabled, scroll.contentSize.height > scroll.bounds.height - scroll.adjustedContentInset.top - scroll.adjustedContentInset.bottom {
        return scroll
      }
      view = current.superview
    }
    return nil
  }

  nonisolated static func sheetTakesOver(scrollAtTop: Bool, movingDown: Bool) -> Bool {
    scrollAtTop && movingDown
  }
}
