import Foundation

struct GalleryHeaderModel: Equatable, Sendable {
  let tenantId: String
  let name: String
  let slug: String
  let authorName: String?
  let authorAvatar: String?
  let photoCount: Int?
  let lastUpload: String?
  let domain: String?
}

extension GalleryHeaderModel {
  init(featured: FeaturedGallery) {
    self.init(
      tenantId: featured.id,
      name: featured.name,
      slug: featured.slug,
      authorName: featured.author?.name.trimmingToNil,
      authorAvatar: featured.author?.avatar?.trimmingToNil,
      photoCount: featured.photoCount,
      lastUpload: featured.lastUpload?.trimmingToNil,
      domain: featured.domain?.trimmingToNil
    )
  }

  init(subscription: GallerySubscriptionItem) {
    let gallery = subscription.gallery
    self.init(
      tenantId: subscription.tenantId,
      name: gallery.name,
      slug: gallery.slug,
      authorName: gallery.author?.name.trimmingToNil,
      authorAvatar: gallery.author?.avatar?.trimmingToNil,
      photoCount: gallery.photoCount,
      lastUpload: gallery.lastUpload.trimmingToNil,
      domain: gallery.domain?.trimmingToNil
    )
  }

  init(timelineEvent: GalleryTimelineEvent) {
    let gallery = timelineEvent.gallery
    self.init(
      tenantId: timelineEvent.tenantId,
      name: gallery.name,
      slug: gallery.slug,
      authorName: gallery.author?.name.trimmingToNil,
      authorAvatar: gallery.author?.avatar?.trimmingToNil,
      photoCount: nil,
      lastUpload: timelineEvent.latestAt.trimmingToNil,
      domain: nil
    )
  }
}

extension GallerySubscriptionItem {
  init(optimistic gallery: GalleryHeaderModel, now: Date = Date()) {
    let timestamp = ISO8601DateFormatter().string(from: now)
    self.init(
      createdAt: timestamp,
      gallery: Gallery(
        author: gallery.authorName.map {
          FeaturedGalleryAuthor(name: $0, avatar: gallery.authorAvatar)
        },
        domain: gallery.domain,
        id: gallery.tenantId,
        lastUpload: gallery.lastUpload ?? timestamp,
        name: gallery.name,
        photoCount: gallery.photoCount ?? 0,
        slug: gallery.slug
      ),
      recentPhotos: [],
      tenantId: gallery.tenantId
    )
  }
}

