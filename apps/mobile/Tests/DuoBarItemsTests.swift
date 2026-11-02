@testable import Afilmory
import UIKit
import XCTest

@MainActor
final class DuoBarItemsTests: XCTestCase {
  private let outer = DuoContext(barEdge: .trailing, posture: .single)
  private let flat = DuoContext(barEdge: .trailing, posture: .flat)
  private var windows: [UIWindow] = []

  override func tearDown() {
    windows.forEach { $0.isHidden = true }
    windows = []
    super.tearDown()
  }

  private func host(_ controller: UIViewController, _ context: DuoContext) -> AFNavigationController {
    let navigation = AFNavigationController(rootViewController: controller)
    let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 466, height: 678))
    window.rootViewController = navigation
    window.makeKeyAndVisible()
    windows.append(window)
    navigation.traitOverrides.duoContext = context
    navigation.view.layoutIfNeeded()
    controller.view.layoutIfNeeded()
    return navigation
  }

  private func labels(_ controller: UIViewController) -> [String] {
    (controller.navigationItem.rightBarButtonItems ?? []).map { $0.accessibilityLabel ?? $0.title ?? "" }
  }

  private func isShown(_ view: UIView) -> Bool {
    var current: UIView? = view
    while let node = current {
      if node.isHidden || node.alpha < 0.01 { return false }
      current = node.superview
    }
    return true
  }

  private func shownViews(in root: UIView, label: String) -> Bool {
    var found = false
    func walk(_ view: UIView) {
      if view.accessibilityLabel == label, isShown(view) { found = true }
      view.subviews.forEach(walk)
    }
    walk(root)
    return found
  }

  func testOwnExhibitionPutsSearchAndProjectInTheVerticalBar() {
    let exhibition = ExhibitionController(source: .own, onRequestSignIn: {})
    _ = host(exhibition, outer)
    XCTAssertEqual(labels(exhibition), [String(localized: "Search and filters"), String(localized: "Project")])
    XCTAssertFalse(isShown(exhibition.topBar.searchButton))
    XCTAssertFalse(isShown(exhibition.topBar.projectButton))
  }

  func testPhonesKeepTheButtonsInTheHeader() {
    let exhibition = ExhibitionController(source: .own, onRequestSignIn: {})
    _ = host(exhibition, .phone)
    XCTAssertEqual(labels(exhibition), [])
    XCTAssertTrue(isShown(exhibition.topBar.searchButton))
  }

  func testAVisitedGalleryPutsProjectInTheBarAndUsesTheSystemBack() {
    let gallery = ExhibitionController(source: .gallery(slug: "duo", header: nil), onRequestSignIn: {})
    let navigation = host(UIViewController(), outer)
    navigation.pushViewController(gallery, animated: false)
    navigation.view.layoutIfNeeded()
    XCTAssertEqual(labels(gallery).last, String(localized: "Project"))
    XCTAssertFalse(gallery.navigationItem.hidesBackButton)
    XCTAssertFalse(isShown(gallery.topBar.projectButton))
  }

  func testVisitorViewingOffersSignInFromTheBar() {
    let viewing = ViewingController(isVisitor: true, onRequestSignIn: {})
    _ = host(viewing, outer)
    XCTAssertEqual(labels(viewing), [String(localized: "Sign in")])
  }

  func testSignedInViewingHasNoBarItems() {
    let viewing = ViewingController(isVisitor: false, onRequestSignIn: {})
    _ = host(viewing, outer)
    XCTAssertEqual(labels(viewing), [])
  }

  func testDarkroomShowsTheAccountInTheBarExceptWhenFlat() {
    let darkroom = DarkroomController(onRequestSignIn: {})
    let navigation = host(darkroom, outer)
    XCTAssertEqual(labels(darkroom), [String(localized: "Account")])
    XCTAssertEqual(darkroom.navigationItem.rightBarButtonItems?.first?.hidesSharedBackground, true)
    XCTAssertFalse(isShown(darkroom.avatarButton))
    navigation.traitOverrides.duoContext = flat
    navigation.view.layoutIfNeeded()
    XCTAssertEqual(labels(darkroom), [])
  }

  func testDarkroomSubpagesUseTheSystemBack() {
    let page = DarkroomSubpageController(title: "Library", route: .library, content: UIViewController())
    let navigation = host(UIViewController(), outer)
    navigation.pushViewController(page, animated: false)
    navigation.view.layoutIfNeeded()
    XCTAssertFalse(page.navigationItem.hidesBackButton)
    XCTAssertFalse(shownViews(in: page.view, label: String(localized: "Back")))
  }

}
