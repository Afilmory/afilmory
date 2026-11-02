@testable import Afilmory
import UIKit
import XCTest

@MainActor
final class DuoReviewFixesTests: XCTestCase {
  private let fold = CGRect(x: 470, y: 0, width: 10, height: 669)
  private var windows: [UIWindow] = []

  override func tearDown() {
    windows.forEach { $0.isHidden = true }
    windows = []
    UserDefaults.standard.removeObject(forKey: "duo.posture")
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

  private func window(_ root: UIViewController, width: CGFloat = 951) -> UIWindow {
    let window = UIWindow(frame: CGRect(x: 0, y: 0, width: width, height: 669))
    window.rootViewController = root
    window.makeKeyAndVisible()
    windows.append(window)
    return window
  }

  private func hostedDetail(_ context: DuoContext, index: Int = 0) -> (AFNavigationController, PhotoDetailViewController) {
    let detail = PhotoDetailViewController(photos: ["a", "b", "c"].map(Self.photo), index: index, gallerySlug: nil) { _ in nil }
    let navigation = AFNavigationController(rootViewController: detail)
    _ = window(navigation)
    navigation.traitOverrides.duoContext = context
    navigation.view.layoutIfNeeded()
    return (navigation, detail)
  }

  func testUnfoldingWithAnExpandedSheetRestoresPaging() {
    let (navigation, detail) = hostedDetail(DuoContext(barEdge: .trailing, posture: .single))
    detail.setDetent(.expanded, animated: false)
    XCTAssertFalse(detail.pager.isScrollEnabled)
    navigation.traitOverrides.duoContext = DuoContext(barEdge: .trailing, posture: .book(fold: fold))
    navigation.view.layoutIfNeeded()
    XCTAssertEqual(detail.rules.detent, .collapsed)
    XCTAssertTrue(detail.pager.isScrollEnabled)
  }

  func testFoldingKeepsTheCurrentPhotoOnScreen() {
    let (navigation, detail) = hostedDetail(DuoContext(barEdge: .trailing, posture: .flat), index: 2)
    navigation.traitOverrides.duoContext = DuoContext(barEdge: .trailing, posture: .single)
    navigation.view.layoutIfNeeded()
    XCTAssertEqual(detail.pager.contentOffset.x, 2 * detail.pager.bounds.width, accuracy: 0.5)
  }

  func testOuterDisplayKeepsDetailControlsOutOfTheStrip() {
    let (navigation, detail) = hostedDetail(DuoContext(barEdge: .trailing, posture: .single))
    detail.additionalSafeAreaInsets.right = 84
    navigation.view.layoutIfNeeded()
    let limit = detail.view.bounds.width - detail.view.safeAreaInsets.right
    XCTAssertLessThanOrEqual(detail.sheet.frame.maxX, limit + 0.5)
    XCTAssertLessThanOrEqual(detail.chips.frame.maxX, limit + 0.5)
  }

  func testAWindowRootNavigationControllerProvidesTheContext() {
    UserDefaults.standard.set("flat", forKey: "duo.posture")
    let navigation = AFNavigationController(rootViewController: UIViewController())
    let window = window(navigation)
    navigation.view.layoutIfNeeded()
    XCTAssertEqual(window.traitCollection.duoContext, DuoContext(barEdge: .trailing, posture: .flat))
  }

  func testLanesIgnoreTransformsDuringTransitions() {
    let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 951, height: 669))
    let view = UIView(frame: CGRect(x: 0, y: 0, width: 882, height: 669))
    window.addSubview(view)
    view.transform = CGAffineTransform(translationX: 300, y: 0)
    let lanes = DuoGeometry.lanes(in: CGRect(x: 0, y: 0, width: 882, height: 669), context: DuoContext(barEdge: .trailing, posture: .book(fold: fold)), view: view)
    XCTAssertEqual(lanes.count, 2)
    XCTAssertEqual(lanes.first?.maxX, fold.minX)
  }

  func testTheRailReturnsToItsStripAfterAHiddenLayout() {
    let tabs = AfilmoryTabBarController(controllers: AppTab.allCases.map { _ in UIViewController() })
    _ = window(tabs, width: 466)
    tabs.traitOverrides.duoContext = DuoContext(barEdge: .trailing, posture: .single)
    tabs.view.layoutIfNeeded()
    let shown = tabs.focusBar.frame
    tabs.setFocusBarHidden(true, animated: false)
    tabs.view.setNeedsLayout()
    tabs.view.layoutIfNeeded()
    tabs.setFocusBarHidden(false, animated: false)
    XCTAssertEqual(tabs.focusBar.frame, shown)
  }

  func testCommentsFollowTheKeyboard() {
    var request = PhotoCommentsSheetRequest()
    request.gallerySlug = "duo"
    let column = DetailCommentsColumn(store: CommentsStore(request: request))
    let tied = column.constraints.contains { constraint in
      (constraint.firstItem === column.host.view && constraint.secondItem === column.keyboardLayoutGuide)
        || (constraint.secondItem === column.host.view && constraint.firstItem === column.keyboardLayoutGuide)
    }
    XCTAssertTrue(tied)
  }

  func testDarkroomMovesTheOpenPageInsteadOfRebuildingIt() {
    let darkroom = DarkroomController(onRequestSignIn: {})
    let navigation = AFNavigationController(rootViewController: darkroom)
    _ = window(navigation)
    navigation.traitOverrides.duoContext = DuoContext(barEdge: .trailing, posture: .book(fold: fold))
    navigation.view.layoutIfNeeded()
    darkroom.push(.library, animated: false)
    navigation.view.layoutIfNeeded()
    let page = navigation.topViewController
    navigation.traitOverrides.duoContext = DuoContext(barEdge: .trailing, posture: .flat)
    navigation.view.layoutIfNeeded()
    RunLoop.main.run(until: Date().addingTimeInterval(0.1))
    XCTAssertTrue(darkroom.flatDetail === page)
    navigation.traitOverrides.duoContext = DuoContext(barEdge: .trailing, posture: .book(fold: fold))
    navigation.view.layoutIfNeeded()
    XCTAssertTrue(navigation.topViewController === page)
  }

  func testExhibitionAnchorsOnTheTopPhotoAcrossLayouts() {
    let photos = (0..<30).map { index -> GalleryPhoto in
      GalleryPhoto(
        id: "p\(index)", title: "", description: "", originalUrl: "", thumbnailUrl: "",
        thumbHash: nil, aspectRatio: 1.5, width: 3, height: 2, format: nil, size: nil,
        dateTaken: String(format: "2026-07-%02dT10:00:00", index % 28 + 1), video: nil, tags: [], exif: nil,
        toneAnalysis: nil, location: nil, camera: nil, lens: nil, rating: nil, city: nil
      )
    }
    let content = ExhibitionContent(all: photos, filters: .empty, level: .day, laneWidths: [406, 338])
    let layout = ExhibitionSheetLayout()
    layout.heroHeight = 300
    layout.lanes = [0...470, 480...882]
    layout.placements = content.placements.map { ExhibitionSheetLayout.Placement(height: $0.block.height(level: .day), lane: $0.lane) }
    let collection = UICollectionView(frame: CGRect(x: 0, y: 0, width: 882, height: 669), collectionViewLayout: layout)
    let source = Source(count: content.placements.count)
    collection.dataSource = source
    let host = UIWindow(frame: collection.frame)
    host.addSubview(collection)
    host.isHidden = false
    windows.append(host)
    collection.layoutIfNeeded()
    let target = content.placements.compactMap { $0.block.groups?.first?.frames.first?.photoID }[6]
    let offset = ExhibitionController.anchoredOffset(photoID: target, content: content, layout: layout, topInset: 100)
    let block = content.blockIndex(containing: target).flatMap { layout.frameOfBlock($0) }
    XCTAssertNotNil(offset)
    XCTAssertEqual(offset ?? 0, (block?.minY ?? 0) - 100, accuracy: 0.5)
    withExtendedLifetime(source) {}
  }

  private final class Source: NSObject, UICollectionViewDataSource {
    let count: Int
    init(count: Int) { self.count = count }
    func numberOfSections(in _: UICollectionView) -> Int { 2 }
    func collectionView(_: UICollectionView, numberOfItemsInSection section: Int) -> Int { section == 0 ? 1 : count }
    func collectionView(_ collectionView: UICollectionView, cellForItemAt indexPath: IndexPath) -> UICollectionViewCell {
      collectionView.register(UICollectionViewCell.self, forCellWithReuseIdentifier: "c")
      return collectionView.dequeueReusableCell(withReuseIdentifier: "c", for: indexPath)
    }
  }
}
