@testable import Afilmory
import UIKit
import XCTest

@MainActor
final class DuoDarkroomBookTests: XCTestCase {
  private let fold = CGRect(x: 470, y: 0, width: 10, height: 669)
  private var windows: [UIWindow] = []

  override func tearDown() {
    windows.forEach { $0.isHidden = true }
    windows = []
    super.tearDown()
  }

  private func host(_ controller: UIViewController, _ context: DuoContext, width: CGFloat = 951) {
    let navigation = AFNavigationController(rootViewController: controller)
    let window = UIWindow(frame: CGRect(x: 0, y: 0, width: width, height: 669))
    window.rootViewController = navigation
    window.makeKeyAndVisible()
    windows.append(window)
    navigation.traitOverrides.duoContext = context
    navigation.view.layoutIfNeeded()
    controller.view.layoutIfNeeded()
    RunLoop.main.run(until: Date().addingTimeInterval(0.05))
    controller.view.layoutIfNeeded()
  }

  private func frame(_ view: UIView, in root: UIView) -> CGRect {
    view.convert(view.bounds, to: root)
  }

  func testBookHomePutsWhatIsHappeningLeftAndWhereToGoRight() {
    let darkroom = DarkroomController(onRequestSignIn: {})
    host(darkroom, DuoContext(barEdge: .trailing, posture: .book(fold: fold)))
    let stage = frame(darkroom.stageView, in: darkroom.view)
    let stats = frame(darkroom.statsView, in: darkroom.view)
    let manage = frame(darkroom.rows.accountGroup, in: darkroom.view)
    XCTAssertLessThanOrEqual(stage.maxX, fold.minX)
    XCTAssertLessThanOrEqual(stats.maxX, fold.minX)
    XCTAssertGreaterThanOrEqual(manage.minX, fold.maxX)
    XCTAssertLessThan(manage.minY, stats.maxY)
  }

  func testPhoneHomeKeepsOneColumn() {
    let darkroom = DarkroomController(onRequestSignIn: {})
    host(darkroom, .phone, width: 402)
    let stats = frame(darkroom.statsView, in: darkroom.view)
    let manage = frame(darkroom.rows.accountGroup, in: darkroom.view)
    XCTAssertEqual(manage.minX, 16, accuracy: 0.5)
    XCTAssertGreaterThan(manage.minY, stats.maxY)
  }

  func testSpreadColumnsFitEachPage() {
    XCTAssertEqual(DarkroomLibraryCell.spreadColumns(laneWidth: 438), 4)
    XCTAssertEqual(DarkroomLibraryCell.spreadColumns(laneWidth: 370), 3)
    XCTAssertEqual(DarkroomLibraryCell.spreadColumns(laneWidth: 200), 3)
  }

  func testLaneCornersRoundEachPagesGrid() {
    let columns = [4, 3]
    XCTAssertEqual(DarkroomLibraryCell.laneCorners(index: 0, count: 14, columns: columns), [.layerMinXMinYCorner])
    XCTAssertEqual(DarkroomLibraryCell.laneCorners(index: 4, count: 14, columns: columns), [.layerMinXMinYCorner])
    XCTAssertEqual(DarkroomLibraryCell.laneCorners(index: 6, count: 14, columns: columns), [.layerMaxXMinYCorner])
    XCTAssertEqual(DarkroomLibraryCell.laneCorners(index: 13, count: 14, columns: columns), [.layerMaxXMaxYCorner])
  }

  func testLibraryGridNeverCrossesTheFold() {
    let lanes: [ClosedRange<CGFloat>] = [16...454, 496...866]
    let layout = DarkroomLibraryCell.layout(lanes: lanes)
    let collection = UICollectionView(frame: CGRect(x: 0, y: 0, width: 882, height: 669), collectionViewLayout: layout)
    collection.register(UICollectionViewCell.self, forCellWithReuseIdentifier: "c")
    collection.register(UICollectionReusableView.self, forSupplementaryViewOfKind: UICollectionView.elementKindSectionHeader, withReuseIdentifier: "h")
    let source = Source()
    collection.dataSource = source
    let window = UIWindow(frame: collection.frame)
    window.addSubview(collection)
    window.isHidden = false
    windows.append(window)
    collection.layoutIfNeeded()
    let frames = (0..<14).compactMap { collection.layoutAttributesForItem(at: IndexPath(item: $0, section: 0))?.frame }
    XCTAssertEqual(frames.count, 14)
    XCTAssertTrue(frames.allSatisfy { $0.maxX <= fold.minX || $0.minX >= fold.maxX })
    XCTAssertEqual(frames.prefix(4).map(\.minY), Array(repeating: frames[0].minY, count: 4))
    XCTAssertGreaterThanOrEqual(frames[4].minX, fold.maxX)
    XCTAssertEqual(frames[7].minX, frames[0].minX, accuracy: 0.5)
    withExtendedLifetime(source) {}
  }

  private final class Source: NSObject, UICollectionViewDataSource {
    func collectionView(_: UICollectionView, numberOfItemsInSection _: Int) -> Int { 14 }
    func collectionView(_ collectionView: UICollectionView, cellForItemAt indexPath: IndexPath) -> UICollectionViewCell {
      collectionView.dequeueReusableCell(withReuseIdentifier: "c", for: indexPath)
    }

    func collectionView(_ collectionView: UICollectionView, viewForSupplementaryElementOfKind kind: String, at indexPath: IndexPath) -> UICollectionReusableView {
      collectionView.dequeueReusableSupplementaryView(ofKind: kind, withReuseIdentifier: "h", for: indexPath)
    }
  }
}
