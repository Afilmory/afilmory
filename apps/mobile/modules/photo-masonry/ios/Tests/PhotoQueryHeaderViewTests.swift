import UIKit
import XCTest
@testable import Afilmory

@MainActor
final class PhotoQueryHeaderViewTests: XCTestCase {
  func testLongChipTitleUsesOneLineAndItsNaturalWidth() throws {
    let header = PhotoQueryHeaderView(
      frame: CGRect(x: 0, y: 0, width: 390, height: 292)
    )
    header.traitOverrides.preferredContentSizeCategory = .accessibilityExtraExtraExtraLarge
    header.configure(
      PhotoQueryHeaderModel(
        resultText: "2 matching photos",
        headline: "“IMG” · Apple iPhone 15",
        editTitle: "Edit",
        editAccessibilityLabel: "Edit filters",
        clearTitle: "Clear",
        clearAccessibilityLabel: "Clear filters",
        photos: [],
        chips: [
          PhotoQueryHeaderChip(id: "query", title: "“IMG”", constraint: .query),
          PhotoQueryHeaderChip(
            id: "camera-Apple iPhone 15",
            title: "Apple iPhone 15",
            constraint: .camera("Apple iPhone 15")
          ),
        ]
      )
    )

    header.layoutIfNeeded()

    let button = try XCTUnwrap(
      header.descendants
        .compactMap { $0 as? UIButton }
        .first { $0.accessibilityIdentifier == "photo-query-chip-camera-Apple iPhone 15" }
    )
    button.layoutIfNeeded()

    let titleLabel = try XCTUnwrap(button.titleLabel)
    let title = try XCTUnwrap(titleLabel.text)
    let font = try XCTUnwrap(titleLabel.font)
    let naturalTitleWidth = ceil(
      (title as NSString).size(withAttributes: [.font: font]).width
    )

    XCTAssertEqual(titleLabel.numberOfLines, 1)
    XCTAssertEqual(titleLabel.lineBreakMode, .byClipping)
    XCTAssertEqual(font.pointSize, 14, accuracy: 0.01)
    XCTAssertGreaterThanOrEqual(titleLabel.bounds.width + 1, naturalTitleWidth)
    XCTAssertLessThanOrEqual(titleLabel.bounds.height, ceil(font.lineHeight) + 1)
  }
}

private extension UIView {
  var descendants: [UIView] {
    subviews + subviews.flatMap(\.descendants)
  }
}
