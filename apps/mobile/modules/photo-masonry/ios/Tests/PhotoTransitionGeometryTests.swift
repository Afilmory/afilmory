import XCTest
@testable import Afilmory

final class PhotoTransitionGeometryTests: XCTestCase {
  func testDismissDragFollowsTranslationBeforeRelease() {
    let state = PhotoTransitionGeometry.dismissalDragState(
      translation: CGPoint(x: 24, y: 170)
    )
    XCTAssertEqual(state.progress, 0.5, accuracy: 0.0001)
    XCTAssertEqual(state.transform.translation, CGPoint(x: 24, y: 170))
    XCTAssertEqual(state.transform.scale, 0.84, accuracy: 0.0001)
  }

  func testDismissDragContinuesPastCommitDistance() {
    let state = PhotoTransitionGeometry.dismissalDragState(
      translation: CGPoint(x: -18, y: 560)
    )
    XCTAssertEqual(state.progress, 1, accuracy: 0.0001)
    XCTAssertEqual(state.transform.translation, CGPoint(x: -18, y: 560))
    XCTAssertEqual(state.transform.scale, 0.68, accuracy: 0.0001)
  }

  func testPortraitTransform() throws {
    let result = try XCTUnwrap(
      PhotoTransitionGeometry.viewportTransform(
        imageFrame: CGRect(x: 101, y: 120, width: 200, height: 400),
        targetRect: CGRect(x: 20, y: 80, width: 120, height: 240),
        viewportBounds: CGRect(x: 0, y: 0, width: 402, height: 874),
        viewportCenter: CGPoint(x: 201, y: 437)
      )
    )
    XCTAssertEqual(result.scale, 0.6, accuracy: 0.0001)
    XCTAssertEqual(result.translation.x, -121, accuracy: 0.0001)
    XCTAssertEqual(result.translation.y, -166.8, accuracy: 0.0001)
  }

  func testLandscapeSquareAndExtremeAspectFit() throws {
    XCTAssertEqual(
      try XCTUnwrap(PhotoTransitionGeometry.aspectFitRect(aspectRatio: 2, in: CGRect(x: 0, y: 0, width: 400, height: 800))),
      CGRect(x: 0, y: 300, width: 400, height: 200)
    )
    XCTAssertEqual(
      try XCTUnwrap(PhotoTransitionGeometry.aspectFitRect(aspectRatio: 1, in: CGRect(x: 0, y: 0, width: 400, height: 800))),
      CGRect(x: 0, y: 200, width: 400, height: 400)
    )
    XCTAssertEqual(
      try XCTUnwrap(PhotoTransitionGeometry.aspectFitRect(aspectRatio: 0.1, in: CGRect(x: 0, y: 0, width: 400, height: 800))),
      CGRect(x: 160, y: 0, width: 80, height: 800)
    )
  }

  func testPartiallyOffscreenSource() throws {
    let result = try XCTUnwrap(
      PhotoTransitionGeometry.viewportTransform(
        imageFrame: CGRect(x: 0, y: 200, width: 402, height: 300),
        targetRect: CGRect(x: -50, y: -20, width: 180, height: 120),
        viewportBounds: CGRect(x: 0, y: 0, width: 402, height: 874),
        viewportCenter: CGPoint(x: 201, y: 437)
      )
    )
    XCTAssertTrue(result.scale.isFinite)
    XCTAssertTrue(result.translation.x.isFinite)
    XCTAssertTrue(result.translation.y.isFinite)
  }

  func testZeroSizeReturnsNil() {
    XCTAssertNil(
      PhotoTransitionGeometry.viewportTransform(
        imageFrame: .zero,
        targetRect: CGRect(x: 0, y: 0, width: 100, height: 100),
        viewportBounds: CGRect(x: 0, y: 0, width: 402, height: 874),
        viewportCenter: CGPoint(x: 201, y: 437)
      )
    )
    XCTAssertNil(PhotoTransitionGeometry.aspectFitRect(aspectRatio: 0, in: CGRect(x: 0, y: 0, width: 10, height: 10)))
  }
}
