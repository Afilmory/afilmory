@testable import Afilmory
import XCTest

final class ExhibitionOpenerTests: XCTestCase {
  private let library: [GalleryPhoto] = [
    ExhibitionOpenerTests.photo("a", tags: ["bird"], date: "2026-07-26T05:46:00"),
    ExhibitionOpenerTests.photo("b", tags: ["night"], date: "2026-07-19T23:13:00"),
    ExhibitionOpenerTests.photo("c", tags: ["bird", "night"], date: "2025-11-11T00:21:00"),
    ExhibitionOpenerTests.photo("d", tags: [], date: "2024-01-12T09:31:00"),
  ]

  func testReExposeNeverReturnsTheCurrentPhoto() {
    for draw in 0..<10 {
      let next = ExhibitionOpener.pick(from: library, excluding: "b") { upper in draw % upper }
      XCTAssertNotNil(next)
      XCTAssertNotEqual(next?.id, "b")
    }
  }

  func testReExposeCoversEveryOtherPhoto() {
    let picks = Set((0..<3).compactMap { draw in
      ExhibitionOpener.pick(from: library, excluding: "a") { _ in draw }?.id
    })
    XCTAssertEqual(picks, ["b", "c", "d"])
  }

  func testSinglePhotoPoolKeepsThatPhotoAndEmptyPoolHasNone() {
    XCTAssertEqual(ExhibitionOpener.pick(from: [library[0]], excluding: "a") { _ in 0 }?.id, "a")
    XCTAssertNil(ExhibitionOpener.pick(from: [], excluding: nil) { _ in 0 })
  }

  func testFilterNarrowsThePool() {
    var filters = PhotoFilters.empty
    filters.tags = ["bird"]
    let pool = ExhibitionOpener.pool(photos: library, filters: filters)
    XCTAssertEqual(pool.map(\.id), ["a", "c"])
    for draw in 0..<6 {
      let pick = ExhibitionOpener.pick(from: pool, excluding: nil) { upper in draw % upper }
      XCTAssertTrue(["a", "c"].contains(pick?.id ?? ""))
    }
  }

  func testResolveKeepsCurrentWhileItStaysInThePool() {
    XCTAssertEqual(ExhibitionOpener.resolve(currentID: "c", pool: library) { _ in 0 }?.id, "c")
    let narrowed = Array(library.prefix(2))
    XCTAssertEqual(ExhibitionOpener.resolve(currentID: "c", pool: narrowed) { _ in 1 }?.id, "b")
  }

  func testGalleryOpenerIsTheLatestPhoto() {
    let shuffled = [library[2], library[0], library[3], library[1]]
    XCTAssertEqual(ExhibitionOpener.latest(in: shuffled)?.id, "a")
  }

  private static func photo(_ id: String, tags: [String], date: String) -> GalleryPhoto {
    GalleryPhoto(
      id: id, title: "DSC_\(id)", description: "", originalUrl: "", thumbnailUrl: "",
      thumbHash: nil, aspectRatio: 1, width: 1, height: 1, format: nil, size: nil,
      dateTaken: date, video: nil, tags: tags, exif: nil,
      toneAnalysis: nil, location: nil, camera: nil, lens: nil, rating: nil, city: nil
    )
  }

  @MainActor
  func testOpenerScrollKeepsTheCardStillUnderReduceMotion() {
    AFMotion.reduceMotionOverride = true
    defer { AFMotion.reduceMotionOverride = nil }
    let opener = ExhibitionOpenerView(frame: CGRect(x: 0, y: 0, width: 402, height: 700))
    opener.cardFrame = CGRect(x: 10, y: 10, width: 382, height: 500)
    opener.applyScroll(offset: 300)
    XCTAssertEqual(opener.card.transform, .identity)
    XCTAssertLessThan(opener.card.alpha, 1)
  }
}
