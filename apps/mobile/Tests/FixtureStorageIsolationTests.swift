@testable import Afilmory
import SDWebImage
import XCTest

final class FixtureStorageIsolationTests: XCTestCase {
  private let support = URL(fileURLWithPath: "/data/Library/Application Support", isDirectory: true)
  private let temporary = URL(fileURLWithPath: "/data/tmp", isDirectory: true)

  func testFixtureUploadsStayOutOfApplicationSupport() {
    let root = FixtureMode.storageRoot("uploads", fixture: true, base: support, temporary: temporary)
    XCTAssertTrue(root.path.hasPrefix(temporary.path))
    XCTAssertFalse(root.path.hasPrefix(support.path))
  }

  func testRealUploadsKeepTheirApplicationSupportFolder() {
    let root = FixtureMode.storageRoot("uploads", fixture: false, base: support, temporary: temporary)
    XCTAssertEqual(root.path, support.appendingPathComponent("uploads").path)
  }

  func testFixtureImageCacheUsesItsOwnDirectory() {
    let directory = FixtureMode.imageCacheDirectory(temporary: temporary)
    XCTAssertTrue(directory.hasPrefix(temporary.path))
    XCTAssertFalse(SDImageCache.shared.diskCachePath.hasPrefix(directory))
  }
}
