@testable import Afilmory
import UIKit
import XCTest

@MainActor
final class AfilmoryTabBarControllerTests: XCTestCase {
  func testBuildsThreeTabsWithFocusBarItems() {
    let controllers = AppTab.allCases.map { _ in UIViewController() }
    let tabs = AfilmoryTabBarController(controllers: controllers)
    tabs.loadViewIfNeeded()
    XCTAssertEqual(tabs.viewControllers?.count, 3)
    XCTAssertEqual(tabs.focusBar.itemTitles, AppTab.allCases.map(\.title))
    XCTAssertEqual(AppTab.exhibition.title, String(localized: "Exhibition"))
    XCTAssertTrue(tabs.tabBar.isHidden)
  }

  func testSelectingATabUpdatesTheBar() {
    let tabs = AfilmoryTabBarController(controllers: AppTab.allCases.map { _ in UIViewController() })
    tabs.loadViewIfNeeded()
    tabs.select(.darkroom, animated: false)
    XCTAssertEqual(tabs.selectedIndex, 2)
    XCTAssertEqual(tabs.focusBar.selectedTab, .darkroom)
    XCTAssertTrue(tabs.focusBar.accessibilityTraits.contains(.tabBar))
  }

  func testBarCanHideForImmersiveScreens() {
    let tabs = AfilmoryTabBarController(controllers: AppTab.allCases.map { _ in UIViewController() })
    tabs.loadViewIfNeeded()
    tabs.setFocusBarHidden(true, animated: false)
    XCTAssertTrue(tabs.isFocusBarHidden)
    tabs.setFocusBarHidden(false, animated: false)
    XCTAssertFalse(tabs.isFocusBarHidden)
  }

  private var windows: [UIWindow] = []

  override func tearDown() {
    windows.forEach { $0.isHidden = true }
    windows = []
    AFMotion.reduceMotionOverride = nil
    super.tearDown()
  }

  private func hostedTabs() -> AfilmoryTabBarController {
    AFMotion.reduceMotionOverride = false
    let tabs = AfilmoryTabBarController(controllers: AppTab.allCases.map { _ in UIViewController() })
    let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 402, height: 874))
    window.rootViewController = tabs
    window.makeKeyAndVisible()
    windows.append(window)
    tabs.view.layoutIfNeeded()
    return tabs
  }

  private func blurs(in root: UIView) -> [AFBlurView] {
    var found: [AFBlurView] = []
    var queue = [root]
    while let next = queue.popLast() {
      if let blur = next as? AFBlurView { found.append(blur) }
      queue.append(contentsOf: next.subviews)
    }
    return found
  }

  func testSwitchingTabsRacksTheIncomingPageIntoFocus() throws {
    let tabs = hostedTabs()
    tabs.select(.viewing, animated: true)
    let incoming = try XCTUnwrap(tabs.viewControllers?[1].view)
    XCTAssertEqual(tabs.selectedIndex, 1)
    XCTAssertFalse(blurs(in: incoming).isEmpty)
    XCTAssertEqual(blurs(in: tabs.view).count, 2)
  }

  func testASecondTapMidSwitchLandsAndDropsTheFirstSwitch() throws {
    let tabs = hostedTabs()
    tabs.select(.viewing, animated: true)
    tabs.select(.darkroom, animated: true)
    let interrupted = try XCTUnwrap(tabs.viewControllers?[1].view)
    XCTAssertEqual(tabs.selectedIndex, 2)
    XCTAssertEqual(tabs.focusBar.selectedTab, .darkroom)
    XCTAssertTrue(blurs(in: interrupted).isEmpty)
    XCTAssertEqual(interrupted.transform, .identity)
    XCTAssertEqual(blurs(in: tabs.view).count, 2)
  }
}
