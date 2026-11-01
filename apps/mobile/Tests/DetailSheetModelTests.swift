@testable import Afilmory
import XCTest

final class DetailSheetModelTests: XCTestCase {
  func testFilenameTitleShowsDateHeadlineWithTimeOfDay() {
    let model = DetailSheetModel.make(photo: photo(title: "DSC 7132"), number: 3, localeIdentifier: "en")
    XCTAssertEqual(model.headline, .date(large: "2026.07.26", italic: "\(ExhibitFormat.TimeOfDay.dawn.localizedName) 05:46"))
    XCTAssertEqual(model.number, "03")
  }

  func testRealTitleTakesTheLargeLineAndDateMovesToItalic() {
    let model = DetailSheetModel.make(photo: photo(title: " Robin at dawn "), number: 1, localeIdentifier: "en")
    XCTAssertEqual(model.headline, .title(large: "Robin at dawn", italic: "2026.07.26 · \(ExhibitFormat.TimeOfDay.dawn.localizedName) 05:46"))
  }

  func testUndatedFilenamePhotoFallsBackToFrameNumber() {
    let model = DetailSheetModel.make(photo: photo(title: "IMG_0001", date: nil), number: 12, localeIdentifier: "en")
    XCTAssertEqual(model.headline, .date(large: "No. 12", italic: nil))
  }

  func testBarePhotoHasOnlyTheFileSection() {
    let model = DetailSheetModel.make(photo: photo(title: "DSC_0001"), number: 1, localeIdentifier: "en")
    XCTAssertEqual(model.sections.map(\.id), ["file"])
    XCTAssertNil(model.exifLine)
    XCTAssertNil(model.gear)
    XCTAssertTrue(model.tags.isEmpty)
  }

  func testRichPhotoListsSectionsInSpecOrder() {
    let model = DetailSheetModel.make(photo: richPhoto(), number: 1, localeIdentifier: "en")
    XCTAssertEqual(
      model.sections.map(\.id),
      ["exposure", "file", "tone", "description", "rating", "location", "fuji-recipe", "attribution"]
    )
    XCTAssertEqual(model.gear, "Nikon Z f · NIKKOR Z 600mm f/6.3 VR S")
    XCTAssertEqual(model.exifLine, "600mm  f/6.3  1/250s  ISO 1400  ±0 EV")
    XCTAssertEqual(model.tags, ["旅鸫", "bird"])
  }

  func testToneSectionCarriesPercentValues() throws {
    let model = DetailSheetModel.make(photo: richPhoto(), number: 1, localeIdentifier: "en")
    let tone = try XCTUnwrap(model.sections.first { $0.id == "tone" })
    guard case .tone(_, let values) = tone else { return XCTFail("expected tone") }
    XCTAssertEqual(values.map(\.percent), [48, 38, 22, 17])
  }

  func testLocationSectionKeepsCoordinates() throws {
    let model = DetailSheetModel.make(photo: richPhoto(), number: 1, localeIdentifier: "en")
    let location = try XCTUnwrap(model.sections.first { $0.id == "location" })
    guard case .location(let latitude, let longitude, _) = location else { return XCTFail("expected location") }
    XCTAssertEqual(latitude, 32.05, accuracy: 0.001)
    XCTAssertEqual(longitude, 118.78, accuracy: 0.001)
  }

  func testFileChipsIncludeFormatDimensionsAndFilename() throws {
    let model = DetailSheetModel.make(photo: richPhoto(), number: 1, localeIdentifier: "en")
    let file = try XCTUnwrap(model.sections.first { $0.id == "file" })
    guard case .file(let chips) = file else { return XCTFail("expected file") }
    XCTAssertTrue(chips.contains("JPG"))
    XCTAssertTrue(chips.contains("4000 × 6000"))
    XCTAssertTrue(chips.contains("DSC_7132"))
  }

  private func photo(title: String, date: String? = "2026-07-26T05:46:00") -> GalleryPhoto {
    GalleryPhoto(
      id: "p", title: title, description: "", originalUrl: "", thumbnailUrl: "",
      thumbHash: nil, aspectRatio: 1, width: 0, height: 0, format: nil, size: nil,
      dateTaken: date, video: nil, tags: [], exif: nil,
      toneAnalysis: nil, location: nil, camera: nil, lens: nil, rating: nil, city: nil
    )
  }

  private func richPhoto() -> GalleryPhoto {
    GalleryPhoto(
      id: "DSC_7132", title: "DSC_7132", description: "A robin before sunrise.", originalUrl: "", thumbnailUrl: "",
      thumbHash: nil, aspectRatio: 0.6667, width: 4000, height: 6000, format: "jpg", size: 14_186_918,
      dateTaken: "2026-07-26T05:46:00", video: nil, tags: ["旅鸫", "bird"],
      exif: GalleryExif(values: [
        "Make": .string("NIKON CORPORATION"),
        "Model": .string("NIKON Z f"),
        "LensModel": .string("NIKKOR Z 600mm f/6.3 VR S"),
        "FocalLength": .string("600.0 mm"),
        "FNumber": .number(6.3),
        "ExposureTime": .string("1/250"),
        "ISO": .number(1400),
        "ExposureCompensation": .number(0),
        "ExposureProgram": .string("Shutter speed priority AE"),
        "MeteringMode": .string("Multi-segment"),
        "WhiteBalance": .string("Auto"),
        "ColorSpace": .string("sRGB"),
        "Artist": .string("Innei"),
        "GPSLatitude": .number(32.05),
        "GPSLongitude": .number(118.78),
        "FujiRecipe": .object(["FilmMode": .string("Classic Chrome"), "HighlightTone": .string("-1")]),
      ]),
      toneAnalysis: GalleryToneAnalysis(toneType: "normal", brightness: 48, contrast: 38, shadowRatio: 0.22, highlightRatio: 0.17),
      location: nil, camera: nil, lens: nil, rating: 4, city: nil
    )
  }
}
