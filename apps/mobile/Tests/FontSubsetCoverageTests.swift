import CoreText
import UIKit
import XCTest
@testable import Afilmory

final class FontSubsetCoverageTests: XCTestCase {
  func testDisplayKeysListIsBundled() throws {
    XCTAssertFalse(try AFDisplayStrings.keys().isEmpty)
  }

  func testEveryDisplayStringCharacterIsCoveredByItsRegionSubset() throws {
    let keys = try AFDisplayStrings.keys()
    for region in AFFont.CJKRegion.allCases {
      let bundle = try XCTUnwrap(AFDisplayStrings.bundle(for: region.language), region.language)
      let font = CTFontCreateWithName(region.postScriptName as CFString, 12, nil)
      for key in keys {
        let value = bundle.localizedString(forKey: key, value: nil, table: nil)
        XCTAssertNotEqual(value, key, "\(region.language) has no translation for \(key)")
        for scalar in value.unicodeScalars where scalar.value > 0x2E7F {
          var characters = Array(String(scalar).utf16)
          var glyphs = [CGGlyph](repeating: 0, count: characters.count)
          let covered = CTFontGetGlyphsForCharacters(font, &characters, &glyphs, characters.count)
          XCTAssertTrue(covered, "\(region.postScriptName) is missing \(scalar) from \(key)")
        }
      }
    }
  }

  func testEverySheetTitleIsSubsetForTheExhibitFace() throws {
    let keys = Set(try AFDisplayStrings.keys())
    let titles = [
      "Account", "Review · %lld", "Search & Filter", "Sign in with email", "Comments", "Comments · %lld",
      "Custom domains are not included", "Library is full", "Monthly photo limit reached", "Storage is full",
      "File is too large", "Plan limit reached",
    ]
    for title in titles {
      XCTAssertTrue(keys.contains(title), "\(title) is drawn in the exhibit face but missing from display-keys.json")
    }
  }

  func testExhibitFaceSetsTitlesAtABookLineHeight() {
    let font = AFFont.exhibit(size: 34, language: "en")
    XCTAssertLessThanOrEqual(font.lineHeight, 34 * 1.25)
    XCTAssertGreaterThanOrEqual(font.lineHeight, 34 * 1.1)
  }
}
