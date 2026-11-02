@testable import Afilmory
import UIKit
import XCTest

@MainActor
final class DuoFocusRailTests: XCTestCase {
  private let bounds = CGRect(x: 0, y: 0, width: 466, height: 678)
  private let strip = UIEdgeInsets(top: 24, left: 0, bottom: 20, right: 84)

  private func hostedTabs(_ context: DuoContext) -> (UIWindow, AfilmoryTabBarController) {
    let tabs = AfilmoryTabBarController(controllers: AppTab.allCases.map { _ in UIViewController() })
    let window = UIWindow(frame: bounds)
    window.rootViewController = tabs
    window.makeKeyAndVisible()
    tabs.traitOverrides.duoContext = context
    tabs.view.layoutIfNeeded()
    return (window, tabs)
  }

  func testTheTrailingRailSitsInTheStripBelowTheSystemItems() {
    let frame = AfilmoryTabBarController.railFrame(edge: .trailing, bounds: bounds, safeArea: strip, occlusionMaxY: 260)
    XCTAssertEqual(frame.minX, 382)
    XCTAssertEqual(frame.maxX, 466)
    XCTAssertGreaterThanOrEqual(frame.minY, 260)
    XCTAssertLessThanOrEqual(frame.maxY, 678 - 20)
    XCTAssertGreaterThan(frame.height, 120)
  }

  func testTheLeadingRailMirrors() {
    let leadingStrip = UIEdgeInsets(top: 24, left: 84, bottom: 20, right: 0)
    let frame = AfilmoryTabBarController.railFrame(edge: .leading, bounds: bounds, safeArea: leadingStrip, occlusionMaxY: 174)
    XCTAssertEqual(frame.minX, 0)
    XCTAssertEqual(frame.width, 84)
  }

  func testAShortOcclusionStillLeavesTheUpperStripToTheSystem() {
    let frame = AfilmoryTabBarController.railFrame(edge: .trailing, bounds: bounds, safeArea: strip, occlusionMaxY: 0)
    XCTAssertGreaterThanOrEqual(frame.minY, 678 * 0.4)
  }

  func testDuoTurnsTheBarIntoAVerticalRailWithoutABottomInset() {
    let (window, tabs) = hostedTabs(DuoContext(barEdge: .trailing, posture: .single))
    XCTAssertEqual(tabs.focusBar.axis, .vertical)
    XCTAssertEqual(tabs.viewControllers?.first?.additionalSafeAreaInsets.bottom, 0)
    XCTAssertLessThan(tabs.focusBar.frame.height > 0 ? tabs.focusBar.frame.width : 0, 100)
    XCTAssertEqual(tabs.focusBar.itemTitles, AppTab.allCases.map(\.title))
    window.isHidden = true
  }

  func testPhonesKeepTheHorizontalBar() {
    let (window, tabs) = hostedTabs(.phone)
    XCTAssertEqual(tabs.focusBar.axis, .horizontal)
    XCTAssertEqual(tabs.viewControllers?.first?.additionalSafeAreaInsets.bottom, AFFocusTabBar.barHeight)
    XCTAssertEqual(tabs.focusBar.frame.width, bounds.width)
    window.isHidden = true
  }

  func testLeavingDuoRestoresTheHorizontalBar() {
    let (window, tabs) = hostedTabs(DuoContext(barEdge: .trailing, posture: .flat))
    tabs.traitOverrides.duoContext = .phone
    tabs.view.layoutIfNeeded()
    XCTAssertEqual(tabs.focusBar.axis, .horizontal)
    XCTAssertEqual(tabs.focusBar.frame.width, bounds.width)
    window.isHidden = true
  }
}
