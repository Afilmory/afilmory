@testable import Afilmory
import XCTest

final class ViewingContentTests: XCTestCase {
  private let utc = TimeZone(identifier: "UTC")!

  func testChaptersGroupRollsByDayNewestFirst() {
    let events = [
      event(tenant: "a", day: "2026-07-25", latestAt: "2026-07-25T09:00:00.000Z"),
      event(tenant: "b", day: "2026-07-26", latestAt: "2026-07-26T06:00:00.000Z"),
      event(tenant: "a", day: "2026-07-26", latestAt: "2026-07-26T18:00:00.000Z"),
      event(tenant: "c", day: "2025-12-31", latestAt: "2025-12-31T23:00:00.000Z"),
    ]
    let chapters = ViewingContent.chapters(from: events)
    XCTAssertEqual(chapters.map(\.day), ["2026-07-26", "2026-07-25", "2025-12-31"])
    XCTAssertEqual(chapters[0].monthDay, "07.26")
    XCTAssertEqual(chapters[0].year, "2026")
    XCTAssertEqual(chapters[0].rolls.map(\.tenantId), ["a", "b"])
    XCTAssertEqual(chapters[2].year, "2025")
  }

  func testChapterFallsBackToRawDayWhenUnparseable() {
    let chapters = ViewingContent.chapters(from: [event(tenant: "a", day: "someday", latestAt: "")])
    XCTAssertEqual(chapters[0].monthDay, "someday")
    XCTAssertEqual(chapters[0].year, "")
  }

  func testRollTimeOfDayUsesLocalHourOfLatestUpload() {
    XCTAssertEqual(ViewingContent.timeOfDay(latestAt: "2026-07-26T06:10:00.000Z", timeZone: utc), .dawn)
    XCTAssertEqual(ViewingContent.timeOfDay(latestAt: "2026-07-26T06:10:00Z", timeZone: TimeZone(identifier: "Asia/Shanghai")!), .afternoon)
    XCTAssertNil(ViewingContent.timeOfDay(latestAt: "garbage", timeZone: utc))
  }

  func testLatestDateFormatsInLocalTimeZone() {
    XCTAssertEqual(ViewingContent.latestDate("2026-07-26T20:00:00.000Z", timeZone: utc), "2026.07.26")
    XCTAssertEqual(ViewingContent.latestDate("2026-07-26T20:00:00.000Z", timeZone: TimeZone(identifier: "Asia/Tokyo")!), "2026.07.27")
    XCTAssertNil(ViewingContent.latestDate(nil, timeZone: utc))
  }

  func testQueryMatchesNameSlugAndAuthorCaseInsensitively() {
    let header = header(tenant: "t", name: "Birdline", slug: "birdline", author: "Mira Chen")
    XCTAssertTrue(ViewingContent.matches(header, query: ""))
    XCTAssertTrue(ViewingContent.matches(header, query: "  bird "))
    XCTAssertTrue(ViewingContent.matches(header, query: "CHEN"))
    XCTAssertFalse(ViewingContent.matches(header, query: "flora"))
  }

  func testCardsSplitFollowingFromDiscoverWithoutDuplicatesOrOwnGallery() {
    let subscriptions = [subscription(tenant: "a", name: "Birdline", previews: 7)]
    let directory = [featured(id: "a", name: "Birdline"), featured(id: "b", name: "Flora"), featured(id: "c", name: "Night", own: true)]
    let cards = ViewingContent.galleryCards(subscriptions: subscriptions, directory: directory, query: "")
    XCTAssertEqual(cards.following.map(\.id), ["a"])
    XCTAssertEqual(cards.following[0].covers?.count, 5)
    XCTAssertTrue(cards.following[0].isSubscribed)
    XCTAssertEqual(cards.discover.map(\.id), ["b"])
    XCTAssertNil(cards.discover[0].covers)
    XCTAssertFalse(cards.discover[0].isSubscribed)
  }

  func testCardsAreFilteredByQuery() {
    let subscriptions = [subscription(tenant: "a", name: "Birdline", previews: 1)]
    let directory = [featured(id: "b", name: "Flora"), featured(id: "c", name: "Florist")]
    let cards = ViewingContent.galleryCards(subscriptions: subscriptions, directory: directory, query: "flor")
    XCTAssertTrue(cards.following.isEmpty)
    XCTAssertEqual(cards.discover.map(\.id), ["b", "c"])
  }

  func testFollowStateOverridesDirectoryFlag() {
    var stale = featured(id: "b", name: "Flora")
    stale.isSubscribed = true
    let cards = ViewingContent.galleryCards(subscriptions: [], directory: [stale], query: "")
    XCTAssertFalse(cards.discover[0].isSubscribed)
  }

  private func event(tenant: String, day: String, latestAt: String) -> GalleryTimelineEvent {
    GalleryTimelineEvent(
      day: day,
      gallery: .init(author: nil, id: tenant, name: tenant, slug: tenant),
      id: "\(tenant):\(day)",
      latestAt: latestAt,
      photos: [],
      tenantId: tenant,
      totalCount: 1
    )
  }

  private func header(tenant: String, name: String, slug: String, author: String?) -> GalleryHeaderModel {
    GalleryHeaderModel(tenantId: tenant, name: name, slug: slug, authorName: author, authorAvatar: nil, photoCount: 1, lastUpload: nil, domain: nil)
  }

  private func preview(_ id: String) -> GalleryPhotoPreview {
    GalleryPhotoPreview(aspectRatio: 1.5, height: 400, id: id, isLivePhoto: false, syncedAt: "", thumbHash: nil, thumbnailUrl: "https://x/\(id).jpg", width: 600)
  }

  private func subscription(tenant: String, name: String, previews: Int) -> GallerySubscriptionItem {
    GallerySubscriptionItem(
      createdAt: "",
      gallery: .init(author: nil, domain: nil, id: tenant, lastUpload: "2026-07-26T00:00:00Z", name: name, photoCount: 10, slug: tenant),
      recentPhotos: (0..<previews).map { preview("\(tenant)-\($0)") },
      tenantId: tenant
    )
  }

  private func featured(id: String, name: String, own: Bool = false) -> FeaturedGallery {
    FeaturedGallery(
      id: id, name: name, slug: id, domain: nil, description: nil, author: nil, photoCount: 3,
      isSubscribed: false, isOwnGallery: own, tags: [], createdAt: "", lastUpload: nil
    )
  }
}
