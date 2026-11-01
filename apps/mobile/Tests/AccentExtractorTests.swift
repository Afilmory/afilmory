@testable import Afilmory
import UIKit
import XCTest

final class AccentExtractorTests: XCTestCase {
  private func fixture(_ name: String) throws -> UIImage {
    let photoID = ["robin": "DSC_7132", "hydrangea": "DSCF2853", "night": "IMG_20251111_002156"][name] ?? name
    let url = try XCTUnwrap(
      Bundle.main.url(forResource: "thumb-\(photoID)", withExtension: "jpg"),
      "Fixture media missing — run apps/mobile/scripts/fixture-media.sh"
    )
    return try XCTUnwrap(UIImage(contentsOfFile: url.path))
  }

  private func hue(_ color: UIColor) -> CGFloat {
    var hue: CGFloat = 0
    color.getHue(&hue, saturation: nil, brightness: nil, alpha: nil)
    return hue * 360
  }

  func testRobinPicksWarmBreastWithinContrastWindow() throws {
    let accent = AccentExtractor.accent(for: try fixture("robin"))
    XCTAssertTrue((10...45).contains(hue(accent)), "hue \(hue(accent)) \(accent.hexString)")
    let ratio = AccentExtractor.contrastRatio(accent, AFColor.ground)
    XCTAssertGreaterThanOrEqual(ratio, 4.8)
    XCTAssertLessThanOrEqual(ratio, 9.5)
  }

  func testHydrangeaPicksBlue() throws {
    let accent = AccentExtractor.accent(for: try fixture("hydrangea"))
    XCTAssertTrue((195...235).contains(hue(accent)), "hue \(hue(accent)) \(accent.hexString)")
  }

  func testDesaturatedImageFallsBackToWarmWhite() throws {
    XCTAssertEqual(AccentExtractor.accentHex(for: try fixture("night")), "#EDE9E3")
  }

  func testFlatGreyFallsBack() {
    let image = UIGraphicsImageRenderer(size: CGSize(width: 32, height: 32)).image { context in
      UIColor(white: 0.5, alpha: 1).setFill()
      context.fill(CGRect(x: 0, y: 0, width: 32, height: 32))
    }
    XCTAssertEqual(AccentExtractor.accentHex(for: image), "#EDE9E3")
  }

  func testContrastRatioMatchesWCAG() {
    XCTAssertEqual(AccentExtractor.contrastRatio(.white, .black), 21, accuracy: 0.01)
  }
}
