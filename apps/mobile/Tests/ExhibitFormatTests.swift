@testable import Afilmory
import XCTest

final class ExhibitFormatTests: XCTestCase {
  func testTimeOfDayBoundaries() {
    let expected: [(Int, ExhibitFormat.TimeOfDay)] = [
      (0, .lateNight), (4, .lateNight), (5, .dawn), (7, .dawn), (8, .morning), (10, .morning),
      (11, .noon), (12, .noon), (13, .afternoon), (16, .afternoon), (17, .dusk), (18, .dusk),
      (19, .night), (23, .night),
    ]
    for (hour, period) in expected {
      XCTAssertEqual(ExhibitFormat.timeOfDay(hour: hour), period, "hour \(hour)")
    }
  }

  func testLocalDateTimeKeepsCaptureWallClock() throws {
    let parts = try XCTUnwrap(ExhibitFormat.localDateTime(from: "2026-07-26T05:46:18.730+08:00"))
    XCTAssertEqual(parts.date, "2026.07.26")
    XCTAssertEqual(parts.time, "05:46")
    XCTAssertEqual(parts.hour, 5)
    XCTAssertEqual(parts.day, "07.26")
    XCTAssertEqual(parts.year, 2026)
    XCTAssertNil(ExhibitFormat.localDateTime(from: nil))
    XCTAssertNil(ExhibitFormat.localDateTime(from: "yesterday"))
  }

  func testFilenameLikeTitles() {
    for title in ["DSC 7132", "IMG 0030", "DSCF4632", "DSC_7132", "IMG_20251111_002156", "P1010203", "_MG_1234"] {
      XCTAssertTrue(ExhibitFormat.isFilenameLikeTitle(title), title)
    }
    for title in ["Robin at dawn", "旅鸫", "Kyoto 2024"] {
      XCTAssertFalse(ExhibitFormat.isFilenameLikeTitle(title), title)
    }
  }

  func testFrameNumberIsTwoDigits() {
    XCTAssertEqual(ExhibitFormat.frameNumber(1), "01")
    XCTAssertEqual(ExhibitFormat.frameNumber(12), "12")
    XCTAssertEqual(ExhibitFormat.frameNumber(123), "123")
  }

  func testExifLineOrderAndGear() {
    let photo = makePhoto(exif: [
      "FocalLength": .number(600),
      "FNumber": .number(6.3),
      "ExposureTime": .number(0.004),
      "ISO": .number(1400),
      "ExposureCompensation": .number(0),
      "Make": .string("NIKON CORPORATION"),
      "Model": .string("Z f"),
      "LensModel": .string("NIKKOR Z 600mm f/6.3 VR S"),
    ])
    XCTAssertEqual(ExhibitFormat.exifLine(for: photo), "600mm  f/6.3  1/250s  ISO 1400  ±0 EV")
    XCTAssertEqual(ExhibitFormat.camera(for: photo), "Nikon Z f")
    XCTAssertEqual(ExhibitFormat.gear(for: photo), "Nikon Z f · NIKKOR Z 600mm f/6.3 VR S")
  }

  func testManifestStringValuesAndWallClock() throws {
    let photo = makePhoto(
      title: "DSC 7132",
      dateTaken: "2026-07-25T21:46:18.730Z",
      exif: [
        "DateTimeOriginal": .string("2026-07-26T05:46:18.730+08:00"),
        "Make": .string("NIKON CORPORATION"),
        "Model": .string("NIKON Z f"),
        "ExposureTime": .string("1/250"),
        "FNumber": .number(6.3),
        "ISO": .number(1400),
        "ExposureCompensation": .number(0),
        "FocalLength": .string("600.0 mm"),
        "LensModel": .string("NIKKOR Z 600mm f/6.3 VR S"),
      ]
    )
    XCTAssertEqual(ExhibitFormat.exifLine(for: photo), "600mm  f/6.3  1/250s  ISO 1400  ±0 EV")
    XCTAssertEqual(ExhibitFormat.camera(for: photo), "Nikon Z f")
    let local = try XCTUnwrap(ExhibitFormat.localDateTime(for: photo))
    XCTAssertEqual(local.date, "2026.07.26")
    XCTAssertEqual(local.time, "05:46")
    XCTAssertEqual(local.timeOfDay, .dawn)
    XCTAssertEqual(ExhibitFormat.headline(for: photo), .date("2026.07.26"))
  }

  func testLongExposureAndFujiModel() {
    let photo = makePhoto(exif: [
      "Make": .string("FUJIFILM"),
      "Model": .string("X-T5"),
      "ExposureTime": .string("2.5"),
      "FocalLength": .string("23 mm"),
    ])
    XCTAssertEqual(ExhibitFormat.exifLine(for: photo), "23mm  2.5s")
    XCTAssertEqual(ExhibitFormat.camera(for: photo), "Fujifilm X-T5")
  }

  func testExifLineSkipsMissingValues() {
    let photo = makePhoto(exif: ["FNumber": .number(2), "ExposureCompensation": .number(-0.7)])
    XCTAssertEqual(ExhibitFormat.exifLine(for: photo), "f/2  −0.7 EV")
    XCTAssertEqual(ExhibitFormat.exifLine(for: makePhoto(exif: nil)), "")
  }

  func testHeadlinePrefersRealTitle() {
    let dated = makePhoto(title: "DSC_7132", dateTaken: "2026-07-26T05:46:18+08:00")
    XCTAssertEqual(ExhibitFormat.headline(for: dated), .date("2026.07.26"))
    let titled = makePhoto(title: "Robin at dawn", dateTaken: "2026-07-26T05:46:18+08:00")
    XCTAssertEqual(ExhibitFormat.headline(for: titled), .title("Robin at dawn"))
  }

  private func makePhoto(
    title: String = "DSC_0001",
    dateTaken: String? = nil,
    exif: [String: JSONValue]?
  ) -> GalleryPhoto {
    GalleryPhoto(
      id: UUID().uuidString, title: title, description: "", originalUrl: "", thumbnailUrl: "",
      thumbHash: nil, aspectRatio: 1, width: 1, height: 1, format: nil, size: nil,
      dateTaken: dateTaken, video: nil, tags: [], exif: exif.map { GalleryExif(values: $0) },
      toneAnalysis: nil, location: nil, camera: nil, lens: nil, rating: nil, city: nil
    )
  }

  private func makePhoto(title: String, dateTaken: String?) -> GalleryPhoto {
    makePhoto(title: title, dateTaken: dateTaken, exif: nil)
  }
}
