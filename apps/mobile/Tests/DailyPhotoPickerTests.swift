import XCTest
@testable import Afilmory

final class DailyPhotoPickerTests: XCTestCase {
  private let calendar: Calendar = {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = TimeZone(identifier: "UTC")!
    return calendar
  }()
  private let reference = Date(timeIntervalSince1970: 1_756_800_000)
  private let photoIds = (1 ... 20).map { "photo-\($0)" }

  func testPickIsStableAcrossRuns() {
    let first = DailyPhotoPicker.pick(
      photoIds: photoIds, slug: "innei", startingAt: reference, calendar: calendar
    )
    let second = DailyPhotoPicker.pick(
      photoIds: photoIds, slug: "innei", startingAt: reference.addingTimeInterval(3600),
      calendar: calendar
    )
    XCTAssertEqual(first, second)
    XCTAssertEqual(
      first.map(\.photoId),
      ["photo-7", "photo-14", "photo-13", "photo-8", "photo-15", "photo-18", "photo-5"]
    )
  }

  func testPickCoversSevenDistinctDays() {
    let picks = DailyPhotoPicker.pick(
      photoIds: photoIds, slug: "innei", startingAt: reference, calendar: calendar
    )
    XCTAssertEqual(picks.count, 7)
    XCTAssertEqual(Set(picks.map(\.day)).count, 7)
    XCTAssertEqual(picks.first?.day, calendar.startOfDay(for: reference))
    for (index, pick) in picks.enumerated() {
      XCTAssertEqual(
        pick.day,
        calendar.date(byAdding: .day, value: index, to: calendar.startOfDay(for: reference))
      )
    }
  }

  func testDifferentSlugsPickDifferently() {
    let a = DailyPhotoPicker.pick(
      photoIds: photoIds, slug: "innei", startingAt: reference, calendar: calendar
    )
    let b = DailyPhotoPicker.pick(
      photoIds: photoIds, slug: "someone-else", startingAt: reference, calendar: calendar
    )
    XCTAssertNotEqual(a.map(\.photoId), b.map(\.photoId))
  }

  func testFewerPhotosThanDaysStillFillsEveryDay() {
    let picks = DailyPhotoPicker.pick(
      photoIds: ["only-one", "two"], slug: "innei", startingAt: reference, calendar: calendar
    )
    XCTAssertEqual(picks.count, 7)
    XCTAssertTrue(picks.allSatisfy { ["only-one", "two"].contains($0.photoId) })
  }

  func testEmptyPhotosProducesNoPicks() {
    XCTAssertTrue(
      DailyPhotoPicker.pick(photoIds: [], slug: "innei", startingAt: reference, calendar: calendar)
        .isEmpty
    )
  }
}
