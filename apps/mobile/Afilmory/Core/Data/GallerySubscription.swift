import Foundation

struct GalleryPhotoPreview: Decodable, Hashable, Sendable {
  let aspectRatio: Double
  let height: Double
  let id: String
  let isLivePhoto: Bool
  let syncedAt: String
  let thumbHash: String?
  let thumbnailUrl: String
  let width: Double
}

struct GallerySubscriptionItem: Decodable, Hashable, Sendable {
  struct Gallery: Decodable, Hashable, Sendable {
    let author: FeaturedGalleryAuthor?
    let domain: String?
    let id: String
    let lastUpload: String
    let name: String
    let photoCount: Int
    let slug: String
  }

  let createdAt: String
  let gallery: Gallery
  let recentPhotos: [GalleryPhotoPreview]
  let tenantId: String
}

struct GallerySubscriptionListResponse: Decodable, Sendable {
  let subscriptions: [GallerySubscriptionItem]
}

struct GalleryTimelineEvent: Decodable, Hashable, Sendable {
  struct Gallery: Decodable, Hashable, Sendable {
    let author: FeaturedGalleryAuthor?
    let id: String
    let name: String
    let slug: String
  }

  let day: String
  let gallery: Gallery
  let id: String
  let latestAt: String
  let photos: [GalleryPhotoPreview]
  let tenantId: String
  let totalCount: Int
}

struct GalleryTimelineResponse: Decodable, Sendable {
  let events: [GalleryTimelineEvent]
  let nextCursor: String?
}

struct GallerySubscriptionMutationResponse: Decodable, Sendable {
  let subscribed: Bool
  let tenantId: String
}

enum GallerySubscriptionAPI {
  static func list() -> APIEndpoint {
    APIEndpoint(
      baseURL: .platform,
      path: "gallery-subscriptions",
      retryPolicy: .transientGET(maxAttempts: 2, delay: 0.25)
    )
  }

  static func timeline(timeZone: String, cursor: String?, limit: Int = 20) -> APIEndpoint {
    APIEndpoint(
      baseURL: .platform,
      path: "gallery-subscriptions/timeline",
      queryItems: [
        URLQueryItem(name: "timeZone", value: timeZone),
        URLQueryItem(name: "limit", value: String(limit)),
        cursor.map { URLQueryItem(name: "cursor", value: $0) },
      ].compactMap { $0 },
      retryPolicy: .transientGET(maxAttempts: 2, delay: 0.25)
    )
  }

  static func subscribe(tenantId: String) -> APIEndpoint {
    APIEndpoint(
      baseURL: .platform,
      path: "gallery-subscriptions/\(tenantId)",
      method: .put
    )
  }

  static func unsubscribe(tenantId: String) -> APIEndpoint {
    APIEndpoint(
      baseURL: .platform,
      path: "gallery-subscriptions/\(tenantId)",
      method: .delete
    )
  }
}

enum GallerySubscriptionButtonState: Equatable {
  case hidden
  case subscribe
  case subscribed
  case updating(isSubscribed: Bool)
}

func resolveGallerySubscriptionButtonState(
  isOwnGallery: Bool,
  isSubscribed: Bool,
  pendingTarget: Bool?
) -> GallerySubscriptionButtonState {
  if isOwnGallery {
    return .hidden
  }
  if let pendingTarget {
    return .updating(isSubscribed: pendingTarget)
  }
  return isSubscribed ? .subscribed : .subscribe
}
