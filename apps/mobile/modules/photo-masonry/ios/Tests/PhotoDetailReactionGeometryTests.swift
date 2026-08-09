import XCTest
@testable import Afilmory

final class PhotoDetailReactionGeometryTests: XCTestCase {
  private typealias Geometry = PhotoDetailReactionGeometry

  func testMagnificationPeaksUnderTheFingerAndDecays() {
    XCTAssertEqual(Geometry.restDiameter * Geometry.magnification(distance: 0), Geometry.peakDiameter, accuracy: 0.001)

    let neighbour = Geometry.restDiameter * Geometry.magnification(distance: Geometry.pitch)
    XCTAssertEqual(neighbour, 42, accuracy: 1)

    let distant = Geometry.restDiameter * Geometry.magnification(distance: Geometry.pitch * 3)
    XCTAssertEqual(distant, Geometry.restDiameter, accuracy: 0.5)
  }

  // Overlapping glass circles would trigger the container effect's merge blob,
  // so the peak and its neighbour must still clear each other at rest pitch.
  func testMagnifiedItemsDoNotOverlapTheirNeighbours() {
    let peakRadius = Geometry.peakDiameter / 2
    let neighbourRadius = Geometry.restDiameter * Geometry.magnification(distance: Geometry.pitch) / 2
    XCTAssertLessThanOrEqual(peakRadius + neighbourRadius, Geometry.pitch)
  }

  func testIndexMapsFromXAndClampsToBounds() {
    XCTAssertEqual(Geometry.index(atX: Geometry.restCenterX(index: 0), itemCount: 6), 0)
    XCTAssertEqual(Geometry.index(atX: Geometry.restCenterX(index: 3), itemCount: 6), 3)
    XCTAssertEqual(Geometry.index(atX: Geometry.restCenterX(index: 5), itemCount: 6), 5)
    XCTAssertEqual(Geometry.index(atX: -400, itemCount: 6), 0)
    XCTAssertEqual(Geometry.index(atX: 4000, itemCount: 6), 5)
    XCTAssertEqual(Geometry.index(atX: 40, itemCount: 0), 0)
  }

  func testContainerWidthCoversEveryItemAndBothInsets() {
    XCTAssertEqual(
      Geometry.containerWidth(itemCount: 6),
      6 * Geometry.restDiameter + 5 * Geometry.spacing + Geometry.containerInset.left + Geometry.containerInset.right,
      accuracy: 0.001
    )
    XCTAssertEqual(
      Geometry.containerWidth(itemCount: 0),
      Geometry.containerInset.left + Geometry.containerInset.right,
      accuracy: 0.001
    )
  }

  // The collapsed button must land on the pressed item, share the bar's bottom
  // edge, and therefore only ever grow away from the toolbar.
  func testCollapsedContainerAnchorsOnTheFocusedItemAndGrowsUpward() {
    let bounds = CGRect(x: 0, y: 0, width: Geometry.containerWidth(itemCount: 6), height: Geometry.railHeight)
    let expanded = Geometry.expandedContainerRect(in: bounds)

    for index in 0 ..< 6 {
      let collapsed = Geometry.collapsedContainerRect(in: bounds, focusedIndex: index)
      XCTAssertEqual(collapsed.midX, Geometry.restCenterX(index: index), accuracy: 0.001)
      XCTAssertEqual(collapsed.maxY, expanded.maxY, accuracy: 0.001)
      XCTAssertLessThan(collapsed.minY, expanded.minY)
      XCTAssertEqual(collapsed.width, collapsed.height, accuracy: 0.001)
    }
  }

  func testStreamProgressRampsThenHolds() {
    XCTAssertEqual(Geometry.streamProgress(shotIndex: 0), 0, accuracy: 0.001)
    XCTAssertEqual(Geometry.streamProgress(shotIndex: Geometry.streamShotsToPeak - 1), 1, accuracy: 0.001)
    XCTAssertEqual(Geometry.streamProgress(shotIndex: Geometry.streamShotsToPeak * 4), 1, accuracy: 0.001)
  }
}
