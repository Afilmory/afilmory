@testable import Afilmory
import UIKit
import XCTest

@MainActor
final class AccountSheetTests: XCTestCase {
  func testRowsAreSubscriptionIntroSignOutThenASeparateDelete() {
    XCTAssertEqual(AccountSheetRow.primary, [.manageSubscription, .replayIntro, .signOut])
    XCTAssertEqual(AccountSheetRow.destructive, .deleteAccount)
  }

  func testStartingDeletionGoesStraightToTheDeletionPage() {
    XCTAssertEqual(AccountRoute(startsDeletion: true), .deletion)
    XCTAssertEqual(AccountRoute(startsDeletion: false), .sheet)
  }

  func testSheetIsTitledAccountAndShowsEveryRow() {
    let sheet = DarkroomAccountSheetController(user: nil, subtitle: "innei.afilmory.art · Owner")
    sheet.loadViewIfNeeded()
    let texts = sheet.view.allSubviews(of: UILabel.self).compactMap(\.text)
    XCTAssertTrue(texts.contains(String(localized: "Account")))
    for row in AccountSheetRow.primary + [AccountSheetRow.destructive] {
      XCTAssertTrue(texts.contains(row.title), row.title)
    }
  }

  func testDeletionPageIsFullScreen() {
    XCTAssertEqual(AccountDeletionController(session: nil).modalPresentationStyle, .fullScreen)
  }
}
