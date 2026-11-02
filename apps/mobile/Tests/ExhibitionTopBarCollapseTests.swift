@testable import Afilmory
import UIKit
import XCTest

@MainActor
final class ExhibitionTopBarCollapseTests: XCTestCase {
  private var windows: [UIWindow] = []

  override func tearDown() {
    windows.forEach { $0.isHidden = true }
    windows = []
    super.tearDown()
  }

  private func host(_ bar: ExhibitionTopBar) -> UIView {
    let controller = UIViewController()
    let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 402, height: 874))
    window.rootViewController = controller
    window.makeKeyAndVisible()
    windows.append(window)
    bar.translatesAutoresizingMaskIntoConstraints = false
    controller.view.addSubview(bar)
    NSLayoutConstraint.activate([
      bar.topAnchor.constraint(equalTo: controller.view.topAnchor),
      bar.leadingAnchor.constraint(equalTo: controller.view.leadingAnchor),
      bar.trailingAnchor.constraint(equalTo: controller.view.trailingAnchor),
      bar.heightAnchor.constraint(equalToConstant: 106),
    ])
    controller.view.layoutIfNeeded()
    return controller.view
  }

  private func label(_ text: String, in root: UIView) -> UILabel? {
    var queue = [root]
    while let next = queue.popLast() {
      if let label = next as? UILabel, label.text == text { return label }
      queue.append(contentsOf: next.subviews)
    }
    return nil
  }

  private func collapse(_ bar: ExhibitionTopBar, _ view: UIView) {
    bar.update(scrollOffset: 500, titleThreshold: 100)
    view.layoutIfNeeded()
  }

  func testCollapsedTitleTakesTheBrandsLeadingSlot() throws {
    let bar = ExhibitionTopBar(showsBack: false)
    bar.setTitle("Innei's Afilmory")
    let view = host(bar)
    collapse(bar, view)
    let title = try XCTUnwrap(label("Innei's Afilmory", in: bar))
    XCTAssertEqual(title.convert(title.bounds, to: view).minX, 20, accuracy: 0.5)
    XCTAssertEqual(title.alpha, 1)
    XCTAssertEqual(try XCTUnwrap(label("AFILMORY", in: bar)).alpha, 0)
  }

  func testCollapsedProjectShrinksToAPlayCircle() {
    let bar = ExhibitionTopBar(showsBack: false)
    bar.setTitle("Innei's Afilmory")
    let view = host(bar)
    collapse(bar, view)
    let project = bar.projectButton
    XCTAssertNil(project.configuration?.title)
    XCTAssertEqual(project.bounds.width, ExhibitionTopBar.controlHeight, accuracy: 0.5)
    XCTAssertEqual(project.bounds.height, ExhibitionTopBar.controlHeight, accuracy: 0.5)
    XCTAssertEqual(project.accessibilityLabel, String(localized: "Project"))
  }

  func testScrollingBackRestoresBrandAndProjectLabel() throws {
    let bar = ExhibitionTopBar(showsBack: false)
    bar.setTitle("Innei's Afilmory")
    let view = host(bar)
    collapse(bar, view)
    bar.update(scrollOffset: 0, titleThreshold: 100)
    view.layoutIfNeeded()
    XCTAssertEqual(try XCTUnwrap(label("AFILMORY", in: bar)).alpha, 1)
    XCTAssertEqual(try XCTUnwrap(label("Innei's Afilmory", in: bar)).alpha, 0)
    XCTAssertEqual(bar.projectButton.configuration?.title, String(localized: "Project"))
    XCTAssertGreaterThan(bar.projectButton.bounds.width, ExhibitionTopBar.controlHeight)
  }

  func testVisitorTitleSitsRightAfterTheBackButton() throws {
    let bar = ExhibitionTopBar(showsBack: true)
    bar.setTitle("Someone's Gallery")
    let view = host(bar)
    collapse(bar, view)
    let title = try XCTUnwrap(label("Someone's Gallery", in: bar)).convert(
      try XCTUnwrap(label("Someone's Gallery", in: bar)).bounds, to: view
    )
    let backMaxX = 12 + ExhibitionTopBar.controlHeight
    XCTAssertEqual(title.minX, backMaxX + 12, accuracy: 0.5)
  }
}
