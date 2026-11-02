@testable import Afilmory
import UIKit
import XCTest

@MainActor
final class ContactSheetRowScrollTests: XCTestCase {
  func testRowStripScrollsOnlyHorizontallyAfterTheCellShrinks() throws {
    let cell = ContactSheetRowCell(frame: CGRect(x: 0, y: 0, width: 375, height: 300))
    cell.layoutIfNeeded()
    cell.configure(groups: [], level: .year, photos: [:])
    cell.frame = CGRect(x: 0, y: 0, width: 375, height: 120)
    cell.layoutIfNeeded()
    let scroller = try XCTUnwrap(cell.contentView.subviews.compactMap { $0 as? UIScrollView }.first)
    let inset = scroller.adjustedContentInset
    XCTAssertLessThanOrEqual(scroller.contentSize.height + inset.top + inset.bottom, scroller.bounds.height)
    XCTAssertFalse(scroller.alwaysBounceVertical)
  }
}
