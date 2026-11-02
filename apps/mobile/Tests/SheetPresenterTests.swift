@testable import Afilmory
import UIKit
import XCTest

@MainActor
final class SheetPresenterTests: XCTestCase {
  private func request(count: Int, title: String) -> PhotoCommentsSheetRequest {
    var request = PhotoCommentsSheetRequest()
    request.gallerySlug = "innei"
    request.photoId = "p1"
    request.photoTitle = title
    request.initialCommentCount = count
    return request
  }

  private func labels(_ controller: UIViewController) -> [String] {
    controller.loadViewIfNeeded()
    return controller.view.allSubviews(of: UILabel.self).compactMap(\.text)
  }

  func testCommentsSheetExpandsAndTitlesWithTheCountAndPhoto() {
    let store = CommentsStore(request: request(count: 3, title: "No. 17"))
    let sheet = CommentsSheetPresenter.make(store: store) { _ in }
    XCTAssertEqual(sheet.detent, .fitAndExpanded)
    XCTAssertTrue(labels(sheet).contains(String(localized: "Comments · \(3)")))
    XCTAssertTrue(labels(sheet).contains("No. 17"))
  }

  func testCommentsSheetWithoutAKnownCountUsesThePlainTitle() {
    let store = CommentsStore(request: request(count: -1, title: ""))
    let sheet = CommentsSheetPresenter.make(store: store) { _ in }
    XCTAssertTrue(labels(sheet).contains(String(localized: "Comments")))
  }

  func testClosingCommentsReportsTheLatestCount() {
    let store = CommentsStore(request: request(count: 3, title: ""))
    var reported: Int?
    let sheet = CommentsSheetPresenter.make(store: store) { reported = $0 }
    sheet.close()
    XCTAssertEqual(reported, 3)
  }

  func testCommentsSheetDoesNotKeepTheStoreAlive() {
    weak var weakStore: CommentsStore?
    autoreleasepool {
      let store = CommentsStore(request: request(count: 3, title: ""))
      weakStore = store
      _ = CommentsSheetPresenter.make(store: store) { _ in }
    }
    XCTAssertNil(weakStore)
  }

  func testCommentsHeaderFollowsTheLoadedCount() {
    let store = CommentsStore(request: request(count: -1, title: ""))
    let sheet = CommentsSheetPresenter.make(store: store) { _ in }
    XCTAssertTrue(labels(sheet).contains(String(localized: "Comments")))
    store.loadState = .loaded
    RunLoop.main.run(until: Date().addingTimeInterval(0.1))
    XCTAssertTrue(labels(sheet).contains(String(localized: "Comments · \(0)")))
  }

  func testFilterSheetIsExpandableAndTitled() {
    let sheet = ExhibitionFilterPresenter.make(photos: []) { _ in }
    XCTAssertEqual(sheet.detent, .fitAndExpanded)
    XCTAssertTrue(labels(sheet).contains(String(localized: "Search & Filter")))
  }

  func testQuotaWallFitsItsContentAndUsesTheReasonTitle() {
    let reason = QuotaWallReason.libraryItems(current: 20, limit: 20)
    let sheet = QuotaWallPresenter.make(reason: reason)
    XCTAssertEqual(sheet.detent, .fit)
    XCTAssertTrue(labels(sheet).contains(reason.title))
  }
}
