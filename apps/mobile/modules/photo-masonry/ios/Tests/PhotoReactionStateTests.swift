import XCTest
@testable import Afilmory

final class PhotoReactionStateTests: XCTestCase {
  func testNormalizesReactionAnalysisResponse() {
    XCTAssertEqual(
      PhotoReactionState.normalize(.object([
        "🔥": .number(3.8),
        "👏": .number(0),
        "👍": .number(2),
        "invalid": .string("4"),
      ])),
      ["🔥": 3, "👍": 2]
    )
    XCTAssertEqual(PhotoReactionState.normalize(nil), [:])
  }

  func testApplauseAccumulates() {
    let initial = PhotoReactionState(counts: ["👍": 4])
    let once = initial.adding(.like, count: 1)
    let burst = once.adding(.like, count: 12)
    XCTAssertEqual(once.counts["👍"], 5)
    XCTAssertEqual(burst.counts["👍"], 17)
    XCTAssertEqual(burst.localDeltas["👍"], 13)
  }

  func testNonPositiveCountLeavesStateUntouched() {
    let initial = PhotoReactionState(counts: ["🔥": 2])
    XCTAssertEqual(initial.adding(.fire, count: 0), initial)
    XCTAssertEqual(initial.rollingBack(.fire, count: -3), initial)
  }

  func testRollbackOnlyAffectsItsReaction() {
    let state = PhotoReactionState(counts: ["🔥": 2])
      .adding(.like, count: 3)
      .adding(.fire, count: 5)
      .rollingBack(.like, count: 3)
    XCTAssertNil(state.counts["👍"])
    XCTAssertNil(state.localDeltas["👍"])
    XCTAssertEqual(state.counts["🔥"], 7)
    XCTAssertEqual(state.localDeltas["🔥"], 5)
  }

  func testRollbackDoesNotDriveBelowZero() {
    let state = PhotoReactionState().adding(.star, count: 2).rollingBack(.star, count: 9)
    XCTAssertNil(state.counts["🌟"])
    XCTAssertNil(state.localDeltas["🌟"])
  }

  func testLateSnapshotReplaysLocalDeltas() {
    let state = PhotoReactionState().adding(.celebrate, count: 4)
      .merging(serverCounts: ["👍": 7, "🙌": 2])
    XCTAssertEqual(state.counts["👍"], 7)
    XCTAssertEqual(state.counts["🙌"], 6)
    XCTAssertEqual(state.localDeltas["🙌"], 4)
  }
}
