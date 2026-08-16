import XCTest
@testable import Afilmory

final class PhotoPinchDismissalPolicyTests: XCTestCase {
  func testGestureStartedZoomedCannotBecomeDismissalAfterReturningToMinimum() {
    XCTAssertFalse(
      PhotoPinchDismissalPolicy.canBeginGesture(
        startZoomScale: 2,
        minimumZoomScale: 1
      )
    )
  }

  func testFreshGestureStartedAtMinimumCanBeginDismissal() {
    XCTAssertTrue(
      PhotoPinchDismissalPolicy.canBeginGesture(
        startZoomScale: 1,
        minimumZoomScale: 1
      )
    )
  }
}
