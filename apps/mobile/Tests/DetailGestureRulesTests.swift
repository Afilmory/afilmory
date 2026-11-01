@testable import Afilmory
import XCTest

final class DetailGestureRulesTests: XCTestCase {
  func testCollapsedSheetAllowsPagingZoomAndDismiss() {
    let rules = DetailGestureRules(detent: .collapsed, isZoomed: false)
    XCTAssertTrue(rules.pagingEnabled)
    XCTAssertTrue(rules.zoomEnabled)
    XCTAssertTrue(rules.dismissEnabled)
    XCTAssertTrue(rules.chromeVisible)
  }

  func testExpandedSheetDisablesPagingAndDismissUntilCollapsed() {
    let rules = DetailGestureRules(detent: .expanded, isZoomed: false)
    XCTAssertFalse(rules.pagingEnabled)
    XCTAssertFalse(rules.dismissEnabled)
    XCTAssertFalse(rules.zoomEnabled)
    XCTAssertTrue(rules.chromeVisible)
  }

  func testZoomHidesSheetAndChipsAndLocksPaging() {
    let rules = DetailGestureRules(detent: .collapsed, isZoomed: true)
    XCTAssertFalse(rules.chromeVisible)
    XCTAssertFalse(rules.pagingEnabled)
    XCTAssertFalse(rules.dismissEnabled)
    XCTAssertTrue(rules.zoomEnabled)
  }

  func testZoomingBackOutRestoresChrome() {
    var rules = DetailGestureRules(detent: .collapsed, isZoomed: true)
    rules.isZoomed = false
    XCTAssertTrue(rules.chromeVisible)
    XCTAssertTrue(rules.pagingEnabled)
  }

  func testZoomDetectionToleratesFloatNoise() {
    XCTAssertFalse(DetailGestureRules.isZoomed(scale: 1.0001))
    XCTAssertTrue(DetailGestureRules.isZoomed(scale: 1.05))
  }

  func testDismissDragDecision() {
    XCTAssertTrue(DetailGestureRules.shouldDismiss(translation: 140, velocity: 0, height: 844))
    XCTAssertTrue(DetailGestureRules.shouldDismiss(translation: 30, velocity: 900, height: 844))
    XCTAssertFalse(DetailGestureRules.shouldDismiss(translation: 60, velocity: 100, height: 844))
    XCTAssertFalse(DetailGestureRules.shouldDismiss(translation: -200, velocity: -900, height: 844))
  }

  func testSheetDetentSnapping() {
    XCTAssertEqual(DetailGestureRules.detent(afterDragFrom: .collapsed, translation: -120, velocity: 0), .expanded)
    XCTAssertEqual(DetailGestureRules.detent(afterDragFrom: .collapsed, translation: -20, velocity: -800), .expanded)
    XCTAssertEqual(DetailGestureRules.detent(afterDragFrom: .collapsed, translation: -30, velocity: 0), .collapsed)
    XCTAssertEqual(DetailGestureRules.detent(afterDragFrom: .expanded, translation: 160, velocity: 0), .collapsed)
    XCTAssertEqual(DetailGestureRules.detent(afterDragFrom: .expanded, translation: 20, velocity: 900), .collapsed)
    XCTAssertEqual(DetailGestureRules.detent(afterDragFrom: .expanded, translation: 40, velocity: 0), .expanded)
  }

  func testPhotoPanOnlyRaisesTheSheetWhileMovingUp() {
    XCTAssertEqual(DetailGestureRules.photoPanSheetProgress(translationY: -130), 0.5, accuracy: 0.001)
    XCTAssertEqual(DetailGestureRules.photoPanSheetProgress(translationY: -600), 1, accuracy: 0.001)
    XCTAssertEqual(DetailGestureRules.photoPanSheetProgress(translationY: 0), 0, accuracy: 0.001)
    XCTAssertEqual(DetailGestureRules.photoPanSheetProgress(translationY: 40), 0, accuracy: 0.001)
  }
}

