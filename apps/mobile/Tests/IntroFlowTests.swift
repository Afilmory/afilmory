@testable import Afilmory
import UIKit
import XCTest

final class IntroFlowTests: XCTestCase {
  private var flags: OnboardingFlags!

  override func setUp() {
    super.setUp()
    let defaults = UserDefaults(suiteName: "IntroFlowTests")!
    defaults.removePersistentDomain(forName: "IntroFlowTests")
    flags = OnboardingFlags(defaults: defaults)
  }

  func testFourPagesEachWithABundledPhoto() {
    XCTAssertEqual(IntroPage.all.count, 4)
    XCTAssertEqual(IntroPage.all.map(\.number), [1, 2, 3, 4])
    for page in IntroPage.all {
      XCTAssertNotNil(UIImage(named: page.imageName), page.imageName)
      XCTAssertFalse(page.title.isEmpty)
      XCTAssertFalse(page.body.isEmpty)
    }
  }

  func testContinueWalksToTheSignInPageAndStops() {
    var flow = IntroFlow(flags: flags)
    XCTAssertEqual(flow.index, 0)
    flow.advance()
    flow.advance()
    XCTAssertFalse(flow.isSignInPage)
    flow.advance()
    XCTAssertTrue(flow.isSignInPage)
    flow.advance()
    XCTAssertEqual(flow.index, 3)
  }

  func testIntroIsSeenOnceTheSignInPageIsReached() {
    var flow = IntroFlow(flags: flags)
    flow.advance()
    flow.advance()
    XCTAssertFalse(flags.introSeen)
    flow.advance()
    XCTAssertTrue(flags.introSeen)
  }

  func testSkipJumpsToSignInAndMarksSeen() {
    var flow = IntroFlow(flags: flags)
    flow.skip()
    XCTAssertTrue(flow.isSignInPage)
    XCTAssertTrue(flags.introSeen)
  }

  func testBackStopsAtTheFirstPage() {
    var flow = IntroFlow(flags: flags)
    flow.advance()
    flow.back()
    flow.back()
    XCTAssertEqual(flow.index, 0)
  }

  @MainActor
  func testProgressDotsStretchTheCurrentDot() {
    let dots = AFProgressDots(count: 4)
    dots.setCurrent(1, animated: false)
    dots.layoutIfNeeded()
    XCTAssertEqual(dots.dotWidths, [6, 18, 6, 6])
    dots.setCurrent(3, animated: false)
    dots.layoutIfNeeded()
    XCTAssertEqual(dots.dotWidths, [6, 6, 6, 18])
  }
}
