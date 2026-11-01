@testable import Afilmory
import UIKit
import XCTest

@MainActor
final class ViewingFocusRestoreTests: XCTestCase {
  func testAppearingAfterAnInteractivePopLeavesViewingFullyFocused() {
    AFMotion.reduceMotionOverride = true
    defer { AFMotion.reduceMotionOverride = nil }
    let viewing = ViewingController(isVisitor: true, onRequestSignIn: {})
    viewing.loadViewIfNeeded()
    viewing.view.transform = CGAffineTransform(scaleX: 0.95, y: 0.95)
    viewing.view.alpha = 0.4

    viewing.viewDidAppear(false)

    XCTAssertEqual(viewing.view.transform, .identity)
    XCTAssertEqual(viewing.view.alpha, 1, accuracy: 0.001)
  }
}
