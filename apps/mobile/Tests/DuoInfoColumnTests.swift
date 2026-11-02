@testable import Afilmory
import UIKit
import XCTest

@MainActor
final class DuoInfoColumnTests: XCTestCase {
  private static func photo(title: String = "Night train") -> GalleryPhoto {
    GalleryPhoto(
      id: "a", title: title, description: "", originalUrl: "", thumbnailUrl: "",
      thumbHash: nil, aspectRatio: 1.5, width: 3, height: 2, format: nil, size: nil,
      dateTaken: "2026-07-19T23:13:00", video: nil, tags: ["street", " "],
      exif: GalleryExif(values: [
        "FocalLength": .number(35),
        "FNumber": .number(1.8),
        "ExposureTime": .number(1.0 / 60),
        "ISO": .number(3200),
        "ExposureCompensation": .number(-0.3),
        "Make": .string("NIKON CORPORATION"),
        "Model": .string("Z f"),
      ]),
      toneAnalysis: GalleryToneAnalysis(toneType: "low-key", brightness: 30, contrast: 40, shadowRatio: 0.5, highlightRatio: 0.1),
      location: GalleryLocation(latitude: 35.6, longitude: 139.7, country: nil, city: "Tokyo", locationName: nil),
      camera: nil, lens: nil, rating: nil, city: nil
    )
  }

  func testExposureValuesCarryTheirOwnLabels() {
    let model = DuoInfoModel.make(photo: Self.photo(), number: 2, localeIdentifier: "en")
    XCTAssertEqual(model.exposure.prefix(5).map(\.value), ["35mm", "f/1.8", "1/60s", "ISO 3200", "−0.3 EV"])
    XCTAssertEqual(model.exposure.prefix(5).map(\.label), [
      String(localized: "Focal Length"), String(localized: "Aperture"), String(localized: "Shutter"),
      String(localized: "Sensitivity"), String(localized: "Exposure Comp."),
    ])
  }

  func testHeaderReadsNumberTitleThenDateTimePlaceAndCamera() {
    let model = DuoInfoModel.make(photo: Self.photo(), number: 2, localeIdentifier: "en")
    XCTAssertEqual(model.number, "02")
    XCTAssertEqual(model.title, "Night train")
    XCTAssertEqual(model.meta, "2026.07.19 · \(ExhibitFormat.TimeOfDay.night.localizedName) 23:13 · Tokyo · Nikon Z f")
    XCTAssertEqual(model.tags, ["street"])
    XCTAssertEqual(model.place, "Tokyo")
    XCTAssertTrue(model.hasLocation)
  }

  func testUntitledPhotosLeadWithTheirDate() {
    let model = DuoInfoModel.make(photo: Self.photo(title: "DSC_0001"), number: 2, localeIdentifier: "en")
    XCTAssertEqual(model.title, "2026.07.19")
    XCTAssertEqual(model.meta, "\(ExhibitFormat.TimeOfDay.night.localizedName) 23:13 · Tokyo · Nikon Z f")
  }

  func testTheColumnReadsTopDownLikeTheBoard() {
    let column = DetailInfoColumn()
    column.frame = CGRect(x: 0, y: 0, width: 406, height: 669)
    column.configure(model: DuoInfoModel.make(photo: Self.photo(), number: 2, localeIdentifier: "en"), accent: .orange, commentsEnabled: true)
    column.layoutIfNeeded()
    XCTAssertEqual(column.sectionOrder, ["header", "tags", "exposure", "tone", "file", "location", "comments"])
    XCTAssertEqual(column.exposureColumns, 3)
    column.frame.size.width = 272
    column.layoutIfNeeded()
    XCTAssertEqual(column.exposureColumns, 2)
  }

  func testTheRowsCallBack() {
    let column = DetailInfoColumn()
    column.configure(model: DuoInfoModel.make(photo: Self.photo(), number: 2, localeIdentifier: "en"), accent: .orange, commentsEnabled: true)
    var opened: [String] = []
    column.onOpenLocation = { opened.append("location") }
    column.onOpenComments = { opened.append("comments") }
    column.locationRow?.sendActions(for: .touchUpInside)
    column.commentsRow?.sendActions(for: .touchUpInside)
    XCTAssertEqual(opened, ["location", "comments"])
  }

  func testTheCommentsColumnUsesTheFlatList() {
    var request = PhotoCommentsSheetRequest()
    request.gallerySlug = "duo"
    let column = DetailCommentsColumn(store: CommentsStore(request: request))
    XCTAssertEqual(column.host.rootView.style, .flat)
  }
}
