@testable import Afilmory
import UIKit
import XCTest

@MainActor
final class DuoDetailLayoutTests: XCTestCase {
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

  private func hosted(_ context: DuoContext) -> PhotoDetailViewController {
    let detail = PhotoDetailViewController(photos: [Self.photo("a"), Self.photo("b")], index: 0, gallerySlug: nil) { _ in nil }
    let navigation = AFNavigationController(rootViewController: detail)
    let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 951, height: 669))
    window.rootViewController = navigation
    window.makeKeyAndVisible()
    windows.append(window)
    navigation.traitOverrides.duoContext = context
    navigation.view.layoutIfNeeded()
    detail.view.layoutIfNeeded()
    return detail
  }

  private func labels(_ detail: PhotoDetailViewController) -> [String] {
    (detail.navigationItem.rightBarButtonItems ?? []).map { $0.accessibilityLabel ?? "" }
  }

  func testSplitGeometryFollowsThePosture() {
    let bounds = CGRect(x: 0, y: 0, width: 951, height: 669)
    let safe = UIEdgeInsets(top: 24, left: 0, bottom: 20, right: 69)
    let book = PhotoDetailViewController.duoSplit(
      context: DuoContext(barEdge: .trailing, posture: .book(fold: fold)), bounds: bounds, safeArea: safe, fold: fold
    )
    XCTAssertEqual(book?.photo.maxX, fold.minX)
    XCTAssertEqual(book?.info.minX, fold.maxX)
    XCTAssertEqual(book?.info.maxX, 882)
    let flat = PhotoDetailViewController.duoSplit(context: DuoContext(barEdge: .trailing, posture: .flat), bounds: bounds, safeArea: safe, fold: nil)
    XCTAssertEqual((flat?.photo.width ?? 0) / 882, 2.0 / 3.0, accuracy: 0.03)
    XCTAssertNil(PhotoDetailViewController.duoSplit(context: .phone, bounds: bounds, safeArea: safe, fold: nil))
    XCTAssertNil(PhotoDetailViewController.duoSplit(context: DuoContext(barEdge: .trailing, posture: .single), bounds: bounds, safeArea: safe, fold: nil))
  }

  func testBookPostureShowsThePhotoAndItsInformationOnFacingPages() {
    let detail = hosted(DuoContext(barEdge: .trailing, posture: .book(fold: fold)))
    let photo = detail.photoLayer.convert(detail.photoLayer.bounds, to: detail.view)
    XCTAssertLessThanOrEqual(photo.maxX, fold.minX + 0.5)
    XCTAssertLessThanOrEqual(detail.chips.frame.maxX, fold.minX + 0.5)
    XCTAssertGreaterThanOrEqual(detail.infoColumn.frame.minX, fold.maxX - 0.5)
    XCTAssertGreaterThan(detail.infoColumn.frame.height, 400)
    XCTAssertFalse(detail.infoColumn.isHidden)
    XCTAssertTrue(detail.sheet.isHidden)
    XCTAssertEqual(labels(detail), [String(localized: "Back"), String(localized: "Full Screen"), String(localized: "More")])
    XCTAssertTrue(detail.backButton.isHidden || detail.topChrome.isHidden)
  }

  func testFlatPostureGivesThePhotoTwoThirds() {
    let detail = hosted(DuoContext(barEdge: .trailing, posture: .flat))
    let photo = detail.photoLayer.convert(detail.photoLayer.bounds, to: detail.view)
    XCTAssertGreaterThan(photo.width, detail.infoColumn.frame.width * 1.7)
    XCTAssertGreaterThan(detail.infoColumn.frame.minX, photo.maxX)
  }

  func testFullScreenCoversTheContentAndFlipsTheItem() {
    let detail = hosted(DuoContext(barEdge: .trailing, posture: .book(fold: fold)))
    detail.toggleFullScreen(animated: false)
    detail.view.layoutIfNeeded()
    let photo = detail.photoLayer.convert(detail.photoLayer.bounds, to: detail.view)
    XCTAssertGreaterThan(photo.maxX, fold.maxX)
    XCTAssertEqual(detail.infoColumn.alpha, 0)
    XCTAssertEqual(detail.chips.alpha, 0)
    XCTAssertEqual(labels(detail)[1], String(localized: "Exit Full Screen"))
    detail.toggleFullScreen(animated: false)
    detail.view.layoutIfNeeded()
    XCTAssertEqual(detail.infoColumn.alpha, 1)
    XCTAssertEqual(labels(detail)[1], String(localized: "Full Screen"))
  }

  func testTheOuterDisplayKeepsThePhoneLayoutWithBarItems() {
    let detail = hosted(DuoContext(barEdge: .trailing, posture: .single))
    XCTAssertTrue(detail.infoColumn.isHidden)
    XCTAssertFalse(detail.sheet.isHidden)
    XCTAssertEqual(labels(detail), [String(localized: "Back"), String(localized: "More")])
  }

  func testPhonesKeepTheirChrome() {
    let detail = hosted(.phone)
    XCTAssertTrue(detail.infoColumn.isHidden)
    XCTAssertFalse(detail.sheet.isHidden)
    XCTAssertEqual(labels(detail), [])
    XCTAssertFalse(detail.topChrome.isHidden)
  }

  func testDuoPresentsDetailInsideANavigationControllerTheTransitionCanUnwrap() {
    let detail = PhotoDetailViewController(photos: [Self.photo("a")], index: 0, gallerySlug: nil) { _ in nil }
    XCTAssertTrue(PhotoDetailPresenter.container(for: detail, context: .phone) === detail)
    let container = PhotoDetailPresenter.container(for: detail, context: DuoContext(barEdge: .trailing, posture: .single))
    XCTAssertTrue(container is AFNavigationController)
    XCTAssertEqual(container.modalPresentationStyle, .custom)
    XCTAssertNotNil(container.transitioningDelegate)
    XCTAssertEqual(container.view.backgroundColor, .clear)
    XCTAssertTrue(DetailTransitionAnimator.detail(in: container) === detail)
  }
}
