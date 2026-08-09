import XCTest
@testable import Afilmory

final class ManifestDecodingTests: XCTestCase {
  func testDecodesAndNormalizesGoldenManifest() throws {
    let actual = try ManifestDecoding.decode(
      NativeFixtureTestSupport.data("manifest"),
      galleryOrigin: URL(string: "https://innei.afilmory.art")!
    )
    let expected = try NativeFixtureTestSupport.decode([GalleryPhoto].self, name: "expected-normalized")
    XCTAssertEqual(actual, expected)
  }
}
