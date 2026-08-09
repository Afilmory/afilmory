import XCTest
@testable import Afilmory

final class PhotoInfoModelTests: XCTestCase {
  func testMatchesHermesGoldenModels() throws {
    let language = NativeFixtureLanguage.current
    let photos = try NativeFixtureTestSupport.decode([GalleryPhoto].self, name: "expected-normalized")
    let actual = photos.map { photo in
      ExpectedLocalizedModel(
        id: photo.id,
        model: PhotoInfoModel.build(
          photo: photo,
          localeIdentifier: PhotoDateLanguage.activeLocaleIdentifier,
          timeZone: NativeFixtureTestSupport.singapore
        )
      )
    }
    let expected = try NativeFixtureTestSupport.decode(
      [ExpectedLocalizedModel<PhotoInfoSheetModel>].self,
      name: "expected-info-\(language)"
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
