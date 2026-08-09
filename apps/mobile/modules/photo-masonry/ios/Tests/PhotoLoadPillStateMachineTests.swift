import XCTest

@testable import Afilmory

final class PhotoLoadPillStateMachineTests: XCTestCase {
  func testFastLoadNeverShows() {
    var machine = PhotoLoadPillStateMachine()
    machine.handle(.loading(tier: 1, receivedBytes: 0, expectedBytes: 0), now: 0)
    XCTAssertEqual(machine.display, .hidden)

    machine.handle(.finished, now: 0.2)
    machine.tick(now: 1)
    XCTAssertEqual(machine.display, .hidden)
  }

  func testFirstLoadShowsAfterDelay() {
    var machine = PhotoLoadPillStateMachine()
    machine.handle(.loading(tier: 1, receivedBytes: 0, expectedBytes: 0), now: 0)
    machine.handle(.loading(tier: 1, receivedBytes: 100, expectedBytes: 1000), now: 0.2)
    XCTAssertEqual(machine.display, .hidden)

    machine.tick(now: 0.4)
    XCTAssertEqual(machine.display, .loading(receivedBytes: 100, expectedBytes: 1000))
  }

  func testTierUpgradeUsesLongerDelay() {
    var machine = PhotoLoadPillStateMachine()
    machine.handle(.loading(tier: 2, receivedBytes: 0, expectedBytes: 0), now: 0)
    machine.tick(now: 0.5)
    XCTAssertEqual(machine.display, .hidden)

    machine.tick(now: 1.1)
    XCTAssertEqual(machine.display, .loading(receivedBytes: 0, expectedBytes: nil))
  }

  func testUnknownTotalReportsIndeterminate() {
    var machine = PhotoLoadPillStateMachine()
    machine.handle(.loading(tier: 1, receivedBytes: 0, expectedBytes: 0), now: 0)
    machine.tick(now: 0.4)
    machine.handle(.loading(tier: 1, receivedBytes: 512, expectedBytes: -1), now: 0.5)
    XCTAssertEqual(machine.display, .loading(receivedBytes: 512, expectedBytes: nil))
  }

  func testTierUpgradeWhileShowingKeepsShowing() {
    var machine = PhotoLoadPillStateMachine()
    machine.handle(.loading(tier: 1, receivedBytes: 0, expectedBytes: 0), now: 0)
    machine.tick(now: 0.4)
    machine.handle(.loading(tier: 2, receivedBytes: 10, expectedBytes: 100), now: 0.5)
    XCTAssertEqual(machine.display, .loading(receivedBytes: 10, expectedBytes: 100))
  }

  func testIdleResetHidesImmediately() {
    var machine = PhotoLoadPillStateMachine()
    machine.handle(.loading(tier: 1, receivedBytes: 0, expectedBytes: 0), now: 0)
    machine.tick(now: 0.4)
    XCTAssertNotEqual(machine.display, .hidden)

    machine.handle(.idle, now: 0.5)
    XCTAssertEqual(machine.display, .hidden)
  }

  func testFailureShowsErrorThenHidesAfterHold() {
    var machine = PhotoLoadPillStateMachine()
    machine.handle(.loading(tier: 1, receivedBytes: 0, expectedBytes: 0), now: 0)
    machine.handle(.failed, now: 0.1)
    XCTAssertEqual(machine.display, .error)

    machine.tick(now: 2.0)
    XCTAssertEqual(machine.display, .error)
    machine.tick(now: 2.7)
    XCTAssertEqual(machine.display, .hidden)
  }

  func testRestartAfterErrorBeginsFreshDelay() {
    var machine = PhotoLoadPillStateMachine()
    machine.handle(.loading(tier: 1, receivedBytes: 0, expectedBytes: 0), now: 0)
    machine.handle(.failed, now: 0.1)
    machine.handle(.loading(tier: 1, receivedBytes: 0, expectedBytes: 0), now: 1)
    XCTAssertEqual(machine.display, .hidden)

    machine.tick(now: 1.4)
    XCTAssertEqual(machine.display, .loading(receivedBytes: 0, expectedBytes: nil))
  }

  func testNextDeadlineTracksPhase() {
    var machine = PhotoLoadPillStateMachine()
    XCTAssertNil(machine.nextDeadline)

    machine.handle(.loading(tier: 1, receivedBytes: 0, expectedBytes: 0), now: 0)
    XCTAssertEqual(machine.nextDeadline, PhotoLoadPillStateMachine.firstLoadDelay)

    machine.tick(now: 0.4)
    XCTAssertNil(machine.nextDeadline)

    machine.handle(.failed, now: 0.5)
    XCTAssertEqual(machine.nextDeadline, 0.5 + PhotoLoadPillStateMachine.errorHold)
  }
}

final class PhotoViewerImageLoadCallbacksTests: XCTestCase {
  @MainActor
  func testProgressCallbackReturnsToMainActorWhenInvokedFromBackgroundQueue() async {
    let callbackHandled = expectation(description: "Progress callback handled on MainActor")
    let callback = PhotoViewerImageLoadCallbacks.progress { receivedBytes, expectedBytes in
      MainActor.assertIsolated()
      XCTAssertEqual(receivedBytes, 256)
      XCTAssertEqual(expectedBytes, 1_024)
      callbackHandled.fulfill()
    }

    DispatchQueue.global(qos: .userInitiated).async {
      callback(256, 1_024, nil)
    }

    await fulfillment(of: [callbackHandled], timeout: 1)
  }
}
