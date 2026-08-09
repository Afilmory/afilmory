import XCTest
@testable import Afilmory

final class PhotoHeaderModelTests: XCTestCase {
  func testMatchesHermesGoldenModelsInEveryLanguage() throws {
    let photos = try NativeFixtureTestSupport.decode([GalleryPhoto].self, name: "expected-normalized")
    for language in LanguageTag.allCases {
      let localization = Localization(language: language)
      let strings = PhotoHeaderStrings(
        fallbackTitle: localization.value("page.photo"),
        today: localization.value("photo.captureDay.today"),
        yesterday: localization.value("photo.captureDay.yesterday")
      )
      let actual = photos.map { photo in
        ExpectedLocalizedModel(
          id: photo.id,
          model: PhotoHeaderModel.build(
            photo: photo,
            localeIdentifier: language.localeIdentifier,
            strings: strings,
            now: NativeFixtureTestSupport.fixedNow,
            timeZone: NativeFixtureTestSupport.singapore
          )
        )
      }
      let expected = try NativeFixtureTestSupport.decode(
        [ExpectedLocalizedModel<PhotoHeaderModel>].self,
        name: "expected-header-\(language.rawValue)"
      )
      XCTAssertEqual(actual.count, expected.count, language.rawValue)
      for (actualRow, expectedRow) in zip(actual, expected) where actualRow != expectedRow {
        XCTFail(
          "\(language.rawValue) \(actualRow.id) \(try NativeFixtureTestSupport.firstDifference(actualRow, expectedRow))"
        )
        break
      }
    }
  }
}
