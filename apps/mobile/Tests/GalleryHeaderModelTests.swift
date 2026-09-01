import XCTest

@testable import Afilmory

final class GalleryHeaderModelTests: XCTestCase {
  private func makeFeatured(
    author: FeaturedGalleryAuthor? = FeaturedGalleryAuthor(name: "Innei", avatar: "https://cdn.test/a.jpg"),
    domain: String? = "photos.innei.dev",
    lastUpload: String? = "2026-08-30T10:00:00Z"
  ) -> FeaturedGallery {
    FeaturedGallery(
      id: "tenant-1",
      name: "Innei Gallery",
      slug: "innei",
      domain: domain,
      description: "Some description",
      author: author,
      photoCount: 42,
      isSubscribed: false,
      isOwnGallery: false,
      tags: ["travel"],
      createdAt: "2026-01-01T00:00:00Z",
      lastUpload: lastUpload
    )
  }

  private func makeSubscription(
    author: FeaturedGalleryAuthor? = FeaturedGalleryAuthor(name: "  Innei  ", avatar: "  "),
    domain: String? = "  "
  ) -> GallerySubscriptionItem {
    GallerySubscriptionItem(
      createdAt: "2026-02-02T00:00:00Z",
      gallery: GallerySubscriptionItem.Gallery(
        author: author,
        domain: domain,
        id: "gallery-1",
        lastUpload: "2026-08-31T08:30:00Z",
        name: "Followed Gallery",
        photoCount: 7,
        slug: "followed"
      ),
      recentPhotos: [],
      tenantId: "tenant-2"
    )
  }

  private func makeTimelineEvent() -> GalleryTimelineEvent {
    GalleryTimelineEvent(
      day: "2026-09-01",
      gallery: GalleryTimelineEvent.Gallery(
        author: nil,
        id: "gallery-2",
        name: "Timeline Gallery",
        slug: "timeline"
      ),
      id: "event-1",
      latestAt: "2026-09-01T12:00:00Z",
      photos: [],
      tenantId: "tenant-3",
      totalCount: 3
    )
  }

  func testMapsFeaturedGallery() {
    let model = GalleryHeaderModel(featured: makeFeatured())
    XCTAssertEqual(model.tenantId, "tenant-1")
    XCTAssertEqual(model.name, "Innei Gallery")
    XCTAssertEqual(model.slug, "innei")
    XCTAssertEqual(model.authorName, "Innei")
    XCTAssertEqual(model.authorAvatar, "https://cdn.test/a.jpg")
    XCTAssertEqual(model.photoCount, 42)
    XCTAssertEqual(model.lastUpload, "2026-08-30T10:00:00Z")
    XCTAssertEqual(model.domain, "photos.innei.dev")
  }

  func testMapsFeaturedGalleryWithMissingOptionalFields() {
    let model = GalleryHeaderModel(featured: makeFeatured(author: nil, domain: nil, lastUpload: nil))
    XCTAssertNil(model.authorName)
    XCTAssertNil(model.authorAvatar)
    XCTAssertNil(model.lastUpload)
    XCTAssertNil(model.domain)
    XCTAssertEqual(model.photoCount, 42)
  }

  func testMapsSubscriptionGalleryAndTrimsBlankStrings() {
    let model = GalleryHeaderModel(subscription: makeSubscription())
    XCTAssertEqual(model.tenantId, "tenant-2")
    XCTAssertEqual(model.name, "Followed Gallery")
    XCTAssertEqual(model.slug, "followed")
    XCTAssertEqual(model.authorName, "Innei")
    XCTAssertNil(model.authorAvatar)
    XCTAssertNil(model.domain)
    XCTAssertEqual(model.photoCount, 7)
    XCTAssertEqual(model.lastUpload, "2026-08-31T08:30:00Z")
  }

  func testMapsTimelineEventWithoutPhotoCountOrDomain() {
    let model = GalleryHeaderModel(timelineEvent: makeTimelineEvent())
    XCTAssertEqual(model.tenantId, "tenant-3")
    XCTAssertEqual(model.name, "Timeline Gallery")
    XCTAssertEqual(model.slug, "timeline")
    XCTAssertNil(model.authorName)
    XCTAssertNil(model.photoCount)
    XCTAssertNil(model.domain)
    XCTAssertEqual(model.lastUpload, "2026-09-01T12:00:00Z")
  }
}
