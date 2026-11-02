@testable import Afilmory
import UIKit
import XCTest

@MainActor
final class DuoForcedPostureTests: XCTestCase {
  private let bounds = CGRect(x: 0, y: 0, width: 1180, height: 820)

  func testBookPutsAThinFoldAtTheCentreWithATrailingBar() {
    let context = DuoContextProvider.forcedContext("book", windowBounds: bounds)
    XCTAssertEqual(context?.barEdge, .trailing)
    guard case .book(let fold) = context?.posture else { return XCTFail("expected book posture") }
    XCTAssertEqual(fold.midX, bounds.midX, accuracy: 0.5)
    XCTAssertEqual(fold.height, bounds.height)
  }

  func testFlatAndOuterAreRecognised() {
    XCTAssertEqual(DuoContextProvider.forcedContext("flat", windowBounds: bounds), DuoContext(barEdge: .trailing, posture: .flat))
    XCTAssertEqual(DuoContextProvider.forcedContext("outer", windowBounds: bounds), DuoContext(barEdge: .trailing, posture: .single))
  }

  func testAnythingElseLeavesTheRealReading() {
    XCTAssertNil(DuoContextProvider.forcedContext(nil, windowBounds: bounds))
    XCTAssertNil(DuoContextProvider.forcedContext("tablet", windowBounds: bounds))
  }
}
