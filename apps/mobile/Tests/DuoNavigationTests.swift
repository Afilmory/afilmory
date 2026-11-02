@testable import Afilmory
import UIKit
import XCTest

@MainActor
final class DuoNavigationTests: XCTestCase {
  private func host(_ context: DuoContext) -> (UIWindow, AFNavigationController, UIViewController) {
    let root = UIViewController()
    root.title = "Darkroom"
    let navigation = AFNavigationController(rootViewController: root)
    let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 466, height: 678))
    window.rootViewController = navigation
    window.makeKeyAndVisible()
    navigation.traitOverrides.duoContext = context
    navigation.view.layoutIfNeeded()
    return (window, navigation, root)
  }

  private func visibleLabelTexts(in view: UIView) -> [String] {
    var texts: [String] = []
    func walk(_ view: UIView) {
      guard !view.isHidden, view.alpha > 0.01 else { return }
      if let label = view as? UILabel, let text = label.text, !text.isEmpty { texts.append(text) }
      view.subviews.forEach(walk)
    }
    walk(view)
    return texts
  }

  func testPhonesKeepTheNavigationBarHidden() {
    let (_, navigation, _) = host(.phone)
    XCTAssertTrue(navigation.isNavigationBarHidden)
  }

  func testAVerticalBarShowsATransparentUntitledNavigationBar() {
    let (_, navigation, _) = host(DuoContext(barEdge: .trailing, posture: .single))
    XCTAssertFalse(navigation.isNavigationBarHidden)
    let appearance = navigation.navigationBar.standardAppearance
    XCTAssertNil(appearance.backgroundEffect)
    XCTAssertNil(appearance.shadowColor)
    XCTAssertTrue(appearance.backgroundColor == nil || appearance.backgroundColor == .clear)
    XCTAssertFalse(visibleLabelTexts(in: navigation.navigationBar).contains("Darkroom"))
  }

  func testPushedPagesStayUntitledAndTheBarFollowsContextChanges() {
    let (_, navigation, _) = host(DuoContext(barEdge: .trailing, posture: .single))
    let page = UIViewController()
    page.title = "Library"
    navigation.pushViewController(page, animated: false)
    navigation.view.layoutIfNeeded()
    XCTAssertFalse(visibleLabelTexts(in: navigation.navigationBar).contains("Library"))
    navigation.traitOverrides.duoContext = .phone
    navigation.view.layoutIfNeeded()
    XCTAssertTrue(navigation.isNavigationBarHidden)
  }
}
