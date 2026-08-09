import XCTest
@testable import Afilmory

final class LocalizationTests: XCTestCase {
  func testResolvesLanguageTags() {
    XCTAssertEqual(LanguageTag.resolve("zh-Hant-TW"), .traditionalChinese)
    XCTAssertEqual(LanguageTag.resolve("zh-MO"), .hongKongChinese)
    XCTAssertEqual(LanguageTag.resolve("ja-JP"), .japanese)
    XCTAssertEqual(LanguageTag.resolve("ko_KR"), .korean)
    XCTAssertEqual(LanguageTag.resolve("fr-FR"), .english)
  }

  func testInterpolatesAndUsesEnglishFallback() {
    let localization = Localization(language: .japanese)
    XCTAssertFalse(localization.value("accessibility.profile", arguments: ["name": "Afilmory"]).contains("{{name}}"))
    XCTAssertEqual(localization.value("missing.fixture.key"), "missing.fixture.key")
  }

  func testMobileCatalogOverridesAppCatalog() {
    XCTAssertEqual(Localization(language: .english).value("comments.cancelReply"), "Cancel reply")
  }

  func testChineseCountOneUsesOtherPlural() {
    let localization = Localization(language: .simplifiedChinese)
    let expected = localization.value("accessibility.filtersActive_other", arguments: ["count": "1"])
    XCTAssertEqual(localization.value("accessibility.filtersActive", count: 1), expected)
    XCTAssertEqual(PluralRule.category(language: .simplifiedChinese, count: 1), .other)
    XCTAssertEqual(PluralRule.category(language: .japanese, count: 1), .other)
    XCTAssertEqual(PluralRule.category(language: .korean, count: 1), .other)
    XCTAssertEqual(PluralRule.category(language: .english, count: 1), .one)
  }

  func testSearchAndDirectoryCopyIsAvailableToNativeScreens() {
    let english = Localization(language: .english)
    let simplifiedChinese = Localization(language: .simplifiedChinese)

    XCTAssertEqual(english.value("gallery.query.results", count: 2), "2 matching photos")
    XCTAssertEqual(english.value("explore.search.placeholder"), "Search galleries")
    XCTAssertEqual(simplifiedChinese.value("action.search.unified.title"), "搜索和筛选")
    XCTAssertEqual(simplifiedChinese.value("gallery.query.clearAll"), "清除搜索和筛选")
  }
}
