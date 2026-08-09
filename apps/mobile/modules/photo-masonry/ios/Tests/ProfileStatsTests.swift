import XCTest
@testable import Afilmory

final class ProfileStatsTests: XCTestCase {
  func testCountsPhotosDistinctCamerasAndLenses() {
    let stats = ProfileStats.collect([
      NativeFixtureTestSupport.photo(dateTaken: "2024-06-02T10:00:00Z", camera: "X-T5", lens: "23mm"),
      NativeFixtureTestSupport.photo(dateTaken: "2024-06-03T10:00:00Z", camera: "X-T5", lens: "56mm"),
      NativeFixtureTestSupport.photo(dateTaken: "2024-06-04T10:00:00Z", camera: "GR III", lens: "23mm"),
    ])
    XCTAssertEqual(stats.photoCount, 3)
    XCTAssertEqual(stats.cameraCount, 2)
    XCTAssertEqual(stats.lensCount, 2)
  }

  func testSpansEarliestAndLatestYears() {
    let stats = ProfileStats.collect([
      NativeFixtureTestSupport.photo(dateTaken: "2019-01-01T00:00:00Z"),
      NativeFixtureTestSupport.photo(dateTaken: "2026-05-01T00:00:00Z"),
      NativeFixtureTestSupport.photo(dateTaken: "2022-08-01T00:00:00Z"),
    ])
    XCTAssertEqual(stats.yearSpan, "2019–2026")
  }

  func testCollapsesSingleYear() {
    let stats = ProfileStats.collect([
      NativeFixtureTestSupport.photo(dateTaken: "2024-02-01T00:00:00Z"),
      NativeFixtureTestSupport.photo(dateTaken: "2024-11-01T00:00:00Z"),
    ])
    XCTAssertEqual(stats.yearSpan, "2024")
  }

  func testIgnoresMissingAndInvalidDates() {
    let stats = ProfileStats.collect([
      NativeFixtureTestSupport.photo(camera: "X-T5"),
      NativeFixtureTestSupport.photo(dateTaken: "not-a-date"),
      NativeFixtureTestSupport.photo(dateTaken: "2023-03-01T00:00:00Z"),
    ])
    XCTAssertEqual(stats.yearSpan, "2023")
    XCTAssertEqual(stats.cameraCount, 1)
  }

  func testReturnsNilSpanForUndatedOrEmptyFeed() {
    XCTAssertNil(ProfileStats.collect([]).yearSpan)
    XCTAssertNil(ProfileStats.collect([NativeFixtureTestSupport.photo()]).yearSpan)
  }
}
