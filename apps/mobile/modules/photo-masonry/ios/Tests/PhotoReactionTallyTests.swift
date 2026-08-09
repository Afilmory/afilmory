import XCTest
@testable import Afilmory

final class PhotoReactionTallyTests: XCTestCase {
  func testRepeatedReactionsInsideWindowMerge() {
    let first = PhotoReactionTallyEngine.accumulate(current: nil, reaction: "🔥", count: 1, now: 1)
    let second = PhotoReactionTallyEngine.accumulate(current: first.tally, reaction: "🔥", count: 1, now: 1.3)
    let third = PhotoReactionTallyEngine.accumulate(current: second.tally, reaction: "🔥", count: 14, now: 1.9)
    XCTAssertNil(first.flush)
    XCTAssertNil(second.flush)
    XCTAssertNil(third.flush)
    XCTAssertEqual(third.tally?.count, 16)
    XCTAssertEqual(third.tally?.deadline, 2.7)
  }

  func testDifferentReactionFlushesPreviousTally() {
    let like = PhotoReactionTallyEngine.accumulate(current: nil, reaction: "👍", count: 3, now: 0.5)
    let fire = PhotoReactionTallyEngine.accumulate(current: like.tally, reaction: "🔥", count: 1, now: 0.6)
    XCTAssertEqual(fire.flush, PhotoReactionFlush(count: 3, reaction: "👍"))
    XCTAssertEqual(fire.tally, PhotoReactionTally(count: 1, deadline: 1.4, reaction: "🔥"))
  }

  func testReactionAtDeadlineFlushesRatherThanExtends() {
    let first = PhotoReactionTallyEngine.accumulate(current: nil, reaction: "👏", count: 2, now: 0)
    let late = PhotoReactionTallyEngine.accumulate(
      current: first.tally,
      reaction: "👏",
      count: 1,
      now: PhotoReactionTallyEngine.mergeWindow
    )
    XCTAssertEqual(late.flush, PhotoReactionFlush(count: 2, reaction: "👏"))
    XCTAssertEqual(late.tally?.count, 1)
  }

  func testExpiryFlushesAtDeadlineOnce() {
    let tally = PhotoReactionTallyEngine.accumulate(current: nil, reaction: "🌟", count: 5, now: 0).tally
    let early = PhotoReactionTallyEngine.expire(
      current: tally,
      now: PhotoReactionTallyEngine.mergeWindow - 0.001
    )
    XCTAssertNil(early.flush)
    XCTAssertEqual(early.tally, tally)
    let due = PhotoReactionTallyEngine.expire(current: tally, now: PhotoReactionTallyEngine.mergeWindow)
    XCTAssertEqual(due.flush, PhotoReactionFlush(count: 5, reaction: "🌟"))
    XCTAssertNil(due.tally)
    XCTAssertEqual(
      PhotoReactionTallyEngine.expire(current: nil, now: 9),
      PhotoReactionTallyStep(flush: nil, tally: nil)
    )
  }

  func testDrainFlushesPendingTally() {
    let tally = PhotoReactionTallyEngine.accumulate(current: nil, reaction: "🙌", count: 7, now: 0).tally
    XCTAssertEqual(
      PhotoReactionTallyEngine.drain(current: tally),
      PhotoReactionTallyStep(flush: PhotoReactionFlush(count: 7, reaction: "🙌"), tally: nil)
    )
    XCTAssertEqual(
      PhotoReactionTallyEngine.drain(current: nil),
      PhotoReactionTallyStep(flush: nil, tally: nil)
    )
  }

  func testNonPositiveCountDoesNotDisturbTally() {
    let tally = PhotoReactionTallyEngine.accumulate(current: nil, reaction: "😍", count: 2, now: 0).tally
    let ignored = PhotoReactionTallyEngine.accumulate(current: tally, reaction: "🔥", count: 0, now: 0.1)
    XCTAssertNil(ignored.flush)
    XCTAssertEqual(ignored.tally, tally)
  }
}
