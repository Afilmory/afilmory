import XCTest
@testable import Afilmory

final class UploadTagPathTests: XCTestCase {
  func testParseNormalizesAndDeduplicatesTags() {
    XCTAssertEqual(
      UploadTagPath.parse(" Travel, night sky,TRAVEL,  夜景  ,"),
      ["travel", "night sky", "夜景"]
    )
  }

  func testParseLimitsExternalInputToThirtyTwoTags() {
    let input = (0..<40).map { "tag-\($0)" }.joined(separator: ",")
    let result = UploadTagPath.parse(input)

    XCTAssertEqual(result.count, 32)
    XCTAssertEqual(result.first, "tag-0")
    XCTAssertEqual(result.last, "tag-31")
  }

  func testDirectoryProducesSafeOrderedPathSegments() {
    XCTAssertEqual(
      UploadTagPath.directory(from: [" Night Sky ", "2026/Summer", "城市✨", "---"]),
      "Night-Sky/2026-Summer/城市"
    )
  }

  func testDirectoryReturnsNilWhenNoUsableSegmentRemains() {
    XCTAssertNil(UploadTagPath.directory(from: [" / ", "✨"]))
  }
}
