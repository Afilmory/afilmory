@testable import Afilmory
import UIKit
import XCTest

@MainActor
final class AFBlurViewAnimationTests: XCTestCase {
  override func tearDown() {
    AFBlurView.reduceTransparencyOverride = nil
    super.tearDown()
  }

  private func hostedBlur() -> (UIWindow, AFBlurView) {
    let window = makeTestWindow(size: CGSize(width: 100, height: 100))
    let blur = AFBlurView(frame: window.bounds)
    window.addSubview(blur)
    window.isHidden = false
    return (window, blur)
  }

  func testRadiusAnimatesOverTimeInsteadOfSnapping() {
    let (window, blur) = hostedBlur()
    blur.radius = 24
    let done = expectation(description: "settled")
    blur.setRadius(0, duration: 0.3) { done.fulfill() }
    XCTAssertEqual(blur.radius, 24, accuracy: 0.01)
    var midway: CGFloat = -1
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) { midway = blur.radius }
    wait(for: [done], timeout: 2)
    XCTAssertGreaterThan(midway, 0.5)
    XCTAssertLessThan(midway, 23.5)
    XCTAssertEqual(blur.radius, 0, accuracy: 0.01)
    _ = window
  }

  func testKeyframesVisitEveryRadiusAndEndOnTheLast() {
    let (window, blur) = hostedBlur()
    blur.radius = 7
    var seen: [CGFloat] = []
    let done = expectation(description: "settled")
    blur.animateRadius(through: [(0, 0.1), (1.6, 0.1), (0, 0.1)], sample: { seen.append($0) }) { done.fulfill() }
    wait(for: [done], timeout: 2)
    XCTAssertEqual(blur.radius, 0, accuracy: 0.01)
    XCTAssertGreaterThan(seen.max() ?? 0, 0.8)
    XCTAssertTrue(seen.contains { $0 < 0.5 })
    _ = window
  }

  func testANewAnimationInterruptsTheRunningOne() {
    let (window, blur) = hostedBlur()
    blur.radius = 10
    var firstFinished = false
    blur.setRadius(0, duration: 0.5) { firstFinished = true }
    let done = expectation(description: "second")
    blur.setRadius(10, duration: 0.1) { done.fulfill() }
    wait(for: [done], timeout: 2)
    XCTAssertFalse(firstFinished)
    XCTAssertEqual(blur.radius, 10, accuracy: 0.01)
    _ = window
  }

  func testReduceTransparencyNeverAppliesABlurEffect() {
    AFBlurView.reduceTransparencyOverride = true
    let (window, blur) = hostedBlur()
    blur.radius = 12
    XCTAssertFalse(blur.isApplyingEffect)
    AFBlurView.reduceTransparencyOverride = false
    blur.radius = 12
    XCTAssertTrue(blur.isApplyingEffect)
    _ = window
  }
}
