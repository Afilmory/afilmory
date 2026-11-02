@testable import Afilmory
import SwiftUI
import UIKit
import XCTest

final class AFSheetGeometryTests: XCTestCase {
  private func geometry(fitting: CGFloat, detent: AFSheetDetent) -> AFSheetGeometry {
    AFSheetGeometry(containerHeight: 874, topInset: 62, inset: 8, fittingHeight: fitting, detent: detent)
  }

  func testFitHeightFollowsContentWithinBounds() {
    XCTAssertEqual(geometry(fitting: 320, detent: .fit).height(for: .collapsed), 320)
    XCTAssertEqual(geometry(fitting: 40, detent: .fit).height(for: .collapsed), 200)
    XCTAssertEqual(geometry(fitting: 2000, detent: .fit).height(for: .collapsed), 874 - 62 - 16)
  }

  func testFitHasNoExpandedRest() {
    let fit = geometry(fitting: 320, detent: .fit)
    XCTAssertEqual(fit.height(for: .expanded), fit.height(for: .collapsed))
  }

  func testExpandableRestsAtTheSmallerOfContentAndFiftyFivePercent() {
    XCTAssertEqual(geometry(fitting: 300, detent: .fitAndExpanded).height(for: .collapsed), 300)
    XCTAssertEqual(geometry(fitting: 900, detent: .fitAndExpanded).height(for: .collapsed), 874 * 0.55, accuracy: 0.001)
    XCTAssertEqual(geometry(fitting: 900, detent: .fitAndExpanded).height(for: .expanded), 874 - 62 - 16)
  }

  func testShortDragFromExpandedCollapsesInsteadOfDismissing() {
    let sheet = geometry(fitting: 900, detent: .fitAndExpanded)
    XCTAssertEqual(sheet.release(from: .expanded, translation: 220, velocity: 0), .rest(.collapsed))
    XCTAssertEqual(sheet.release(from: .expanded, translation: 30, velocity: 1400), .rest(.collapsed))
    XCTAssertEqual(sheet.release(from: .expanded, translation: 40, velocity: 0), .rest(.expanded))
  }

  func testDragFarPastTheCollapsedRestDismissesFromExpanded() {
    let sheet = geometry(fitting: 900, detent: .fitAndExpanded)
    let beyond = sheet.height(for: .expanded) - sheet.height(for: .collapsed) + sheet.height(for: .collapsed) * 0.4
    XCTAssertEqual(sheet.release(from: .expanded, translation: beyond, velocity: 0), .dismiss)
  }

  func testCollapsedDismissesOnLongOrFastDownwardDrag() {
    let sheet = geometry(fitting: 320, detent: .fit)
    XCTAssertEqual(sheet.release(from: .collapsed, translation: 140, velocity: 0), .dismiss)
    XCTAssertEqual(sheet.release(from: .collapsed, translation: 20, velocity: 1000), .dismiss)
    XCTAssertEqual(sheet.release(from: .collapsed, translation: 40, velocity: 0), .rest(.collapsed))
  }

  func testUpwardDragExpandsOnlyExpandableSheets() {
    XCTAssertEqual(geometry(fitting: 900, detent: .fitAndExpanded).release(from: .collapsed, translation: -120, velocity: 0), .rest(.expanded))
    XCTAssertEqual(geometry(fitting: 900, detent: .fitAndExpanded).release(from: .collapsed, translation: -10, velocity: -1200), .rest(.expanded))
    XCTAssertEqual(geometry(fitting: 320, detent: .fit).release(from: .collapsed, translation: -300, velocity: -1200), .rest(.collapsed))
  }

