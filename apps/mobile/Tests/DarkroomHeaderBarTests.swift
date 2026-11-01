@testable import Afilmory
import XCTest

final class DarkroomHeaderBarTests: XCTestCase {
  func testSubpageChromeStaysClearAtRest() {
    XCTAssertFalse(DarkroomHeaderBar.showsChrome(contentOffsetY: -100, adjustedTopInset: 100))
  }

  func testSubpageChromeAppearsOnceContentScrollsUnder() {
    XCTAssertTrue(DarkroomHeaderBar.showsChrome(contentOffsetY: -80, adjustedTopInset: 100))
  }
}
