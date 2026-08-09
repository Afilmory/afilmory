import XCTest
@testable import Afilmory

final class UploadCenterSessionIdentifierTests: XCTestCase {
  func testBackgroundSessionBelongsToTheInstalledAppVariant() {
    XCTAssertEqual(
      UploadCenter.sessionIdentifier(bundleIdentifier: "app.afilmory"),
      "app.afilmory.upload"
    )
    XCTAssertEqual(
      UploadCenter.sessionIdentifier(bundleIdentifier: "app.afilmory.local"),
      "app.afilmory.local.upload"
    )
  }

  func testBackgroundSessionFallsBackWhenBundleIdentifierIsUnavailable() {
    XCTAssertEqual(
      UploadCenter.sessionIdentifier(bundleIdentifier: nil),
      "app.afilmory.upload"
    )
    XCTAssertEqual(
      UploadCenter.sessionIdentifier(bundleIdentifier: "  "),
      "app.afilmory.upload"
    )
  }
}
