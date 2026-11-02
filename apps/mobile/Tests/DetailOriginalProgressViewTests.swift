@testable import Afilmory
import UIKit
import XCTest

@MainActor
final class DetailOriginalProgressViewTests: XCTestCase {
  private let image = CGRect(x: 0, y: 226, width: 402, height: 268)

  private func makeView() -> DetailOriginalProgressView {
    let view = DetailOriginalProgressView(frame: CGRect(x: 0, y: 0, width: 402, height: 874))
    view.place(image: image, floor: 700)
    return view
  }

  func testLoadingFillsTheLineByTheFraction() {
    let view = makeView()
    view.apply(.loading(fraction: 0.5, readout: "19.2 / 38.4 MB"), animated: false)
    XCTAssertEqual(view.alpha, 1)
    XCTAssertEqual(view.fillWidth, 201, accuracy: 0.5)
    XCTAssertEqual(view.amountText, "19.2 / 38.4 MB")
    XCTAssertTrue(view.retryButton.isHidden)
  }

  func testTheLineSitsOnThePhotosBottomEdgeAcrossItsWidth() {
    let view = makeView()
    view.apply(.loading(fraction: 0.5, readout: "19.2 / 38.4 MB"), animated: false)
    XCTAssertEqual(view.lineFrame, CGRect(x: 0, y: 494, width: 402, height: 2))
  }

  func testFailureSwapsTheLineForARetryButton() {
    let view = makeView()
    var retried = false
    view.onRetry = { retried = true }
    view.apply(.failed, animated: false)
    XCTAssertFalse(view.retryButton.isHidden)
    XCTAssertTrue(view.isLineHidden)
    view.retryButton.sendActions(for: .primaryActionTriggered)
    XCTAssertTrue(retried)
  }

  func testHiddenLeavesTouchesToThePhoto() {
    let view = makeView()
    view.apply(.hidden, animated: false)
    XCTAssertEqual(view.alpha, 0)
    XCTAssertNil(view.hitTest(CGPoint(x: 200, y: 300), with: nil))
  }
}
