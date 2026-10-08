import XCTest
@testable import Afilmory

final class UploadTagPathTests: XCTestCase {
  func testParsePreservesCaseAndDeduplicatesExactTags() {
    XCTAssertEqual(
      UploadTagPath.parse(" Travel, night sky,TRAVEL, travel, Travel,  夜景  ,"),
      ["Travel", "night sky", "TRAVEL", "travel", "夜景"]
    )
  }

  func testParsedTagsKeepDistinctDirectoryCasing() {
    XCTAssertEqual(
      UploadTagPath.directory(from: UploadTagPath.parse(" Travel, travel, Night Sky, Travel ")),
      "Travel/travel/Night-Sky"
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
