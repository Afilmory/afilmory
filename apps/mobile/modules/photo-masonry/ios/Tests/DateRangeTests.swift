import XCTest
@testable import Afilmory

final class DateRangeTests: XCTestCase {
  func testPicksMonthWithMostVisiblePhotos() {
    let photos = [
      NativeFixtureTestSupport.photo(dateTaken: "2026-06-02T10:00:00Z"),
      NativeFixtureTestSupport.photo(dateTaken: "2026-06-01T10:00:00Z"),
      NativeFixtureTestSupport.photo(dateTaken: "2026-05-20T10:00:00Z"),
    ]
    XCTAssertEqual(anchor(photos, start: 0, end: 2), "June")
  }

  func testBreaksTiesTowardNewerMonth() {
    let photos = [
      NativeFixtureTestSupport.photo(dateTaken: "2026-06-10T10:00:00Z"),
      NativeFixtureTestSupport.photo(dateTaken: "2026-05-10T10:00:00Z"),
    ]
    XCTAssertEqual(anchor(photos, start: 0, end: 1), "June")
  }

  func testIncludesYearOutsideCurrentYear() {
    XCTAssertEqual(
      anchor([NativeFixtureTestSupport.photo(dateTaken: "2019-03-05T10:00:00Z")], start: 0, end: 0),
      "March 2019"
    )
  }

  func testReturnsNilWithoutValidVisibleDate() {
    let photos = [
      NativeFixtureTestSupport.photo(),
      NativeFixtureTestSupport.photo(dateTaken: "not-a-date"),
    ]
    XCTAssertNil(anchor(photos, start: 0, end: 1))
    XCTAssertNil(anchor([], start: 0, end: 0))
  }

  func testIgnoresOutOfRangeAndUndatedPhotos() {
    let photos = [
      NativeFixtureTestSupport.photo(dateTaken: "2026-01-01T10:00:00Z"),
      NativeFixtureTestSupport.photo(),
      NativeFixtureTestSupport.photo(dateTaken: "2026-02-01T10:00:00Z"),
      NativeFixtureTestSupport.photo(dateTaken: "2026-06-01T10:00:00Z"),
    ]
    XCTAssertEqual(anchor(photos, start: 0, end: 2), "February")
  }

  func testFormatsThroughLocale() {
    let photos = [NativeFixtureTestSupport.photo(dateTaken: "2026-06-01T10:00:00Z")]
    XCTAssertEqual(
      DateRange.visibleMonthAnchor(
        photos: photos,
        startIndex: 0,
        endIndex: 0,
        localeIdentifier: "zh-CN",
        now: NativeFixtureTestSupport.fixedNow,
        timeZone: NativeFixtureTestSupport.singapore
      ),
      "六月"
    )
  }

  private func anchor(_ photos: [GalleryPhoto], start: Int, end: Int) -> String? {
    DateRange.visibleMonthAnchor(
      photos: photos,
      startIndex: start,
      endIndex: end,
      localeIdentifier: "en-US",
      now: NativeFixtureTestSupport.fixedNow,
      timeZone: NativeFixtureTestSupport.singapore
    )
  }
}
