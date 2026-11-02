@testable import Afilmory
import UIKit
import XCTest

@MainActor
final class DuoDetailCommentsTests: XCTestCase {
  private let fold = CGRect(x: 470, y: 0, width: 10, height: 669)
  private var windows: [UIWindow] = []

  override func tearDown() {
    windows.forEach { $0.isHidden = true }
    windows = []
    super.tearDown()
  }

  private static func photo(_ id: String) -> GalleryPhoto {
    GalleryPhoto(
      id: id, title: id, description: "", originalUrl: "", thumbnailUrl: "",
      thumbHash: nil, aspectRatio: 1.5, width: 3, height: 2, format: nil, size: nil,
      dateTaken: "2026-07-19T23:13:00", video: nil, tags: [], exif: nil,
      toneAnalysis: nil, location: nil, camera: nil, lens: nil, rating: nil, city: nil
    )
  }

  private func store() -> CommentsStore {
    var request = PhotoCommentsSheetRequest()
    request.gallerySlug = "duo"
    request.photoId = "a"
    request.initialCommentCount = 2
    return CommentsStore(request: request)
  }

  private func hosted(_ context: DuoContext) -> (AFNavigationController, PhotoDetailViewController) {
    let detail = PhotoDetailViewController(photos: [Self.photo("a"), Self.photo("b")], index: 0, gallerySlug: nil) { _ in nil }
    let navigation = AFNavigationController(rootViewController: detail)
    let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 951, height: 669))
    window.rootViewController = navigation
    window.makeKeyAndVisible()
    windows.append(window)
    navigation.traitOverrides.duoContext = context
    navigation.view.layoutIfNeeded()
    return (navigation, detail)
  }

  func testCommentsReplaceTheInformationPageInBookPosture() throws {
    let (_, detail) = hosted(DuoContext(barEdge: .trailing, posture: .book(fold: fold)))
    detail.openComments(store: store())
    detail.view.layoutIfNeeded()
    XCTAssertNil(detail.presentedViewController)
    let column = try XCTUnwrap(detail.commentsColumn)
    XCTAssertGreaterThanOrEqual(column.frame.minX, fold.maxX - 0.5)
    XCTAssertTrue(detail.infoColumn.isHidden)
    column.closeButton.sendActions(for: .primaryActionTriggered)
    detail.view.layoutIfNeeded()
    XCTAssertNil(detail.commentsColumn)
    XCTAssertFalse(detail.infoColumn.isHidden)
  }

  func testPagingToAnotherPhotoReturnsToItsInformation() {
    let (_, detail) = hosted(DuoContext(barEdge: .trailing, posture: .flat))
    detail.openComments(store: store())
    detail.showPage(1, animated: false)
    XCTAssertNil(detail.commentsColumn)
    XCTAssertFalse(detail.infoColumn.isHidden)
  }

  func testFoldingClosesTheColumnAndFullScreen() {
    let (navigation, detail) = hosted(DuoContext(barEdge: .trailing, posture: .book(fold: fold)))
    detail.toggleFullScreen(animated: false)
    detail.toggleFullScreen(animated: false)
    detail.openComments(store: store())
    detail.toggleFullScreen(animated: false)
    navigation.traitOverrides.duoContext = DuoContext(barEdge: .trailing, posture: .single)
    navigation.view.layoutIfNeeded()
    XCTAssertFalse(detail.isFullScreen)
    XCTAssertNil(detail.commentsColumn)
    XCTAssertFalse(detail.sheet.isHidden)
    XCTAssertEqual(detail.sheet.alpha, 1)
  }

  func testPhonesStillUseTheCommentsSheet() {
    let (_, detail) = hosted(.phone)
    detail.openComments(store: store())
    XCTAssertNil(detail.commentsColumn)
    XCTAssertNotNil(detail.presentedViewController)
  }
}
