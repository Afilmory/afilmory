@testable import Afilmory
import UIKit
import XCTest

final class LaunchRouteTests: XCTestCase {
  private var defaults: UserDefaults!
  private var flags: OnboardingFlags!

  override func setUp() {
    super.setUp()
    defaults = UserDefaults(suiteName: "LaunchRouteTests")
    defaults.removePersistentDomain(forName: "LaunchRouteTests")
    flags = OnboardingFlags(defaults: defaults)
  }

  func testFlagsStartUnsetAndPersist() {
    XCTAssertFalse(flags.introSeen)
    XCTAssertFalse(flags.onboardingPending)
    flags.introSeen = true
    flags.onboardingPending = true
    let reloaded = OnboardingFlags(defaults: defaults)
    XCTAssertTrue(reloaded.introSeen)
    XCTAssertTrue(reloaded.onboardingPending)
  }

  func testFirstVisitorLaunchShowsTheIntro() {
    XCTAssertEqual(LaunchRoute.resolve(.visitor, flags: flags), .intro)
  }

  func testVisitorWhoHasSeenTheIntroGoesStraightToViewing() {
    flags.introSeen = true
    XCTAssertEqual(LaunchRoute.resolve(.visitor, flags: flags), .visitor)
  }

  func testAPendingDeepLinkSkipsTheIntro() {
    XCTAssertEqual(LaunchRoute.resolve(.visitor, flags: flags, hasPendingDeepLink: true), .visitor)
  }

  func testSignedInRoutesIgnoreTheIntro() {
    XCTAssertEqual(LaunchRoute.resolve(.workspaceSetup, flags: flags), .setup)
    XCTAssertEqual(LaunchRoute.resolve(.authenticatedTabs, flags: flags), .tabs(postSetup: false))
    XCTAssertEqual(LaunchRoute.resolve(.loading, flags: flags), .loading)
  }

  func testTabsCarryThePostSetupOverlayOnlyWhilePending() {
    flags.onboardingPending = true
    XCTAssertEqual(LaunchRoute.resolve(.authenticatedTabs, flags: flags), .tabs(postSetup: true))
    flags.onboardingPending = false
    XCTAssertEqual(LaunchRoute.resolve(.authenticatedTabs, flags: flags), .tabs(postSetup: false))
  }

  func testReachingASignedInRootMarksTheIntroSeen() {
    flags.note(.authenticatedTabs)
    XCTAssertTrue(flags.introSeen)
    let other = OnboardingFlags(defaults: defaults)
    other.introSeen = false
    other.note(.workspaceSetup)
    XCTAssertTrue(other.introSeen)
  }

  func testVisitorAndLoadingRootsDoNotMarkTheIntroSeen() {
    flags.note(.visitor)
    flags.note(.loading)
    XCTAssertFalse(flags.introSeen)
  }

  @MainActor
  func testALinkArrivingDuringTheIntroReroutesInsteadOfBeingDropped() {
    let intro = IntroController(mode: .firstLaunch, flags: flags) {}
    XCTAssertEqual(DeepLinkGate.decide(root: intro, presented: nil), .reroute)
  }

  @MainActor
  func testALinkArrivingDuringPostSetupWaitsForItToClose() {
    let postSetup = PostSetupController { _ in }
    XCTAssertEqual(DeepLinkGate.decide(root: UITabBarController(), presented: postSetup), .hold)
  }

  @MainActor
  func testALinkOverOrdinaryRootsAppliesAtOnce() {
    XCTAssertEqual(DeepLinkGate.decide(root: UINavigationController(), presented: nil), .apply)
    XCTAssertEqual(DeepLinkGate.decide(root: UITabBarController(), presented: UIViewController()), .apply)
  }
}
