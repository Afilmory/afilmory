@testable import Afilmory
import XCTest

final class ProjectionTimelineTests: XCTestCase {
  func testStartsAtTheOpenerIndexClamped() {
    XCTAssertEqual(ProjectionTimeline(count: 18, startIndex: 6, now: 0).index, 6)
    XCTAssertEqual(ProjectionTimeline(count: 18, startIndex: 40, now: 0).index, 17)
    XCTAssertEqual(ProjectionTimeline(count: 18, startIndex: -2, now: 0).index, 0)
  }

  func testAdvancesEveryIntervalAndWraps() {
    var timeline = ProjectionTimeline(count: 3, startIndex: 1, now: 10)
    XCTAssertEqual(ProjectionTimeline.interval, 3.6)
    XCTAssertFalse(timeline.tick(at: 13.5))
    XCTAssertEqual(timeline.index, 1)
    XCTAssertTrue(timeline.tick(at: 13.6))
    XCTAssertEqual(timeline.index, 2)
    XCTAssertFalse(timeline.tick(at: 17.1))
    XCTAssertTrue(timeline.tick(at: 17.2))
    XCTAssertEqual(timeline.index, 0)
  }

  func testManualStepsWrapAndResetTheTimer() {
    var timeline = ProjectionTimeline(count: 4, startIndex: 0, now: 0)
    timeline.step(-1, at: 3)
    XCTAssertEqual(timeline.index, 3)
    XCTAssertEqual(timeline.progress(at: 3), 0, accuracy: 0.0001)
    XCTAssertFalse(timeline.tick(at: 6.5))
    XCTAssertTrue(timeline.tick(at: 6.6))
    XCTAssertEqual(timeline.index, 0)
    timeline.step(1, at: 7)
    XCTAssertEqual(timeline.index, 1)
  }

  func testProgressIsTheFractionOfTheCurrentCycle() {
    let timeline = ProjectionTimeline(count: 5, startIndex: 0, now: 2)
    XCTAssertEqual(timeline.progress(at: 2), 0, accuracy: 0.0001)
    XCTAssertEqual(timeline.progress(at: 3.8), 0.5, accuracy: 0.0001)
    XCTAssertEqual(timeline.progress(at: 99), 1, accuracy: 0.0001)
  }

  func testSinglePhotoNeverAdvancesAndEmptyIsInert() {
    var single = ProjectionTimeline(count: 1, startIndex: 0, now: 0)
    XCTAssertFalse(single.tick(at: 10))
    XCTAssertEqual(single.index, 0)
    var empty = ProjectionTimeline(count: 0, startIndex: 3, now: 0)
    XCTAssertFalse(empty.tick(at: 10))
    empty.step(1, at: 11)
    XCTAssertEqual(empty.index, 0)
  }

  func testCounterReadsCurrentOverTotal() {
    let timeline = ProjectionTimeline(count: 18, startIndex: 6, now: 0)
    XCTAssertEqual(timeline.frameNumber, "07")
    XCTAssertEqual(timeline.totalNumber, "18")
  }
}
