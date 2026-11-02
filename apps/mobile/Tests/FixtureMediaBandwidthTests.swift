@testable import Afilmory
import XCTest

final class FixtureMediaBandwidthTests: XCTestCase {
  func testWithoutBandwidthEveryFileStreamsOverHalfTheLatency() {
    XCTAssertEqual(FixtureMode.mediaStreamDuration(bytes: 40000, latency: 2, bandwidth: 0), 1)
    XCTAssertEqual(FixtureMode.mediaStreamDuration(bytes: 4_000_000, latency: 2, bandwidth: 0), 1)
  }

  func testBandwidthMakesLargerFilesArriveLater() {
    XCTAssertEqual(FixtureMode.mediaStreamDuration(bytes: 51200, latency: 2, bandwidth: 100), 0.5, accuracy: 0.0001)
    XCTAssertEqual(FixtureMode.mediaStreamDuration(bytes: 1_024_000, latency: 2, bandwidth: 100), 10, accuracy: 0.0001)
  }
}
