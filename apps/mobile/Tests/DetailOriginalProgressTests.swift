@testable import Afilmory
import CoreGraphics
import XCTest

final class DetailOriginalProgressTests: XCTestCase {
  func testStaysHiddenForTheFirstMoment() {
    var machine = DetailOriginalProgress()
    machine.start(now: 0)
    machine.receive(bytes: 16_100_000, of: 38_400_000, now: 0.2)
    XCTAssertEqual(machine.display, .hidden)
  }

  func testShowsTheLineAndReadoutOnceTheDelayPasses() {
    var machine = DetailOriginalProgress()
    machine.start(now: 0)
    machine.receive(bytes: 16_100_000, of: 38_400_000, now: 0.2)
    machine.tick(now: 0.36)
    XCTAssertEqual(machine.display, .loading(fraction: 16_100_000 / 38_400_000, readout: "16.1 / 38.4 MB"))
  }

  func testUnknownSizeShowsOnlyTheReceivedAmount() {
    var machine = DetailOriginalProgress()
    machine.start(now: 0)
    machine.receive(bytes: 16_100_000, of: -1, now: 0.4)
    XCTAssertEqual(machine.display, .loading(fraction: nil, readout: "16.1 MB"))
  }

  func testACachedOriginalNeverFlashesTheIndicator() {
    var machine = DetailOriginalProgress()
    machine.start(now: 0)
    machine.finish(now: 0.05)
    machine.tick(now: 1)
    XCTAssertEqual(machine.display, .hidden)
  }

  func testFinishingAfterShowingRunsTheLineToTheEnd() {
    var machine = DetailOriginalProgress()
    machine.start(now: 0)
    machine.receive(bytes: 1_000_000, of: 2_000_000, now: 0.5)
    machine.finish(now: 0.8)
    XCTAssertEqual(machine.display, .complete)
  }

  func testFailureOffersRetryRightAway() {
    var machine = DetailOriginalProgress()
    machine.start(now: 0)
    machine.fail()
    XCTAssertEqual(machine.display, .failed)
  }

  func testRetryingStartsOverQuietly() {
    var machine = DetailOriginalProgress()
    machine.start(now: 0)
    machine.fail()
    machine.start(now: 5)
    XCTAssertEqual(machine.display, .hidden)
    machine.tick(now: 5.4)
    XCTAssertEqual(machine.display, .loading(fraction: nil, readout: "0.0 MB"))
  }

  func testTheLineSitsOnThePhotosBottomEdge() {
    let line = DetailOriginalProgress.lineY(image: CGRect(x: 0, y: 226, width: 402, height: 268), floor: 600)
    XCTAssertEqual(line, 494)
  }

  func testATallPhotoKeepsTheReadoutAboveTheChips() {
    let line = DetailOriginalProgress.lineY(image: CGRect(x: 40, y: 62, width: 320, height: 640), floor: 640)
    XCTAssertEqual(line, 640 - DetailOriginalProgress.readoutBlock)
  }
}
