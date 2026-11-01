@testable import Afilmory
import XCTest

final class DarkroomReviewSelectionTests: XCTestCase {
  func testStartsWithEveryPickSelectedInOrder() {
    let selection = DarkroomReviewSelection(ids: ["a", "b", "c"])
    XCTAssertEqual(selection.selected, ["a", "b", "c"])
    XCTAssertEqual(selection.number(for: "c"), 3)
  }

  func testDeselectRenumbersTheRest() {
    var selection = DarkroomReviewSelection(ids: ["a", "b", "c", "d"])
    selection.toggle("b")
    XCTAssertNil(selection.number(for: "b"))
    XCTAssertEqual(selection.number(for: "a"), 1)
    XCTAssertEqual(selection.number(for: "c"), 2)
    XCTAssertEqual(selection.number(for: "d"), 3)
    XCTAssertEqual(selection.count, 3)
  }

  func testReselectAppendsAtTheEnd() {
    var selection = DarkroomReviewSelection(ids: ["a", "b", "c"])
    selection.toggle("a")
    selection.toggle("a")
    XCTAssertEqual(selection.selected, ["b", "c", "a"])
    XCTAssertEqual(selection.number(for: "a"), 3)
  }

  func testUnknownIdIsIgnored() {
    var selection = DarkroomReviewSelection(ids: ["a"])
    selection.toggle("z")
    XCTAssertEqual(selection.selected, ["a"])
  }

  func testTagsToggleKeepLibraryOrder() {
    var tags = DarkroomTagSelection(available: ["bird", "旅鸫", "家燕"])
    tags.toggle("家燕")
    tags.toggle("bird")
    XCTAssertEqual(tags.chosen, ["bird", "家燕"])
    tags.toggle("bird")
    XCTAssertEqual(tags.chosen, ["家燕"])
    XCTAssertTrue(tags.isOn("家燕"))
    XCTAssertFalse(tags.isOn("bird"))
  }

  func testLibraryTagsAreDistinctTrimmedAndOrdered() {
    let photos: [[String]] = [["bird", " 旅鸫 "], ["bird", ""], ["家燕"]]
    XCTAssertEqual(DarkroomTagSelection.libraryTags(photos), ["bird", "旅鸫", "家燕"])
  }
}
