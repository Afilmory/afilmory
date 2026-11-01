import CoreGraphics

enum ViewingPage: Int, CaseIterable, Sendable {
  case rolls
  case galleries

  var title: String {
    switch self {
    case .rolls: String(localized: "New Rolls")
    case .galleries: String(localized: "Galleries")
    }
  }

  static func initial(isVisitor: Bool, isSignedIn: Bool, cachedHasSubscriptions: Bool?) -> ViewingPage {
    guard !isVisitor else { return .galleries }
    return page(for: resolveExploreDefaultSegment(isSignedIn: isSignedIn, cachedHasSubscriptions: cachedHasSubscriptions))
  }

  static func afterFetch(current: ViewingPage, userHasChosen: Bool, hasSubscriptions: Bool) -> ViewingPage {
    let segment = resolveExploreSegmentAfterFetch(
      current: current == .rolls ? .timeline : .explore,
      userHasChosen: userHasChosen,
      hasSubscriptions: hasSubscriptions
    )
    return page(for: segment)
  }

  private static func page(for segment: ExploreSegment) -> ViewingPage {
    segment == .timeline ? .rolls : .galleries
  }
}

enum ViewingSegmentProgress {
  static let maximumBlur: CGFloat = 8
  static let minimumAlpha: CGFloat = 0.4
  private static let settleTolerance: CGFloat = 0.001

  static func distance(progress: CGFloat, index: Int) -> CGFloat {
    min(1, abs(progress - CGFloat(index)))
  }

  static func underlineScale(progress: CGFloat, index: Int) -> CGFloat {
    max(0, 1 - abs(progress - CGFloat(index)))
  }

  static func pageBlur(progress: CGFloat, index: Int, reduceMotion: Bool) -> CGFloat {
    reduceMotion ? 0 : distance(progress: progress, index: index) * maximumBlur
  }

  static func pageAlpha(progress: CGFloat, index: Int) -> CGFloat {
    1 - distance(progress: progress, index: index) * (1 - minimumAlpha)
  }

  static func progress(pageIndex: Int, pageOriginX: CGFloat, pageWidth: CGFloat, pageCount: Int) -> CGFloat? {
    guard pageWidth > 0, pageOriginX.isFinite, pageCount > 0 else { return nil }
    let raw = CGFloat(pageIndex) - pageOriginX / pageWidth
    return min(max(raw, 0), CGFloat(pageCount - 1))
  }

  static func settledIndex(progress: CGFloat) -> Int? {
    let nearest = progress.rounded()
    return abs(progress - nearest) <= settleTolerance ? Int(nearest) : nil
  }

  static func selectedIndex(progress: CGFloat) -> Int {
    Int(progress.rounded())
  }
}
