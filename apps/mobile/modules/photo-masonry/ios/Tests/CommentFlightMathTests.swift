import XCTest
@testable import Afilmory

final class CommentFlightMathTests: XCTestCase {
  func testMorphBeginsAtTheCompleteComposerRectAndEndsAtTheBubbleRect() {
    let origin = CGRect(x: 12, y: 500, width: 360, height: 40)
    let target = CGRect(x: 180, y: 320, width: 120, height: 44)

    let start = CommentFlightMath.interpolatedRect(
      from: origin,
      to: target,
      horizontalProgress: 0,
      verticalProgress: 0,
      boundsProgress: 0
    )
    let end = CommentFlightMath.interpolatedRect(
      from: origin,
      to: target,
      horizontalProgress: 1,
      verticalProgress: 1,
      boundsProgress: 1
    )

    XCTAssertEqual(start, origin)
    XCTAssertEqual(end, target)
  }

  func testIndependentPositionChannelsAllowHorizontalMotionBeforeVerticalMotion() {
    let origin = CGRect(x: 12, y: 500, width: 360, height: 40)
    let target = CGRect(x: 250, y: 320, width: 120, height: 44)

    let inFlight = CommentFlightMath.interpolatedRect(
      from: origin,
      to: target,
      horizontalProgress: 0.4,
      verticalProgress: 0,
      boundsProgress: 0.4
    )

    XCTAssertGreaterThan(inFlight.minX, origin.minX)
    XCTAssertLessThan(inFlight.minX, target.minX)
    XCTAssertLessThan(inFlight.width, origin.width)
    XCTAssertGreaterThan(inFlight.width, target.width)
    XCTAssertEqual(inFlight.midY, origin.midY)
  }

  func testPositionAndBoundsChannelsProduceTheExpectedTrailingEdge() {
    let origin = CGRect(x: 12, y: 500, width: 360, height: 40)
    let target = CGRect(x: 230, y: 320, width: 120, height: 44)

    for progress in stride(from: CGFloat(0), through: 1, by: 0.1) {
      let rect = CommentFlightMath.interpolatedRect(
        from: origin,
        to: target,
        horizontalProgress: progress,
        verticalProgress: progress,
        boundsProgress: progress
      )
      let expectedTrailingEdge = CommentFlightMath.interpolate(
        from: origin.maxX,
        to: target.maxX,
        progress: progress
      )
      XCTAssertEqual(rect.maxX, expectedTrailingEdge, accuracy: 0.001)
    }
  }

  func testSpringPositionOvershootIsPreservedWhileBoundsStayValid() {
    let origin = CGRect(x: 12, y: 500, width: 360, height: 40)
    let target = CGRect(x: 250, y: 320, width: 120, height: 44)

    let overshoot = CommentFlightMath.interpolatedRect(
      from: origin,
      to: target,
      horizontalProgress: 1.05,
      verticalProgress: 1.05,
      boundsProgress: 1.05
    )

    XCTAssertLessThan(overshoot.maxX, target.maxX)
    XCTAssertLessThan(overshoot.midY, target.midY)
    XCTAssertEqual(overshoot.size, target.size)
  }

  func testScaleDownFactorAdaptsToComposerHeight() {
    let defaultHeight: CGFloat = 40

    XCTAssertEqual(
      CommentFlightMath.scaleDownFactor(entryHeight: defaultHeight, defaultHeight: defaultHeight),
      0.7
    )
    XCTAssertEqual(
      CommentFlightMath.scaleDownFactor(entryHeight: defaultHeight * 4, defaultHeight: defaultHeight),
      0.8
    )
    XCTAssertEqual(
      CommentFlightMath.scaleDownFactor(entryHeight: defaultHeight * 7, defaultHeight: defaultHeight),
      0.9
    )
    XCTAssertEqual(
      CommentFlightMath.scaleDownFactor(entryHeight: defaultHeight * 9, defaultHeight: defaultHeight),
      0.9
    )
  }

  func testScaleChannelsCompressThenComposeBackToIdentity() {
    let defaultHeight: CGFloat = 40

    XCTAssertEqual(
      CommentFlightMath.glassBubbleScale(
        entryHeight: defaultHeight,
        defaultHeight: defaultHeight,
        scaleDownProgress: 0,
        scaleUpProgress: 0
      ),
      1
    )
    XCTAssertEqual(
      CommentFlightMath.glassBubbleScale(
        entryHeight: defaultHeight,
        defaultHeight: defaultHeight,
        scaleDownProgress: 1,
        scaleUpProgress: 0
      ),
      0.7
    )
    XCTAssertEqual(
      CommentFlightMath.glassBubbleScale(
        entryHeight: defaultHeight,
        defaultHeight: defaultHeight,
        scaleDownProgress: 1,
        scaleUpProgress: 1
      ),
      1,
      accuracy: 0.000_1
    )
  }

  func testBubbleAndButtonUseIndependentChoreography() {
    XCTAssertEqual(CommentFlightMath.bubbleOpacity(0), 0)
    XCTAssertEqual(CommentFlightMath.bubbleOpacity(1 / 6), 0.5, accuracy: 0.000_1)
    XCTAssertEqual(CommentFlightMath.bubbleOpacity(1 / 3), 1)
    XCTAssertGreaterThan(CommentFlightMath.sendButtonScale(0.3), 0)
    XCTAssertEqual(CommentFlightMath.sendButtonScale(0.625), 0, accuracy: 0.000_1)
    XCTAssertEqual(CommentFlightMath.whiteTextMaskOpacity(0), 1)
    XCTAssertEqual(CommentFlightMath.whiteTextMaskOpacity(0.75), 0, accuracy: 0.000_1)
  }

  func testLandingTargetRejectsThePreScrollFrameUnderTheComposer() {
    let origin = CGRect(x: 12, y: 500, width: 360, height: 44)
    let preScrollTarget = CGRect(x: 250, y: 490, width: 120, height: 44)

    XCTAssertFalse(
      CommentFlightMath.isValidLandingTarget(from: origin, to: preScrollTarget)
    )
  }

  func testLandingTargetAcceptsThePostScrollFrameAboveTheComposer() {
    let origin = CGRect(x: 12, y: 500, width: 360, height: 44)
    let postScrollTarget = CGRect(x: 250, y: 420, width: 120, height: 44)

    XCTAssertTrue(
      CommentFlightMath.isValidLandingTarget(from: origin, to: postScrollTarget)
    )
  }
}
