import Foundation
import XCTest

@testable import Afilmory

final class PushNotificationTests: XCTestCase {
  func testDeviceTokenUsesStableLowercaseHexEncoding() {
    XCTAssertEqual(apnsDeviceTokenString(Data([0x00, 0x0f, 0xa5, 0xff])), "000fa5ff")
  }

  func testGalleryNotificationBuildsAnExploreDeepLink() throws {
    let url = try XCTUnwrap(
      galleryNotificationDeepLink(
        userInfo: [
          "route": "gallery",
          "gallerySlug": "street-photo",
          "galleryName": "Street Photo",
          "eventId": "event-123",
        ]
      )
    )
    let components = try XCTUnwrap(URLComponents(url: url, resolvingAgainstBaseURL: false))
    let query = Dictionary(uniqueKeysWithValues: (components.queryItems ?? []).compactMap { item in
      item.value.map { (item.name, $0) }
    })

    XCTAssertEqual(components.scheme, AfilmoryBuildConfiguration.urlScheme)
    XCTAssertEqual(components.path, "/explore")
    XCTAssertEqual(query["gallery"], "street-photo")
    XCTAssertEqual(query["name"], "Street Photo")
    XCTAssertEqual(query["event"], "event-123")
  }

  func testUnrelatedNotificationDoesNotProduceADeepLink() {
    XCTAssertNil(galleryNotificationDeepLink(userInfo: ["route": "comment"]))
  }

  func testGalleryNotificationUsesTheInstalledVariantsScheme() throws {
    let url = try XCTUnwrap(
      galleryNotificationDeepLink(
        userInfo: ["route": "gallery", "gallerySlug": "street-photo"],
        scheme: "afilmory-local"
      )
    )

    XCTAssertEqual(url.scheme, "afilmory-local")
  }

  func testGalleryNotificationDeepLinkResolvesToTheExploreGallery() throws {
    let url = try XCTUnwrap(
      galleryNotificationDeepLink(
        userInfo: [
          "route": "gallery",
          "gallerySlug": "street-photo",
          "galleryName": "Street Photo",
          "eventId": "event-123",
        ],
        scheme: "afilmory-local"
      )
    )

    XCTAssertEqual(
      AfilmoryDeepLink.parse(url, customScheme: "afilmory-local"),
      .explore(
        GalleryRouteRequest(
          requestId: "event-123",
          slug: "street-photo",
          title: "Street Photo"
        )
      )
    )
  }

  func testDeepLinksResolveEveryPublicNativeRoute() throws {
    let cases: [(String, AfilmoryDeepLink)] = [
      ("afilmory-local:///", .root),
      ("afilmory-local:///photos", .photos),
      ("afilmory-local://map", .map),
      ("afilmory-local:///explore", .explore(nil)),
      ("afilmory-local:///studio", .studio(nil)),
      ("afilmory-local:///studio/comments", .studio(.comments)),
      ("afilmory-local:///studio/domain", .studio(.domain)),
      ("https://afilmory.art/explore", .explore(nil)),
      ("https://demo.afilmory.art/studio/library", .studio(.library)),
    ]

    for (rawURL, expected) in cases {
      let url = try XCTUnwrap(URL(string: rawURL))
      XCTAssertEqual(
        AfilmoryDeepLink.parse(url, customScheme: "afilmory-local"),
        expected,
        rawURL
      )
    }
  }

  func testTenantHomepageOpensItsGalleryInExplore() throws {
    let url = try XCTUnwrap(URL(string: "https://innei.afilmory.art/"))
    let route = try XCTUnwrap(Self.galleryRoute(AfilmoryDeepLink.parse(url, customScheme: "afilmory-local")))

    XCTAssertEqual(route.slug, "innei")
    XCTAssertEqual(route.title, "innei")
    XCTAssertNil(route.photoID)
  }

  func testTenantPhotoPermalinkFocusesThatPhoto() throws {
    let url = try XCTUnwrap(URL(string: "https://innei.afilmory.art/photos/DSC_7132"))
    let route = try XCTUnwrap(Self.galleryRoute(AfilmoryDeepLink.parse(url, customScheme: "afilmory-local")))

    XCTAssertEqual(route.slug, "innei")
    XCTAssertEqual(route.photoID, "DSC_7132")
  }

  func testWidgetPhotoLinkGetsAFreshRequestIdEveryTap() throws {
    let url = try XCTUnwrap(URL(string: "afilmory-local://photo/innei/DSC_7132"))
    let first = try XCTUnwrap(Self.galleryRoute(AfilmoryDeepLink.parse(url, customScheme: "afilmory-local")))
    let second = try XCTUnwrap(Self.galleryRoute(AfilmoryDeepLink.parse(url, customScheme: "afilmory-local")))

    XCTAssertEqual(first.slug, "innei")
    XCTAssertEqual(first.photoID, "DSC_7132")
    XCTAssertNotEqual(first.requestId, second.requestId)
  }

  func testNotificationRouteKeepsItsEventIdForDeduplication() throws {
    let url = try XCTUnwrap(
      galleryNotificationDeepLink(
        userInfo: ["route": "gallery", "gallerySlug": "innei", "eventId": "event-9"],
        scheme: "afilmory-local"
      )
    )
    let first = try XCTUnwrap(Self.galleryRoute(AfilmoryDeepLink.parse(url, customScheme: "afilmory-local")))
    let second = try XCTUnwrap(Self.galleryRoute(AfilmoryDeepLink.parse(url, customScheme: "afilmory-local")))

    XCTAssertEqual(first.requestId, "event-9")
    XCTAssertEqual(first.requestId, second.requestId)
  }

  private static func galleryRoute(_ link: AfilmoryDeepLink?) -> GalleryRouteRequest? {
    guard case .explore(let route) = link else { return nil }
    return route
  }

  func testMarketingHostKeepsItsOwnRoutes() throws {
    XCTAssertEqual(
      AfilmoryDeepLink.parse(try XCTUnwrap(URL(string: "https://afilmory.art/")), customScheme: "afilmory-local"),
      .root
    )
    XCTAssertNil(
      AfilmoryDeepLink.parse(
        try XCTUnwrap(URL(string: "https://afilmory.art/photos/DSC_7132")),
        customScheme: "afilmory-local"
      )
    )
    XCTAssertEqual(
      AfilmoryDeepLink.parse(try XCTUnwrap(URL(string: "https://www.afilmory.art/")), customScheme: "afilmory-local"),
      .root
    )
  }

  func testDeepLinksRejectUntrustedDomainsAndUnknownNestedRoutes() throws {
    let rejected = [
      "https://evilafilmory.art/explore",
      "https://example.com/explore",
      "afilmory-local:///explore/unexpected",
      "afilmory-local:///studio/unknown",
      "afilmory-local://share-upload?id=job-1",
    ]

    for rawURL in rejected {
      XCTAssertNil(
        AfilmoryDeepLink.parse(try XCTUnwrap(URL(string: rawURL)), customScheme: "afilmory-local"),
        rawURL
      )
    }
  }
}
