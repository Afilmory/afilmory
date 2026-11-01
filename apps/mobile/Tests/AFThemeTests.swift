import UIKit
import XCTest
@testable import Afilmory

final class AFThemeTests: XCTestCase {
  func testColorTokensMatchSpec() {
    XCTAssertEqual(AFColor.ground.hexString, "#0E0D0C")
    XCTAssertEqual(AFColor.raised.hexString, "#141311")
    XCTAssertEqual(AFColor.sheet.hexString, "#161513")
    XCTAssertEqual(AFColor.filmBase.hexString, "#1C1A17")
    XCTAssertEqual(AFColor.fill.hexString, "#22201D")
    XCTAssertEqual(AFColor.tick.hexString, "#3A3733")
    XCTAssertEqual(AFColor.textPrimary.hexString, "#EDE9E3")
    XCTAssertEqual(AFColor.textSecondary.hexString, "#B5B0A8")
    XCTAssertEqual(AFColor.textTertiary.hexString, "#8C877F")
    XCTAssertEqual(AFColor.destructive.hexString, "#FF8A7E")
    XCTAssertEqual(AFColor.accentFallback.hexString, "#EDE9E3")
  }

  func testRadiusTokens() {
    XCTAssertEqual(AFRadius.sheet, 47)
    XCTAssertEqual(AFRadius.card, 28)
    XCTAssertEqual(AFRadius.mosaic, 14)
    XCTAssertEqual(AFRadius.thumb, 12)
  }

  func testScholaFacesAreRegistered() {
    XCTAssertEqual(AFFont.schola(size: 20).fontName, "TeXGyreSchola-Regular")
    XCTAssertEqual(AFFont.schola(size: 20, italic: true).fontName, "TeXGyreSchola-Italic")
  }

  func testCJKSerifRegionForLanguage() {
    XCTAssertEqual(AFFont.cjkSerifRegion(for: "zh-Hans"), .sc)
    XCTAssertEqual(AFFont.cjkSerifRegion(for: "zh-Hant"), .tc)
    XCTAssertEqual(AFFont.cjkSerifRegion(for: "zh-HK"), .hk)
    XCTAssertEqual(AFFont.cjkSerifRegion(for: "ja"), .jp)
    XCTAssertEqual(AFFont.cjkSerifRegion(for: "ko"), .kr)
    XCTAssertNil(AFFont.cjkSerifRegion(for: "en"))
  }

  func testEveryRegionSubsetIsRegistered() {
    for region in AFFont.CJKRegion.allCases {
      XCTAssertNotNil(UIFont(name: region.postScriptName, size: 12), region.postScriptName)
    }
  }

  func testExhibitFontCascadesToCJKSerifForAppStrings() {
    let font = AFFont.exhibit(size: 24, language: "zh-Hans")
    let cascade = font.fontDescriptor.object(forKey: .cascadeList) as? [UIFontDescriptor] ?? []
    XCTAssertEqual(font.fontName, "TeXGyreSchola-Regular")
    XCTAssertEqual(cascade.first?.postscriptName, AFFont.CJKRegion.sc.postScriptName)
  }

  func testUserTextFontHasNoCJKSerifCascade() {
    let font = AFFont.exhibitUser(size: 24)
    let cascade = font.fontDescriptor.object(forKey: .cascadeList) as? [UIFontDescriptor] ?? []
    XCTAssertTrue(cascade.allSatisfy { !($0.postscriptName.hasPrefix("SourceHanSerif")) })
  }
}
