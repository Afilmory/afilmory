@testable import Afilmory
import XCTest

final class StudioLibrarySelectionTests: XCTestCase {
  func testInactiveSelectionIgnoresToggles() {
    var selection = StudioLibrarySelection()
    selection.toggle("a")
    XCTAssertTrue(selection.ids.isEmpty)
  }

  func testTogglingAddsAndRemoves() {
    var selection = StudioLibrarySelection()
    selection.begin()
    selection.toggle("a")
    selection.toggle("b")
    selection.toggle("a")
    XCTAssertEqual(selection.ids, ["b"])
    XCTAssertTrue(selection.contains("b"))
  }

  func testEndClearsSelection() {
    var selection = StudioLibrarySelection()
    selection.begin()
    selection.toggle("a")
    selection.end()
    XCTAssertFalse(selection.isActive)
    XCTAssertTrue(selection.ids.isEmpty)
  }

  func testPruneDropsIdsNoLongerInLibrary() {
    var selection = StudioLibrarySelection()
    selection.begin()
    selection.toggle("a")
    selection.toggle("b")
    selection.prune(keeping: ["b", "c"])
    XCTAssertEqual(selection.ids, ["b"])
  }

  func testManagedStorageOffersOnlyFullDeletion() {
    XCTAssertEqual(StudioLibrarySelection.deleteChoices(storageProviders: ["managed", "s3"]), [.deleteFiles])
  }

  func testSelfManagedStorageOffersRecordOrFiles() {
    XCTAssertEqual(StudioLibrarySelection.deleteChoices(storageProviders: ["s3"]), [.removeRecord, .deleteFiles])
  }

  func testHeaderMeta() {
    XCTAssertEqual(StudioLibrarySelection.meta(frames: 18, selected: nil), "18 frames · by capture time")
    XCTAssertEqual(StudioLibrarySelection.meta(frames: 18, selected: 2), "2 selected")
  }
}
