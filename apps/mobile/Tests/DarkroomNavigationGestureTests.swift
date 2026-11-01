@testable import Afilmory
import UIKit
import XCTest

@MainActor
final class DarkroomNavigationGestureTests: XCTestCase {
  private func navigation() -> UINavigationController {
    let navigation = UINavigationController()
    navigation.setViewControllers([UIViewController(), UIViewController()], animated: false)
    navigation.loadViewIfNeeded()
    return navigation
  }

  func testBackSwipeStartsAnywhere() {
    let navigation = navigation()
    let delegate = DarkroomNavigationDelegate(navigation: navigation)
    let mine = (navigation.view.gestureRecognizers ?? []).filter { $0.delegate === delegate }
    XCTAssertEqual(mine.count, 1)
    XCTAssertTrue(mine.first is UIPanGestureRecognizer)
    XCTAssertFalse(mine.first is UIScreenEdgePanGestureRecognizer)
  }

  func testBackSwipeOnlyTakesRightwardHorizontalDrags() {
    XCTAssertTrue(BackSwipeRule.isBackDrag(velocity: CGPoint(x: 400, y: 60)))
    XCTAssertFalse(BackSwipeRule.isBackDrag(velocity: CGPoint(x: -400, y: 0)))
    XCTAssertFalse(BackSwipeRule.isBackDrag(velocity: CGPoint(x: 100, y: 300)))
  }

  func testSystemPopGesturesAreHandedOverToTheDarkroomTransition() throws {
    let navigation = navigation()
    let delegate = DarkroomNavigationDelegate(navigation: navigation)
    XCTAssertFalse(try XCTUnwrap(navigation.interactivePopGestureRecognizer).isEnabled)
    XCTAssertEqual(navigation.interactiveContentPopGestureRecognizer?.isEnabled, false)
    withExtendedLifetime(delegate) {}
  }
}
