@testable import Afilmory
import UIKit
import XCTest

@MainActor
final class DuoDarkroomFlatTests: XCTestCase {
  private let fold = CGRect(x: 470, y: 0, width: 10, height: 669)
  private let flat = DuoContext(barEdge: .trailing, posture: .flat)
  private var windows: [UIWindow] = []

  override func tearDown() {
    windows.forEach { $0.isHidden = true }
    windows = []
    super.tearDown()
  }

  private func host(_ context: DuoContext) -> (AFNavigationController, DarkroomController) {
    let darkroom = DarkroomController(onRequestSignIn: {})
    let navigation = AFNavigationController(rootViewController: darkroom)
    let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 951, height: 669))
    window.rootViewController = navigation
    window.makeKeyAndVisible()
    windows.append(window)
    navigation.traitOverrides.duoContext = context
    settle(navigation)
    return (navigation, darkroom)
  }

  private func settle(_ navigation: UINavigationController) {
    navigation.view.layoutIfNeeded()
    RunLoop.main.run(until: Date().addingTimeInterval(0.05))
    navigation.view.layoutIfNeeded()
  }

  private func isShown(_ view: UIView) -> Bool {
    var current: UIView? = view
    while let node = current {
      if node.isHidden || node.alpha < 0.01 { return false }
      current = node.superview
    }
    return view.window != nil
  }

  private func frame(_ view: UIView, in root: UIView) -> CGRect {
    view.convert(view.bounds, to: root)
  }

  func testFlatShowsASidebarWithTheStageSelected() {
    let (_, darkroom) = host(flat)
    let sidebar = frame(darkroom.rows.accountGroup, in: darkroom.view)
    let stage = frame(darkroom.stageView, in: darkroom.view)
    XCTAssertLessThan(sidebar.maxX, 951 * 0.4)
    XCTAssertGreaterThan(stage.minX, sidebar.maxX)
    XCTAssertNil(darkroom.flatSelection)
    XCTAssertTrue(darkroom.stageRow.isSelected)
    XCTAssertTrue(isShown(darkroom.stageRow))
  }

  func testSelectingARowSwapsTheDetailInPlace() throws {
    let (navigation, darkroom) = host(flat)
    darkroom.push(.library, animated: true)
    settle(navigation)
    XCTAssertEqual(navigation.viewControllers.count, 1)
    XCTAssertEqual(darkroom.flatSelection, .library)
    let detail = try XCTUnwrap(darkroom.flatDetail as? DarkroomSubpageController)
    XCTAssertEqual(detail.route, .library)
    XCTAssertGreaterThan(frame(detail.view, in: darkroom.view).minX, frame(darkroom.rows.accountGroup, in: darkroom.view).maxX)
    XCTAssertTrue(darkroom.rows.library.isSelected)
    darkroom.stageRow.sendActions(for: .primaryActionTriggered)
    settle(navigation)
    XCTAssertNil(darkroom.flatDetail)
    XCTAssertNil(darkroom.flatSelection)
  }

  func testLeavingFlatPushesTheSelectedPage() {
    let (navigation, darkroom) = host(flat)
    darkroom.push(.domain, animated: false)
    navigation.traitOverrides.duoContext = DuoContext(barEdge: .trailing, posture: .book(fold: fold))
    settle(navigation)
    XCTAssertNil(darkroom.flatDetail)
    XCTAssertEqual((navigation.topViewController as? DarkroomSubpageController)?.route, .domain)
  }

  func testEnteringFlatTurnsThePushedPageIntoTheSelection() {
    let (navigation, darkroom) = host(DuoContext(barEdge: .trailing, posture: .book(fold: fold)))
    darkroom.push(.site, animated: false)
    settle(navigation)
    navigation.traitOverrides.duoContext = flat
    settle(navigation)
    RunLoop.main.run(until: Date().addingTimeInterval(0.1))
    XCTAssertEqual(navigation.viewControllers.count, 1)
    XCTAssertEqual(darkroom.flatSelection, .site)
  }

  func testPhonesNeverShowTheStageRow() {
    let (_, darkroom) = host(.phone)
    XCTAssertFalse(isShown(darkroom.stageRow))
    XCTAssertFalse(darkroom.rows.library.isSelected)
  }
}
