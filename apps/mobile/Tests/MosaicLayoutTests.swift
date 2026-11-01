@testable import Afilmory
import CoreGraphics
import XCTest

final class MosaicLayoutTests: XCTestCase {
  private let width: CGFloat = 330
  private let gap: CGFloat = 3

  func testEmptyInputProducesNoTiles() {
    let layout = MosaicLayout(aspectRatios: [], width: width, gap: gap)
    XCTAssertTrue(layout.tiles.isEmpty)
    XCTAssertEqual(layout.overflow, 0)
    XCTAssertEqual(layout.size, .zero)
  }

  func testRowSplitFollowsSpec() {
    XCTAssertEqual(MosaicLayout.rowSplit(count: 1), [1])
    XCTAssertEqual(MosaicLayout.rowSplit(count: 2), [2])
    XCTAssertEqual(MosaicLayout.rowSplit(count: 3), [3])
    XCTAssertEqual(MosaicLayout.rowSplit(count: 4), [2, 2])
    XCTAssertEqual(MosaicLayout.rowSplit(count: 5), [2, 3])
    XCTAssertEqual(MosaicLayout.rowSplit(count: 6), [3, 3])
    XCTAssertEqual(MosaicLayout.rowSplit(count: 11), [3, 3])
  }

  func testSingleLandscapePhotoFillsWidthAtItsOwnRatio() {
    let layout = MosaicLayout(aspectRatios: [1.5], width: width, gap: gap)
    XCTAssertEqual(layout.tiles.count, 1)
    XCTAssertEqual(layout.tiles[0].width, width, accuracy: 0.5)
    XCTAssertEqual(layout.tiles[0].height, width / 1.5, accuracy: 0.5)
    XCTAssertEqual(layout.size.height, layout.tiles[0].height, accuracy: 0.01)
  }

  func testSinglePortraitPhotoIsCappedAt400AndLeftAligned() {
    let layout = MosaicLayout(aspectRatios: [2.0 / 3.0], width: width, gap: gap)
    let tile = layout.tiles[0]
    XCTAssertEqual(tile.height, 400, accuracy: 0.5)
    XCTAssertEqual(tile.width, 400 * 2.0 / 3.0, accuracy: 0.5)
    XCTAssertEqual(tile.minX, 0)
    XCTAssertEqual(layout.size.width, tile.width, accuracy: 0.5)
  }

  func testTwoPhotosShareOneRowWithEqualHeightsFillingWidth() {
    let layout = MosaicLayout(aspectRatios: [1.5, 1.0], width: width, gap: gap)
    XCTAssertEqual(layout.tiles.count, 2)
    XCTAssertEqual(layout.tiles[0].height, layout.tiles[1].height, accuracy: 0.01)
    XCTAssertEqual(layout.tiles[0].minY, layout.tiles[1].minY)
    XCTAssertEqual(layout.tiles[1].maxX, width, accuracy: 0.01)
    XCTAssertEqual(layout.tiles[1].minX - layout.tiles[0].maxX, gap, accuracy: 0.5)
    XCTAssertEqual(layout.tiles[0].width / layout.tiles[0].height, 1.5, accuracy: 0.02)
  }

  func testThreePortraitsInOneRowAreCappedAt300() {
    let layout = MosaicLayout(aspectRatios: [0.3, 0.3, 0.3], width: width, gap: gap)
    XCTAssertEqual(layout.tiles.count, 3)
    for tile in layout.tiles {
      XCTAssertEqual(tile.height, 300, accuracy: 0.5)
      XCTAssertEqual(tile.width, 90, accuracy: 0.5)
    }
    XCTAssertLessThan(layout.size.width, width)
  }

  func testFourPhotosSplitTwoAndTwo() {
    let layout = MosaicLayout(aspectRatios: [1.5, 1.5, 1.5, 1.5], width: width, gap: gap)
    XCTAssertEqual(layout.tiles.count, 4)
    XCTAssertEqual(layout.tiles[0].minY, layout.tiles[1].minY)
    XCTAssertEqual(layout.tiles[2].minY, layout.tiles[1].maxY + gap, accuracy: 0.5)
    XCTAssertEqual(layout.tiles[3].maxX, width, accuracy: 0.01)
    XCTAssertEqual(layout.size.height, layout.tiles[3].maxY, accuracy: 0.01)
  }

  func testFivePhotosSplitTwoThenThree() {
    let layout = MosaicLayout(aspectRatios: [1.5, 1, 1.5, 0.75, 1], width: width, gap: gap)
    XCTAssertEqual(layout.tiles.count, 5)
    XCTAssertEqual(layout.tiles[0].minY, layout.tiles[1].minY)
    XCTAssertGreaterThan(layout.tiles[2].minY, layout.tiles[1].minY)
    XCTAssertEqual(layout.tiles[2].minY, layout.tiles[3].minY)
    XCTAssertEqual(layout.tiles[3].minY, layout.tiles[4].minY)
  }

  func testMultiRowHeightIsCappedAt260() {
    let layout = MosaicLayout(aspectRatios: [0.3, 0.3, 0.3, 0.3, 0.3, 0.3], width: width, gap: gap)
    XCTAssertEqual(layout.tiles.count, 6)
    for tile in layout.tiles {
      XCTAssertEqual(tile.height, 260, accuracy: 0.5)
    }
    XCTAssertEqual(layout.size.height, 260 * 2 + gap, accuracy: 0.5)
  }

  func testMoreThanSixShowsSixTilesAndOverflowCount() {
    let layout = MosaicLayout(aspectRatios: Array(repeating: 1.5, count: 9), width: width, gap: gap)
    XCTAssertEqual(layout.tiles.count, 6)
    XCTAssertEqual(layout.overflow, 3)
    XCTAssertEqual(layout.tiles[5].minY, layout.tiles[3].minY)
  }

  func testInvalidRatiosFallBackToSquare() {
    let layout = MosaicLayout(aspectRatios: [0, .nan], width: width, gap: gap)
    XCTAssertEqual(layout.tiles.count, 2)
    XCTAssertEqual(layout.tiles[0].width, layout.tiles[1].width, accuracy: 1)
  }

  func testCardHeightFollowsContentWithoutEmptySpace() {
    let layout = MosaicLayout(aspectRatios: [1.5, 1.5, 1.5, 1.5, 1.5], width: width, gap: gap)
    let maxY = layout.tiles.map(\.maxY).max() ?? 0
    XCTAssertEqual(layout.size.height, maxY, accuracy: 0.01)
  }
}
