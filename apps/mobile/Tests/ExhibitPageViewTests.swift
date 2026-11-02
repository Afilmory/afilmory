@testable import Afilmory
import UIKit
import XCTest

@MainActor
final class ExhibitPageViewTests: XCTestCase {
  private func laidOutPage(actionsHeight: CGFloat, image: UIImage? = nil) -> ExhibitPageView {
    let page = ExhibitPageView(photoFraction: 0.32)
    page.configure(image: image, kicker: "Afilmory", number: nil, title: "Open a gallery of your own", body: "After signing in, name your gallery and develop your first roll.")
    let filler = UIView()
    filler.heightAnchor.constraint(equalToConstant: actionsHeight).isActive = true
    page.actions.addArrangedSubview(filler)
    page.frame = CGRect(x: 0, y: 0, width: 375, height: 667)
    page.layoutIfNeeded()
    page.layoutIfNeeded()
    return page
  }

  func testTallActionsOnASmallScreenScrollInsteadOfOverlappingTheText() throws {
    let page = laidOutPage(actionsHeight: 460)
    let labels = page.labelStack.convert(page.labelStack.bounds, to: page)
    let actions = page.actions.convert(page.actions.bounds, to: page)
    XCTAssertLessThanOrEqual(labels.maxY, actions.minY - 19.5)
    let scroll = try XCTUnwrap(page.subviews.compactMap { $0 as? UIScrollView }.first)
    XCTAssertTrue(scroll.isScrollEnabled)
    XCTAssertGreaterThanOrEqual(scroll.contentSize.height + 0.5, page.actions.frame.maxY + 8)
  }

  func testShortActionsPinToTheBottomWithoutScrolling() throws {
    let page = laidOutPage(actionsHeight: 120)
    let scroll = try XCTUnwrap(page.subviews.compactMap { $0 as? UIScrollView }.first)
    XCTAssertFalse(scroll.isScrollEnabled)
    let actions = page.actions.convert(page.actions.bounds, to: page)
    XCTAssertEqual(actions.maxY, page.bounds.height - page.safeAreaInsets.bottom - 8, accuracy: 1)
  }

  func testALargePhotoKeepsItsShareOfTheScreen() {
    let photo = UIGraphicsImageRenderer(size: CGSize(width: 1400, height: 2000)).image { context in
      UIColor.gray.setFill()
      context.fill(CGRect(x: 0, y: 0, width: 1400, height: 2000))
    }
    let page = laidOutPage(actionsHeight: 120, image: photo)
    XCTAssertEqual(page.photoCard.bounds.height, 667 * 0.32, accuracy: 1)
  }

  func testAWideActionCannotPushTheColumnPastTheScreen() {
    let page = ExhibitPageView(photoFraction: 0.32)
    page.configure(image: nil, kicker: "Afilmory", number: nil, title: "自分だけのギャラリーを開く", body: "")
    let wide = UILabel()
    wide.text = "Afilmory の利用規約とプライバシーポリシーに同意します。Afilmory の利用規約とプライバシーポリシーに同意します。"
    page.actions.addArrangedSubview(wide)
    page.frame = CGRect(x: 0, y: 0, width: 375, height: 667)
    page.layoutIfNeeded()
    let card = page.photoCard.convert(page.photoCard.bounds, to: page)
    XCTAssertGreaterThanOrEqual(card.minX, 11.5)
    XCTAssertLessThanOrEqual(card.maxX, 375 - 11.5)
  }
}
