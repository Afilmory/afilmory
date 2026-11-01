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
}
