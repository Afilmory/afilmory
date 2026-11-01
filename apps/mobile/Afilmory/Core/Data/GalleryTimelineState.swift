import Foundation

enum TimelineEmptyKind: Equatable {
  case none
  case noSubscriptions
  case noRecentUpdates
}

func resolveTimelineEmptyKind(
  hasSubscriptions: Bool,
  eventCount: Int,
  isLoading: Bool,
  loadFailed: Bool
) -> TimelineEmptyKind {
  if eventCount > 0 || isLoading || loadFailed {
    return .none
  }
  if !hasSubscriptions {
    return .noSubscriptions
  }
  return .noRecentUpdates
}

func removingTimelineEvents(_ events: [GalleryTimelineEvent], tenantId: String) -> [GalleryTimelineEvent] {
  events.filter { $0.tenantId != tenantId }
}
