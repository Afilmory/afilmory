import XCTest
@testable import Afilmory

final class NativeStudioFormattersTests: XCTestCase {
  func testDatabaseTimestampAndISO8601TimestampRepresentTheSameInstant() throws {
    let databaseDate = try XCTUnwrap(
      NativeStudioFormatters.date("2026-08-08 19:41:26.38")
    )
    let isoDate = try XCTUnwrap(
      NativeStudioFormatters.date("2026-08-08T19:41:26.380Z")
    )

    XCTAssertEqual(databaseDate, isoDate)
  }
}
