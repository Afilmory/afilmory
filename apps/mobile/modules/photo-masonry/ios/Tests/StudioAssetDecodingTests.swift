import XCTest
@testable import Afilmory

final class StudioAssetDecodingTests: XCTestCase {
  func testDecodesAndNormalizesGoldenStudioAssets() throws {
    let assets = try StudioAssetDecoding.decode(NativeFixtureTestSupport.data("studio-assets"))
    let actual = StudioAssetDecoding.normalize(assets).map(\.photo)
    let expected = try NativeFixtureTestSupport.decode([GalleryPhoto].self, name: "expected-studio-normalized")
    XCTAssertEqual(actual, expected)
    XCTAssertEqual(assets.count, 188)
    XCTAssertTrue(assets.contains { !($0.manifest.data.stringArrayForTest("tags")).isEmpty })
  }
}

private extension Dictionary where Key == String, Value == JSONValue {
  func stringArrayForTest(_ key: String) -> [String] {
    guard case .array(let values) = self[key] else { return [] }
    return values.compactMap(\.string)
  }
}
