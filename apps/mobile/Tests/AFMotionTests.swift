@testable import Afilmory
import UIKit
import XCTest

@MainActor
final class AFMotionTests: XCTestCase {
  override func tearDown() {
    AFMotion.reduceMotionOverride = nil
    super.tearDown()
  }

  func testDevelopStateInterpolatesNegativeToPositive() {
    let start = AFMotion.developState(progress: 0)
    XCTAssertEqual(start.invert, 1, accuracy: 0.001)
    XCTAssertEqual(start.grayscale, 0.7, accuracy: 0.001)
    XCTAssertEqual(start.blur, 3, accuracy: 0.001)
    let mid = AFMotion.developState(progress: 0.5)
    XCTAssertEqual(mid.invert, 0.5, accuracy: 0.001)
    XCTAssertEqual(mid.grayscale, 0.35, accuracy: 0.001)
    XCTAssertEqual(mid.blur, 1.5, accuracy: 0.001)
    let end = AFMotion.developState(progress: 1.4)
    XCTAssertEqual(end.invert, 0, accuracy: 0.001)
    XCTAssertEqual(end.grayscale, 0, accuracy: 0.001)
    XCTAssertEqual(end.blur, 0, accuracy: 0.001)
  }

  func testRackInPlanUsesBlurAndScaleByDefault() {
    AFMotion.reduceMotionOverride = false
    let plan = AFMotion.plan(.rackIn)
    XCTAssertEqual(plan.fromBlur, 24)
    XCTAssertEqual(plan.fromScale, 1.06, accuracy: 0.001)
    XCTAssertEqual(plan.fromAlpha, 0)
    XCTAssertFalse(plan.crossfadeOnly)
  }

  func testReduceMotionTurnsEveryPrimitiveIntoCrossfade() {
    AFMotion.reduceMotionOverride = true
    for primitive in AFMotion.Primitive.allCases {
      let plan = AFMotion.plan(primitive)
      XCTAssertTrue(plan.crossfadeOnly, "\(primitive)")
      XCTAssertEqual(plan.fromBlur, 0)
      XCTAssertEqual(plan.fromScale, 1)
      XCTAssertEqual(plan.toScale, 1)
      XCTAssertLessThanOrEqual(plan.duration, 0.25)
    }
  }

  func testDefocusPlanRecedes() {
    AFMotion.reduceMotionOverride = false
    let plan = AFMotion.plan(.defocus)
    XCTAssertEqual(plan.toBlur, 10)
    XCTAssertTrue((0.95...0.985).contains(plan.toScale))
    XCTAssertTrue((0.35...0.55).contains(plan.toAlpha))
  }

  func testBlurViewRadiusIsClampedAndReadable() {
    let view = AFBlurView()
    view.radius = 6
    XCTAssertEqual(view.radius, 6)
    view.radius = -3
    XCTAssertEqual(view.radius, 0)
  }

  func testRackInBlurIsStillVisibleMidwayInsteadOfSnapping() {
    AFMotion.reduceMotionOverride = false
    let window = makeTestWindow(size: CGSize(width: 200, height: 200))
    let view = UIView(frame: window.bounds)
    window.addSubview(view)
    window.isHidden = false
    AFMotion.rackIn(view)
    var midway: CGFloat = 0
    let probe = expectation(description: "midway")
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.12) {
      midway = view.subviews.compactMap { $0 as? AFBlurView }.first?.radius ?? 0
      probe.fulfill()
    }
    wait(for: [probe], timeout: 2)
    XCTAssertGreaterThan(midway, 2)
    let settled = expectation(description: "settled")
    DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) { settled.fulfill() }
    wait(for: [settled], timeout: 3)
    XCTAssertTrue(view.subviews.compactMap { $0 as? AFBlurView }.isEmpty)
  }

  func testDefocusRampsBlurUpGradually() {
    AFMotion.reduceMotionOverride = false
    let window = makeTestWindow(size: CGSize(width: 200, height: 200))
    let view = UIView(frame: window.bounds)
    window.addSubview(view)
    window.isHidden = false
    AFMotion.defocus(view, amount: 1)
    let blur = view.subviews.compactMap { $0 as? AFBlurView }.first
    XCTAssertNotNil(blur)
    XCTAssertLessThan(blur?.radius ?? 99, 1)
  }
}
