import XCTest
@testable import Afilmory

final class PhotoHeaderModelTests: XCTestCase {
  func testMatchesHermesGoldenModels() throws {
    let language = NativeFixtureLanguage.current
    let photos = try NativeFixtureTestSupport.decode([GalleryPhoto].self, name: "expected-normalized")
    let strings = PhotoHeaderStrings(
      fallbackTitle: String(localized: "Photo"),
      today: String(localized: "Today"),
      yesterday: String(localized: "Yesterday")
    )
    let actual = photos.map { photo in
      ExpectedLocalizedModel(
        id: photo.id,
        model: PhotoHeaderModel.build(
          photo: photo,
          localeIdentifier: PhotoDateLanguage.activeLocaleIdentifier,
          strings: strings,
          now: NativeFixtureTestSupport.fixedNow,
          timeZone: NativeFixtureTestSupport.singapore
        )
      )
    }
    let expected = try NativeFixtureTestSupport.decode(
      [ExpectedLocalizedModel<PhotoHeaderModel>].self,
      name: "expected-header-\(language)"
    )
    XCTAssertEqual(actual.count, expected.count, language)
    for (actualRow, expectedRow) in zip(actual, expected) where actualRow != expectedRow {
      XCTFail(
        "\(language) \(actualRow.id) \(try NativeFixtureTestSupport.firstDifference(actualRow, expectedRow))"
      )
      break
    }
  }
}
