import Foundation

enum ExploreSegment: Int, CaseIterable {
  case timeline
  case following
  case explore
}

func resolveExploreSegment(
  pageOffsetX: CGFloat,
  pageWidth: CGFloat,
  fallback: ExploreSegment
) -> ExploreSegment {
  guard pageWidth > 0, pageOffsetX.isFinite else { return fallback }
  let lastIndex = ExploreSegment.allCases.count - 1
  let pageIndex = min(max(Int((pageOffsetX / pageWidth).rounded()), 0), lastIndex)
  return ExploreSegment(rawValue: pageIndex) ?? fallback
}

func resolveExploreDefaultSegment(isSignedIn: Bool, cachedHasSubscriptions: Bool?) -> ExploreSegment {
  if !isSignedIn {
    return .explore
  }
  if cachedHasSubscriptions == true {
    return .timeline
  }
  return .explore
}

func resolveExploreSegmentAfterFetch(
  current: ExploreSegment,
  userHasChosen: Bool,
  hasSubscriptions: Bool
) -> ExploreSegment {
  if userHasChosen {
    return current
  }
  return hasSubscriptions ? .timeline : .explore
}
