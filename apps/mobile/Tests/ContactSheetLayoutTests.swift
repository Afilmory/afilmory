@testable import Afilmory
import XCTest

final class ContactSheetLayoutTests: XCTestCase {
  private let library: [GalleryPhoto] = [
    ContactSheetLayoutTests.photo("a", "2026-07-26T05:46:00", ratio: 0.6667),
    ContactSheetLayoutTests.photo("b", "2026-07-19T23:13:00", ratio: 1.3334),
    ContactSheetLayoutTests.photo("c", "2026-07-19T22:09:00", ratio: 1.5),
    ContactSheetLayoutTests.photo("d", "2025-11-11T00:21:00", ratio: 0.75),
    ContactSheetLayoutTests.photo("e", "2025-08-30T16:25:00", ratio: 0.6666),
    ContactSheetLayoutTests.photo("f", "2025-08-02T15:54:00", ratio: 0.6667),
    ContactSheetLayoutTests.photo("g", "2024-01-12T09:31:00", ratio: 1.3333),
  ]

  func testDayGroupsByLocalCalendarDayInFeedOrder() {
    let groups = ContactSheetLayout.groups(photos: library, level: .day)
    XCTAssertEqual(groups.map(\.key), ["2026.07.26", "2026.07.19", "2025.11.11", "2025.08.30", "2025.08.02", "2024.01.12"])
    XCTAssertEqual(groups.map(\.title), ["07.26", "07.19", "11.11", "08.30", "08.02", "01.12"])
    XCTAssertEqual(groups[1].frames.map(\.photoID), ["b", "c"])
    XCTAssertEqual(groups[1].frames.map(\.number), [2, 3])
    XCTAssertEqual(groups.map(\.year), [2026, 2026, 2025, 2025, 2025, 2024])
  }

  func testMonthAndYearGroupKeysAndTitles() {
    let months = ContactSheetLayout.groups(photos: library, level: .month)
    XCTAssertEqual(months.map(\.title), ["2026.07", "2025.11", "2025.08", "2024.01"])
    XCTAssertEqual(months[2].frames.map(\.photoID), ["e", "f"])
    let years = ContactSheetLayout.groups(photos: library, level: .year)
    XCTAssertEqual(years.map(\.title), ["2026", "2025", "2024"])
    XCTAssertEqual(years.map(\.frames.count), [3, 3, 1])
  }

  func testFrameHeightsPerLevelAndWidthsFollowAspectRatio() {
    XCTAssertEqual(ContactSheetLayout.frameHeight(for: .day), 72)
    XCTAssertEqual(ContactSheetLayout.frameHeight(for: .month), 56)
    XCTAssertEqual(ContactSheetLayout.frameHeight(for: .year), 40)
    let day = ContactSheetLayout.groups(photos: library, level: .day)
    XCTAssertEqual(day[0].frames[0].width, 48)
    XCTAssertEqual(day[1].frames[1].width, 108)
    let year = ContactSheetLayout.groups(photos: library, level: .year)
    XCTAssertEqual(year[0].frames[2].width, 60)
  }

  func testExplicitNumberingSurvivesFiltering() {
    let numbers = ["c": 3, "e": 5]
    let groups = ContactSheetLayout.groups(photos: [library[2], library[4]], level: .day, numbers: numbers)
    XCTAssertEqual(groups.flatMap(\.frames).map(\.number), [3, 5])
  }

  func testInfinityHasNoStrips() {
    XCTAssertTrue(ContactSheetLayout.groups(photos: library, level: .infinity).isEmpty)
  }

  func testUndatedPhotosCollectAtTheEnd() {
    let groups = ContactSheetLayout.groups(photos: [ContactSheetLayoutTests.photo("x", nil, ratio: 1), library[0]], level: .day)
    XCTAssertEqual(groups.map(\.key), ["2026.07.26", ContactSheetGroup.undatedKey])
    XCTAssertNil(groups[1].year)
  }

  func testPackingFillsRowsGreedilyWithinWidth() {
    let groups = ContactSheetLayout.groups(photos: library, level: .year)
    let blocks = ContactSheetLayout.pack(groups: groups, width: 358)
    XCTAssertEqual(blocks.count, 1)
    guard case .row(let row) = blocks[0] else { return XCTFail("expected a row") }
    XCTAssertEqual(row.map(\.title), ["2026", "2025", "2024"])
    let used = row.map(\.stripWidth).reduce(0, +) + ContactSheetLayout.groupGap * CGFloat(row.count - 1)
    XCTAssertLessThanOrEqual(used, 358)
  }

  func testStripWidthIncludesGapsAndPadding() {
    let group = ContactSheetLayout.groups(photos: library, level: .day)[1]
    XCTAssertEqual(group.stripWidth, 96 + 108 + 3 + 10)
  }

  func testYearDividersOnlyAtDayAndMonth() {
    for level in [ContactSheetLevel.day, .month] {
      let blocks = ContactSheetLayout.pack(groups: ContactSheetLayout.groups(photos: library, level: level), width: 358)
      XCTAssertEqual(blocks.compactMap(\.dividerYear), [2026, 2025, 2024], "\(level)")
      XCTAssertEqual(blocks.first?.dividerYear, 2026)
    }
    let years = ContactSheetLayout.pack(groups: ContactSheetLayout.groups(photos: library, level: .year), width: 358)
    XCTAssertTrue(years.compactMap(\.dividerYear).isEmpty)
  }

  func testRowsNeverSpanYearDividers() {
    let blocks = ContactSheetLayout.pack(groups: ContactSheetLayout.groups(photos: library, level: .day), width: 358)
    var currentYear: Int?
    for block in blocks {
      switch block {
      case .year(let year): currentYear = year
      case .row(let groups): XCTAssertTrue(groups.allSatisfy { $0.year == currentYear })
      }
    }
  }

  func testWideStripGetsItsOwnRow() {
    let burst = (0..<8).map { ContactSheetLayoutTests.photo("w\($0)", "2025-05-10T13:2\($0):00", ratio: 1.5) }
    let photos = [ContactSheetLayoutTests.photo("p", "2025-05-12T10:00:00", ratio: 1)] + burst + [ContactSheetLayoutTests.photo("q", "2025-05-07T10:00:00", ratio: 1)]
    let blocks = ContactSheetLayout.pack(groups: ContactSheetLayout.groups(photos: photos, level: .day), width: 358)
    let rows = blocks.compactMap(\.groups)
    XCTAssertEqual(rows.map { $0.map(\.title) }, [["05.12"], ["05.10"], ["05.07"]])
    XCTAssertGreaterThan(rows[1][0].stripWidth, 358)
  }

  func testBlockHeights() {
    XCTAssertEqual(ContactSheetBlock.year(2026).height(level: .day), 28)
    XCTAssertEqual(ContactSheetBlock.row([]).height(level: .day), 13 + 6 + 22 + 72)
    XCTAssertEqual(ContactSheetBlock.row([]).height(level: .year), 13 + 6 + 22 + 40)
  }

  private static func photo(_ id: String, _ date: String?, ratio: Double) -> GalleryPhoto {
    GalleryPhoto(
      id: id, title: "DSC_\(id)", description: "", originalUrl: "", thumbnailUrl: "",
      thumbHash: nil, aspectRatio: ratio, width: ratio * 1000, height: 1000, format: nil, size: nil,
      dateTaken: date, video: nil, tags: [], exif: nil,
      toneAnalysis: nil, location: nil, camera: nil, lens: nil, rating: nil, city: nil
    )
  }
}
