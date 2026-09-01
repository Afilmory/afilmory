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
      ["photo-13", "photo-16", "photo-19", "photo-18", "photo-10", "photo-3", "photo-4"]
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

  func testAppendingPhotosOnlyChangesDaysTheNewPhotoWins() {
    let before = DailyPhotoPicker.pick(
      photoIds: photoIds, slug: "innei", startingAt: reference, calendar: calendar
    )
    let after = DailyPhotoPicker.pick(
      photoIds: photoIds + ["photo-21"], slug: "innei", startingAt: reference, calendar: calendar
    )
    XCTAssertEqual(before.map(\.day), after.map(\.day))
    for (old, new) in zip(before, after) where old.photoId != new.photoId {
      XCTAssertEqual(new.photoId, "photo-21")
    }
    XCTAssertEqual(
      after.map(\.photoId),
      ["photo-13", "photo-21", "photo-19", "photo-18", "photo-10", "photo-3", "photo-4"]
    )
  }

  func testReorderingPhotosDoesNotChangePicks() {
    let ordered = DailyPhotoPicker.pick(
      photoIds: photoIds, slug: "innei", startingAt: reference, calendar: calendar
    )
    let reversed = DailyPhotoPicker.pick(
      photoIds: photoIds.reversed(), slug: "innei", startingAt: reference, calendar: calendar
    )
    XCTAssertEqual(ordered, reversed)
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
