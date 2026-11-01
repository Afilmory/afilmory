@testable import Afilmory
import XCTest

final class RevisionStreamReconnectPolicyTests: XCTestCase {
  func testCleanCloseAfterALongConnectionReconnectsSoon() {
    var policy = RevisionStreamReconnectPolicy()
    XCTAssertEqual(policy.nextDelay(connectedFor: 600, failed: false), 1)
  }

  func testImmediateCloseBacksOffInsteadOfSpinning() {
    var policy = RevisionStreamReconnectPolicy()
    let delays = (0..<6).map { _ in policy.nextDelay(connectedFor: 0.05, failed: false) }
    XCTAssertEqual(delays, [3, 6, 12, 24, 30, 30])
  }

  func testFailuresBackOffAndAStableConnectionResets() {
    var policy = RevisionStreamReconnectPolicy()
    XCTAssertEqual(policy.nextDelay(connectedFor: 0, failed: true), 3)
    XCTAssertEqual(policy.nextDelay(connectedFor: 0, failed: true), 6)
    XCTAssertEqual(policy.nextDelay(connectedFor: 120, failed: false), 1)
    XCTAssertEqual(policy.nextDelay(connectedFor: 0, failed: true), 3)
  }
}
