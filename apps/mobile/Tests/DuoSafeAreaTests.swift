@testable import Afilmory
import UIKit
import XCTest

@MainActor
final class DuoSafeAreaTests: XCTestCase {
  private var windows: [UIWindow] = []

  override func tearDown() {
    windows.forEach { $0.isHidden = true }
    windows = []
    super.tearDown()
  }

  private func host(_ content: UIView, insets: UIEdgeInsets) -> UIViewController {
    let controller = UIViewController()
    let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 1180, height: 820))
    window.rootViewController = controller
    window.makeKeyAndVisible()
    windows.append(window)
    controller.additionalSafeAreaInsets = insets
    content.translatesAutoresizingMaskIntoConstraints = false
    controller.view.addSubview(content)
    NSLayoutConstraint.activate([
      content.topAnchor.constraint(equalTo: controller.view.topAnchor),
      content.leadingAnchor.constraint(equalTo: controller.view.leadingAnchor),
      content.trailingAnchor.constraint(equalTo: controller.view.trailingAnchor),
    ])
    controller.view.layoutIfNeeded()
    return controller
  }

  private func frames<T: UIView>(of _: T.Type, in root: UIView, relativeTo view: UIView) -> [CGRect] {
    var found: [CGRect] = []
    var queue = [root]
    while let next = queue.popLast() {
      if next is T, !next.isHidden { found.append(next.convert(next.bounds, to: view)) }
      queue.append(contentsOf: next.subviews)
    }
    return found
  }

  func testTheExhibitionHeroStaysInsideTheSheetLanes() {
    let layout = ExhibitionSheetLayout()
    layout.heroHeight = 400
    layout.lanes = [24...1096]
    let collection = UICollectionView(frame: CGRect(x: 0, y: 0, width: 1180, height: 820), collectionViewLayout: layout)
    layout.prepare()
    let hero = layout.layoutAttributesForItem(at: IndexPath(item: 0, section: 0))?.frame
    XCTAssertEqual(hero?.minX, 24)
    XCTAssertEqual(hero?.maxX, 1096)
    withExtendedLifetime(collection) {}
  }

  func testTheViewingHeaderKeepsItsSegmentsOutOfTheStrip() {
    let header = ViewingHeaderBar(pages: [.rolls, .galleries])
    let controller = host(header, insets: UIEdgeInsets(top: 0, left: 0, bottom: 0, right: 84))
    let limit = controller.view.bounds.width - controller.view.safeAreaInsets.right
    let segments = frames(of: ViewingHeaderBar.Segment.self, in: header, relativeTo: controller.view)
    XCTAssertEqual(segments.count, 2)
    for segment in segments {
      XCTAssertLessThanOrEqual(segment.maxX, limit + 0.5)
    }
  }

  func testTheExhibitionBrandClearsALeadingStrip() {
    let bar = ExhibitionTopBar(showsBack: false)
    let controller = host(bar, insets: UIEdgeInsets(top: 0, left: 84, bottom: 0, right: 0))
    bar.heightAnchor.constraint(equalToConstant: 120).isActive = true
    controller.view.layoutIfNeeded()
    let labels = frames(of: UILabel.self, in: bar, relativeTo: controller.view).filter { $0.width > 0 }
    XCTAssertFalse(labels.isEmpty)
    for label in labels {
      XCTAssertGreaterThanOrEqual(label.minX, controller.view.safeAreaInsets.left)
    }
  }
}
