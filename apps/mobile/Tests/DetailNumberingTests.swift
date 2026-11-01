@testable import Afilmory
import XCTest

@MainActor
final class DetailNumberingTests: XCTestCase {
  private static func photo(_ id: String, date: String) -> GalleryPhoto {
    GalleryPhoto(
      id: id, title: id, description: "", originalUrl: "", thumbnailUrl: "",
      thumbHash: nil, aspectRatio: 1, width: 1, height: 1, format: nil, size: nil,
      dateTaken: date, video: nil, tags: [], exif: nil,
      toneAnalysis: nil, location: nil, camera: nil, lens: nil, rating: nil, city: nil
    )
  }

  func testFilteredDetailKeepsTheContactSheetNumbers() {
    let all = [
      Self.photo("a", date: "2024-01-01T09:00:00"),
      Self.photo("b", date: "2025-01-01T09:00:00"),
      Self.photo("c", date: "2026-01-01T09:00:00"),
    ]
    let sheetNumbers = ExhibitionLibrary.numbering(ExhibitionLibrary.chronological(all))
    let filtered = [all[0]]
    let detail = PhotoDetailViewController(photos: filtered, index: 0, numbers: sheetNumbers, gallerySlug: nil) { _ in nil }
    XCTAssertEqual(detail.number(of: all[0]), sheetNumbers["a"])
    XCTAssertEqual(detail.number(of: all[0]), 3)
  }
}
