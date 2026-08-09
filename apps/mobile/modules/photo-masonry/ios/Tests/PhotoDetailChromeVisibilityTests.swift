import XCTest
@testable import Afilmory

final class PhotoDetailChromeVisibilityTests: XCTestCase {
  func testHarnessRuns() {
    XCTAssertTrue(true)
  }

  func testChromeVisibilityDerivationTable() {
    let cases: [(PhotoDetailChromeVisibility, CGFloat, CGFloat, Bool)] = [
      (.init(userHidden: false, infoProgress: 0, zoomed: false), 1, 1, false),
      (.init(userHidden: false, infoProgress: 0.4, zoomed: false), 0.6, 1, false),
      (.init(userHidden: true, infoProgress: 0, zoomed: false), 0, 0, true),
      (.init(userHidden: false, infoProgress: 0, zoomed: true), 0, 0, true),
      (.init(userHidden: false, infoProgress: 2, zoomed: false), 0, 1, false),
    ]

    for (visibility, expectedNavigationAlpha, expectedToolbarAlpha, expectedStatusBarHidden) in cases {
      XCTAssertEqual(visibility.navBarAlpha, expectedNavigationAlpha, accuracy: 0.001)
      XCTAssertEqual(visibility.toolbarAlpha, expectedToolbarAlpha, accuracy: 0.001)
      XCTAssertEqual(visibility.statusBarHidden, expectedStatusBarHidden)
    }
  }
}
