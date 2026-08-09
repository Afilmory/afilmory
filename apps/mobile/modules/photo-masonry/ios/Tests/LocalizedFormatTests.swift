import XCTest
@testable import Afilmory

/// Multi-argument literals are stored in the catalog with positional specifiers
/// (`Uploaded %1$lld of %2$lld`). If the compiler ever extracts them differently the
/// lookup misses and every language silently renders the English source, which no
/// other test would notice.
final class LocalizedFormatTests: XCTestCase {
  func testInterpolatedLiteralsResolveAgainstTheCatalog() throws {
    try XCTSkipIf(
      Bundle.main.preferredLocalizations.first == "en",
      "Only a non-English run can tell a hit from a fallback."
    )
    XCTAssertFalse(String(localized: "Uploaded \(1) of \(2)").contains("Uploaded"))
    XCTAssertFalse(String(localized: "Sent \(2) \("heart")").contains("Sent"))
    XCTAssertFalse(
      String(localized: "Photo location, latitude \("1.0"), longitude \("2.0")").contains("latitude")
    )
    XCTAssertFalse(
      String(
        localized: "Your comments, reactions, followed galleries, device registrations, and other account data will be removed. \(1) joined workspaces will be left. \(2) subscriptions require cleanup."
      ).contains("removed")
    )
    XCTAssertFalse(String(localized: "User \("abc123")").contains("User"))
    XCTAssertFalse(String(localized: "\(3) matching photos").contains("matching"))
    XCTAssertFalse(String(localized: "Open \("Alpha")").contains("Open"))
  }
}
