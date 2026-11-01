import CoreGraphics

enum DetailSheetDetent: Equatable, Sendable {
  case collapsed
  case expanded
}

struct DetailGestureRules: Equatable, Sendable {
  var detent: DetailSheetDetent
  var isZoomed: Bool

  var pagingEnabled: Bool { detent == .collapsed && !isZoomed }

  static func photoPanSheetProgress(translationY: CGFloat) -> CGFloat {
    min(1, max(0, -translationY / 260))
  }
  var zoomEnabled: Bool { detent == .collapsed }
  var dismissEnabled: Bool { detent == .collapsed && !isZoomed }
  var chromeVisible: Bool { !isZoomed }

  static func isZoomed(scale: CGFloat) -> Bool {
    scale > 1.01
  }

  static func shouldDismiss(translation: CGFloat, velocity: CGFloat, height: CGFloat) -> Bool {
    guard translation > 0 else { return false }
    return translation > min(120, height * 0.15) || (velocity > 700 && translation > 12)
  }

  static func detent(afterDragFrom detent: DetailSheetDetent, translation: CGFloat, velocity: CGFloat) -> DetailSheetDetent {
    switch detent {
    case .collapsed:
      translation < -80 || velocity < -500 ? .expanded : .collapsed
    case .expanded:
      translation > 120 || velocity > 500 ? .collapsed : .expanded
    }
  }
}
