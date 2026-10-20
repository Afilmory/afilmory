import UIKit
import XCTest

@testable import Afilmory

@MainActor
final class DuoTabsLayoutTests: XCTestCase {
  private var window: UIWindow!

  override func setUp() async throws {
    try await super.setUp()
    let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.first as? UIWindowScene)
    window = UIWindow(windowScene: scene)
  }

  override func tearDown() async throws {
    window.isHidden = true
    window.rootViewController = nil
    window = nil
    try await super.tearDown()
  }

  func testMapControlsAvoidEitherHorizontalSafeArea() throws {
    let map = PhotoMapView()
    let controller = UIViewController()
    controller.view = map
    show(controller)
    for insets in [UIEdgeInsets(top: 0, left: 96, bottom: 0, right: 0), UIEdgeInsets(top: 0, left: 0, bottom: 0, right: 96)] {
      controller.additionalSafeAreaInsets = insets
      map.setNeedsLayout()
      map.layoutIfNeeded()
      let fit = try XCTUnwrap(descendants(map).first { $0.accessibilityLabel == "Show all photo locations" })
      let frame = fit.convert(fit.bounds, to: map)
      let safe = map.safeAreaLayoutGuide.layoutFrame
      XCTAssertGreaterThanOrEqual(frame.minX, safe.minX + 11)
      XCTAssertLessThanOrEqual(frame.maxX, safe.maxX - 11)
      let title = try XCTUnwrap(descendants(map).compactMap { $0 as? UILabel }.first { $0.text == "Explore Map" })
      XCTAssertGreaterThanOrEqual(title.convert(title.bounds, to: map).minX, safe.minX + 11)
    }
  }

  func testExplorePagerAvoidsTheVerticalSystemBar() throws {
    let explore = GalleriesController(onRequestSignIn: {})
    let navigation = UINavigationController(rootViewController: explore)
    navigation.additionalSafeAreaInsets = UIEdgeInsets(top: 0, left: 20, bottom: 0, right: 96)
    show(navigation)
    let pager = try XCTUnwrap(descendants(explore.view).first { $0.accessibilityIdentifier == "explore.pageContainer" })
    let frame = pager.convert(pager.bounds, to: explore.view)
    let safe = explore.view.safeAreaLayoutGuide.layoutFrame
    XCTAssertGreaterThanOrEqual(frame.minX, safe.minX)
    XCTAssertLessThanOrEqual(frame.maxX, safe.maxX)
  }

  func testExploreSearchStaysVisibleAndEditableInRegularWidth() async throws {
    let explore = GalleriesController(onRequestSignIn: {})
    let navigation = UINavigationController(rootViewController: explore)
    navigation.traitOverrides.horizontalSizeClass = .regular
    show(navigation)
    let search = try XCTUnwrap(explore.navigationItem.rightBarButtonItems?.first { $0.accessibilityIdentifier == "explore.search" }?.primaryAction)
    UIControl().sendAction(search)
    try await Task.sleep(for: .milliseconds(400))
    window.layoutIfNeeded()
    let bar = try XCTUnwrap(descendants(window).compactMap { $0 as? UISearchBar }.first { !$0.isHidden && $0.alpha > 0.5 })
    XCTAssertTrue(bar.searchTextField.isFirstResponder)
    XCTAssertTrue(bar.isDescendant(of: explore.view))
    let frame = bar.convert(bar.bounds, to: explore.view)
    let safe = explore.view.safeAreaLayoutGuide.layoutFrame
    XCTAssertGreaterThanOrEqual(frame.minX, safe.minX)
    XCTAssertLessThanOrEqual(frame.maxX, safe.maxX)
    XCTAssertGreaterThan(frame.width, 200)
    bar.searchTextField.text = "Duo"
    bar.delegate?.searchBar?(bar, textDidChange: "Duo")
    XCTAssertEqual(bar.searchTextField.text, "Duo")
  }

  func testStudioKeepsItsColumnsWhenReturningFromCompactWidth() throws {
    let studio = StudioHomeController(onRequestSignIn: {}, onRequestSignOut: {}, onNavigate: { _ in }, onWorkspaceChanged: { _ in })
    let navigation = UINavigationController(rootViewController: studio)
    window.traitOverrides.horizontalSizeClass = .regular
    show(navigation)
    try XCTSkipIf(window.bounds.width <= window.bounds.height, "Requires a landscape window")
    let summary = try XCTUnwrap(descendants(studio.view).first { $0.accessibilityIdentifier == "studio.summary" })
    let management = try XCTUnwrap(descendants(studio.view).first { $0.accessibilityIdentifier == "studio.management" })
    XCTAssertGreaterThan(management.convert(management.bounds, to: studio.view).minX, summary.bounds.midX)
    navigation.traitOverrides.horizontalSizeClass = .compact
    window.setNeedsLayout()
    window.layoutIfNeeded()
    studio.view.setNeedsLayout()
    studio.view.layoutIfNeeded()
    XCTAssertTrue(management.window == nil || management.isHidden)
    XCTAssertGreaterThan(summary.bounds.width, studio.view.bounds.width * 0.9)
    navigation.traitOverrides.remove(UITraitHorizontalSizeClass.self)
    window.setNeedsLayout()
    window.layoutIfNeeded()
    studio.view.setNeedsLayout()
    studio.view.layoutIfNeeded()
    XCTAssertEqual(studio.traitCollection.horizontalSizeClass, .regular)
    XCTAssertTrue(management.window === window)
    XCTAssertLessThan(summary.bounds.width, studio.view.bounds.width * 0.7)
  }

  private func show(_ controller: UIViewController) {
    window.rootViewController = controller
    window.makeKeyAndVisible()
    window.layoutIfNeeded()
  }

  private func descendants(_ view: UIView) -> [UIView] {
    [view] + view.subviews.flatMap(descendants)
  }
}
