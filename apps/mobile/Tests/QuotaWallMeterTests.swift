@testable import Afilmory
import XCTest

final class QuotaWallMeterTests: XCTestCase {
  func testASmallLibraryIsDrawnAsOneFramePerPhoto() {
    let meter = QuotaWallReason.libraryItems(current: 20, limit: 20).meter
    XCTAssertEqual(meter, QuotaMeter(used: 20, projected: nil, limit: 20, frames: 20))
  }

  func testLargeCountsAndBytesUseABarWithTheIncomingAmount() {
    XCTAssertEqual(QuotaWallReason.libraryItems(current: 4_900, limit: 5_000).meter?.frames, nil)
    XCTAssertEqual(
      QuotaWallReason.storage(usedBytes: 900, incomingBytes: 200, capacityBytes: 1_000).meter,
      QuotaMeter(used: 900, projected: 1_100, limit: 1_000, frames: nil)
    )
    XCTAssertEqual(
      QuotaWallReason.monthlyProcess(used: 48, limit: 50, requested: 5).meter,
      QuotaMeter(used: 48, projected: 53, limit: 50, frames: nil)
    )
  }

  func testReasonsWithoutARunningTotalHaveNoMeter() {
    XCTAssertNil(QuotaWallReason.unknown.meter)
    XCTAssertNil(QuotaWallReason.customDomain(current: 0, limit: 0).meter)
    XCTAssertNil(QuotaWallReason.uploadSize(actualMb: 0, limitMb: 100).meter)
    XCTAssertEqual(QuotaWallReason.uploadSize(actualMb: 140, limitMb: 100).meter, QuotaMeter(used: 140, projected: nil, limit: 100, frames: nil))
  }
}
