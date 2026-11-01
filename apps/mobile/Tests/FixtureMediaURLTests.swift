@testable import Afilmory
import XCTest

final class FixtureMediaURLTests: XCTestCase {
  func testFixtureMediaURLResolvesToTheBundledFileForAVFoundation() throws {
    let resolved = FixtureMode.playableURL(for: FixtureMode.mediaURL("IMG_5484.mov"))
    XCTAssertTrue(resolved.isFileURL, resolved.absoluteString)
    XCTAssertTrue(FileManager.default.fileExists(atPath: resolved.path))
  }

  func testOtherURLsAreUntouched() throws {
    let remote = try XCTUnwrap(URL(string: "https://innei.afilmory.art/photos/IMG_5484.mov"))
    XCTAssertEqual(FixtureMode.playableURL(for: remote), remote)
    let missing = FixtureMode.mediaURL("does-not-exist.mov")
    XCTAssertEqual(FixtureMode.playableURL(for: missing), missing)
  }
}
