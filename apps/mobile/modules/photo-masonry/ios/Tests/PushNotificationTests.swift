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
