import XCTest
@testable import Afilmory

final class PhotoFilterEngineTests: XCTestCase {
  private struct Fixture: Decodable {
    struct Case: Decodable {
      let name: String
      let filters: PhotoFilters
      let ids: [String]
    }

    let cases: [Case]
    let options: PhotoFilterOptions
  }

  func testMatchesGoldenFilterCases() throws {
    let photos = try NativeFixtureTestSupport.decode([GalleryPhoto].self, name: "expected-normalized")
    let fixture = try NativeFixtureTestSupport.decode(Fixture.self, name: "expected-filters")
    XCTAssertEqual(PhotoFilterEngine.buildOptions(photos), fixture.options)
    for entry in fixture.cases {
      XCTAssertEqual(PhotoFilterEngine.apply(entry.filters, to: photos).map(\.id), entry.ids, entry.name)
    }
  }

  func testPresetRangeUsesInjectedNow() {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = NativeFixtureTestSupport.singapore
    let range = PhotoFilterEngine.presetRange(
      .last7,
      now: NativeFixtureTestSupport.fixedNow,
      calendar: calendar
    )
    XCTAssertEqual(range.from, "2026-07-28")
    XCTAssertEqual(range.to, "2026-08-03")
  }

  func testSearchMatchesPublicPhotoMetadataWithAllTerms() {
    let photos = [
      NativeFixtureTestSupport.photo(
        id: "lake-dawn",
        title: "Café at Dawn",
        description: "Quiet shoreline",
        camera: "Fujifilm X-T5",
        lens: "XF 23mm",
        tags: ["Travel", "Blue Hour"],
        city: "Zürich",
        country: "Switzerland",
        locationName: "Lake Promenade"
      ),
      NativeFixtureTestSupport.photo(id: "forest", title: "Forest Walk", tags: ["Travel"]),
    ]

    XCTAssertEqual(
      PhotoFilterEngine.apply(PhotoFilters(query: "cafe zURICH"), to: photos).map(\.id),
      ["lake-dawn"]
    )
    XCTAssertEqual(
      PhotoFilterEngine.apply(PhotoFilters(query: "fujifilm blue"), to: photos).map(\.id),
      ["lake-dawn"]
    )
    XCTAssertEqual(
      PhotoFilterEngine.apply(PhotoFilters(query: "quiet promenade"), to: photos).map(\.id),
      ["lake-dawn"]
    )
  }

  func testSearchComposesWithStructuredFilters() {
    let photos = [
      NativeFixtureTestSupport.photo(id: "one", title: "Night Market", rating: 5, tags: ["Street"]),
      NativeFixtureTestSupport.photo(id: "two", title: "Night Market", rating: 3, tags: ["Street"]),
      NativeFixtureTestSupport.photo(id: "three", title: "Night Train", rating: 5, tags: ["Travel"]),
    ]
    let filters = PhotoFilters(query: "night market", tags: ["Street"], minRating: 4)

    XCTAssertEqual(PhotoFilterEngine.apply(filters, to: photos).map(\.id), ["one"])
    XCTAssertEqual(PhotoFilterEngine.countActiveDimensions(filters), 3)
  }
}
