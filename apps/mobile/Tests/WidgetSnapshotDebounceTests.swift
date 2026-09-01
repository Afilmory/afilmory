import XCTest

@testable import Afilmory

final class WidgetSnapshotDebounceTests: XCTestCase {
  func testFreshWriterRuns() async {
    let writer = WidgetSnapshotWriter(minimumInterval: 3600)
    let result = await writer.shouldRun(at: Date(timeIntervalSince1970: 0))
    XCTAssertTrue(result)
  }

  func testRunWithinIntervalIsRejectedBeforeAnyRead() async {
    let start = Date(timeIntervalSince1970: 0)
    let writer = WidgetSnapshotWriter(minimumInterval: 3600, lastRun: start)

    let tooSoon = await writer.shouldRun(at: start.addingTimeInterval(3599))
    let dueAgain = await writer.shouldRun(at: start.addingTimeInterval(3600))

    XCTAssertFalse(tooSoon)
    XCTAssertTrue(dueAgain)
  }
}
