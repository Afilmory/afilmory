import XCTest
@testable import Afilmory

final class PhotoInfoModelTests: XCTestCase {
  func testMatchesHermesGoldenModelsInEveryLanguage() throws {
    let photos = try NativeFixtureTestSupport.decode([GalleryPhoto].self, name: "expected-normalized")
    for language in LanguageTag.allCases {
      let localization = Localization(language: language)
      let actual = photos.map { photo in
        ExpectedLocalizedModel(
          id: photo.id,
          model: PhotoInfoModel.build(
            photo: photo,
            localization: localization,
            localeIdentifier: language.localeIdentifier,
            timeZone: NativeFixtureTestSupport.singapore
          )
        )
      }
      let expected = try NativeFixtureTestSupport.decode(
        [ExpectedLocalizedModel<PhotoInfoSheetModel>].self,
        name: "expected-info-\(language.rawValue)"
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
