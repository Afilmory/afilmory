@testable import Afilmory
import UIKit
import XCTest

@MainActor
final class UICatalogRegistryTests: XCTestCase {
  func testEntryIDsAreUniqueAndScriptSafe() {
    let ids = UICatalog.entries.map(\.id)
    XCTAssertEqual(ids.count, Set(ids).count, "duplicate catalog ids")
    let pattern = try! NSRegularExpression(pattern: "^[a-z0-9]+(\\.[a-z0-9-]+)+$")
    for id in ids {
      XCTAssertNotNil(pattern.firstMatch(in: id, range: NSRange(id.startIndex..., in: id)), id)
    }
  }

  func testEveryEntryResolves() {
    for entry in UICatalog.entries {
      XCTAssertEqual(UICatalog.entry(entry.id)?.id, entry.id)
      XCTAssertGreaterThan(entry.settle, 0, entry.id)
    }
    XCTAssertNil(UICatalog.entry("nope.missing"))
  }

  func testScreenEntriesBuildTheirControllers() {
    for entry in UICatalog.entries {
      guard case .screen(let make) = entry.launch else { continue }
      let controller = make()
      controller.loadViewIfNeeded()
      XCTAssertNotNil(controller.view, entry.id)
    }
  }

  func testListingHasOneLinePerEntry() {
    let lines = UICatalog.listing().split(separator: "\n")
    XCTAssertEqual(lines.count, UICatalog.entries.count)
    XCTAssertTrue(lines.allSatisfy { $0.split(separator: "\t").count == 4 })
  }

  func testShellCoversEveryTabAndVisitor() {
    let ids = Set(UICatalog.entries.map(\.id))
    for id in ["shell.exhibition", "shell.viewing", "shell.darkroom", "shell.visitor", "shell.offline"] {
      XCTAssertTrue(ids.contains(id), id)
    }
  }

  func testOnboardingAndSheetStatesAreCatalogued() {
    let ids = Set(UICatalog.entries.map(\.id))
    for id in [
      "onboarding.intro", "onboarding.intro-signin", "onboarding.signin", "onboarding.setup",
      "onboarding.setup-waiting", "onboarding.permissions", "onboarding.first-roll",
      "billing.subscription", "billing.quota-wall", "account.deletion", "auth.email-sheet",
    ] {
      XCTAssertTrue(ids.contains(id), id)
    }
  }
}
