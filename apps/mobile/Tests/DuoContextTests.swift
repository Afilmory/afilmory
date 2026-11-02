@testable import Afilmory
import UIKit
import XCTest

@MainActor
final class DuoContextTests: XCTestCase {
  private let fold = CGRect(x: 470, y: 0, width: 10, height: 669)

  private func resolve(_ edge: DuoBarEdge, _ hinge: HingeReading, division: CGRect? = nil, regular: Bool = true) -> DuoContext {
    DuoContext.resolve(edge: edge, hinge: hinge, division: division, regularWidth: regular)
  }

  func testDevicesWithoutAVerticalBarStayOnThePhoneLayout() {
    XCTAssertEqual(resolve(.none, .partiallyOpen, division: fold), .phone)
    XCTAssertEqual(resolve(.none, .fullyOpen), .phone)
  }

  func testClosedOrCompactDisplaysKeepASinglePane() {
    XCTAssertEqual(resolve(.trailing, .closed, division: fold), DuoContext(barEdge: .trailing, posture: .single))
    XCTAssertEqual(resolve(.trailing, .fullyOpen, regular: false), DuoContext(barEdge: .trailing, posture: .single))
  }

  func testHalfOpenWithAFoldIsBookPosture() {
    XCTAssertEqual(resolve(.trailing, .partiallyOpen, division: fold).posture, .book(fold: fold))
    XCTAssertEqual(resolve(.leading, .unknown, division: fold).posture, .book(fold: fold))
  }

  func testFullyOpenIgnoresTheFold() {
    XCTAssertEqual(resolve(.trailing, .fullyOpen, division: fold).posture, .flat)
    XCTAssertEqual(resolve(.trailing, .partiallyOpen).posture, .flat)
    XCTAssertEqual(resolve(.trailing, .unknown).posture, .flat)
  }

  func testContextFlags() {
    XCTAssertFalse(DuoContext.phone.hasVerticalBar)
    XCTAssertFalse(DuoContext.phone.isExpanded)
    XCTAssertTrue(DuoContext(barEdge: .trailing, posture: .single).hasVerticalBar)
    XCTAssertTrue(DuoContext(barEdge: .trailing, posture: .flat).isExpanded)
  }

  func testPagesSplitAroundTheFold() {
    let pages = DuoGeometry.pages(in: CGRect(x: 0, y: 0, width: 882, height: 669), fold: fold)
    XCTAssertEqual(pages.left, CGRect(x: 0, y: 0, width: 470, height: 669))
    XCTAssertEqual(pages.right, CGRect(x: 480, y: 0, width: 402, height: 669))
  }

  func testFlatColumnsGiveTheMainColumnTwoThirds() {
    let columns = DuoGeometry.flatColumns(in: CGRect(x: 0, y: 0, width: 882, height: 669), secondaryFraction: 1.0 / 3.0, spacing: 12)
    XCTAssertEqual(columns.main.minX, 0)
    XCTAssertEqual(columns.secondary.maxX, 882)
    XCTAssertEqual(columns.secondary.minX - columns.main.maxX, 12, accuracy: 0.5)
    XCTAssertEqual(columns.main.width / 882, 2.0 / 3.0, accuracy: 0.03)
  }

  func testLanesFollowThePostureInAViewsOwnCoordinates() {
    let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 951, height: 669))
    let view = UIView(frame: CGRect(x: 20, y: 0, width: 862, height: 669))
    window.addSubview(view)
    let book = DuoContext(barEdge: .trailing, posture: .book(fold: fold))
    let lanes = DuoGeometry.lanes(in: view.bounds, context: book, view: view)
    XCTAssertEqual(lanes.count, 2)
    XCTAssertEqual(lanes[0].maxX, 450)
    XCTAssertEqual(lanes[1].minX, 460)
    XCTAssertEqual(DuoGeometry.lanes(in: view.bounds, context: .phone, view: view), [view.bounds])
    XCTAssertEqual(DuoGeometry.lanes(in: view.bounds, context: DuoContext(barEdge: .trailing, posture: .flat), view: view), [view.bounds])
  }

  func testTheTraitDefaultsToPhoneAndFlowsThroughOverrides() {
    let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 951, height: 669))
    let root = UIViewController()
    window.rootViewController = root
    window.makeKeyAndVisible()
    XCTAssertEqual(root.traitCollection.duoContext, .phone)
    let flat = DuoContext(barEdge: .trailing, posture: .flat)
    root.traitOverrides.duoContext = flat
    root.view.layoutIfNeeded()
    XCTAssertEqual(root.traitCollection.duoContext, flat)
    XCTAssertEqual(root.view.duoContext, flat)
  }
}