  @MainActor
  func testDragHandoffFindsOnlyTheScrollViewUnderTheTouch() {
    let sheet = UIView(frame: CGRect(x: 0, y: 0, width: 386, height: 600))
    let header = UIView(frame: CGRect(x: 0, y: 0, width: 386, height: 80))
    let list = UIScrollView(frame: CGRect(x: 0, y: 80, width: 386, height: 520))
    list.contentSize = CGSize(width: 386, height: 2000)
    let row = UIView(frame: CGRect(x: 0, y: 40, width: 386, height: 60))
    list.addSubview(row)
    sheet.addSubview(header)
    sheet.addSubview(list)
    XCTAssertNil(AFSheetHandoff.scrollView(at: CGPoint(x: 100, y: 40), in: sheet))
    XCTAssertTrue(AFSheetHandoff.scrollView(at: CGPoint(x: 100, y: 150), in: sheet) === list)
  }

  func testAListScrolledBackToTheTopHandsTheSameDragToTheSheet() {
    XCTAssertTrue(AFSheetHandoff.sheetTakesOver(scrollAtTop: true, movingDown: true))
    XCTAssertFalse(AFSheetHandoff.sheetTakesOver(scrollAtTop: false, movingDown: true))
    XCTAssertFalse(AFSheetHandoff.sheetTakesOver(scrollAtTop: true, movingDown: false))
  }

  @MainActor
  func testHeaderShowsTitleSubtitleAndALabelledCloseButton() throws {
    let sheet = AFSheetController(title: "Comments · 3", subtitle: "No. 17", detent: .fitAndExpanded)
    sheet.loadViewIfNeeded()
    let labels = sheet.view.allSubviews(of: UILabel.self).compactMap(\.text)
    XCTAssertTrue(labels.contains("Comments · 3"))
    XCTAssertTrue(labels.contains("No. 17"))
    let close = try XCTUnwrap(sheet.view.allSubviews(of: UIButton.self).first { $0.accessibilityLabel == String(localized: "Close") })
    XCTAssertFalse(close.isHidden)
  }

  @MainActor
  func testHeaderlessSheetHasNoCloseButton() {
    let sheet = AFSheetController(title: nil, subtitle: nil, detent: .fit)
    sheet.loadViewIfNeeded()
    XCTAssertNil(sheet.view.allSubviews(of: UIButton.self).first { $0.accessibilityLabel == String(localized: "Close") && !$0.isHidden })
  }

  @MainActor
  func testFittingHeightGivesAWrappingTitleEveryLine() {
    let short = AFSheetController(title: "Full", detent: .fit, rootView: Color.clear.frame(height: 100))
    let long = AFSheetController(title: "ライブラリがいっぱいです。容量を確認してください", detent: .fit, rootView: Color.clear.frame(height: 100))
    let width: CGFloat = 375 - 16
    let lineHeight = AFFont.exhibit(size: 28, relativeTo: .title2).lineHeight
    XCTAssertGreaterThanOrEqual(long.fittingHeight(width: width) - short.fittingHeight(width: width), lineHeight)
  }

  @MainActor
  func testLaidOutAtItsFittingHeightAWrappingTitleIsNotTruncated() throws {
    let title = "ライブラリがいっぱいです"
    let sheet = QuotaWallPresenter.make(reason: .libraryItems(current: 20, limit: 20))
    sheet.setHeader(title: title)
    let width: CGFloat = 402 - 16
    let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 402, height: 874))
    let root = UIViewController()
    window.rootViewController = root
    window.makeKeyAndVisible()
    root.present(sheet, animated: false)
    sheet.additionalSafeAreaInsets = UIEdgeInsets(top: 0, left: 0, bottom: 26, right: 0)
    RunLoop.main.run(until: Date().addingTimeInterval(0.5))
    sheet.view.layoutIfNeeded()
    let label = try XCTUnwrap(sheet.view.allSubviews(of: UILabel.self).first { $0.text == title })
    let needed = label.sizeThatFits(CGSize(width: label.bounds.width, height: .greatestFiniteMagnitude)).height
    XCTAssertGreaterThanOrEqual(label.bounds.height + 0.5, needed)
  }
}

extension UIView {
  func allSubviews<T: UIView>(of type: T.Type) -> [T] {
    subviews.flatMap { ($0 as? T).map { [$0] } ?? [] } + subviews.flatMap { $0.allSubviews(of: type) }
  }
}
