@testable import Afilmory
import XCTest

@MainActor
final class WorkspaceSetupModelTests: XCTestCase {
  private var flags: OnboardingFlags!

  override func setUp() {
    super.setUp()
    let defaults = UserDefaults(suiteName: "WorkspaceSetupModelTests")!
    defaults.removePersistentDomain(forName: "WorkspaceSetupModelTests")
    flags = OnboardingFlags(defaults: defaults)
  }

  private func model(
    name: String = "Innei",
    email: String = "innei@example.com",
    taken: Set<String> = [],
    created: ((String, String) -> Void)? = nil
  ) -> WorkspaceSetupModel {
    WorkspaceSetupModel(
      displayName: name,
      email: email,
      flags: flags,
      check: { slug in taken.contains(slug) ? .unavailable("taken") : .available(slug) },
      create: { name, slug in created?(name, slug) }
    )
  }

  func testDefaultsComeFromTheAccountNotTheGalleryName() {
    let setup = model()
    XCTAssertEqual(setup.name, "Innei's Afilmory")
    XCTAssertEqual(setup.slug, "innei")
  }

  func testACJKNameFallsBackToTheEmailForTheAddress() {
    XCTAssertEqual(model(name: "山与人", email: "shanyuren@example.com").slug, "shanyuren")
  }

  func testEditingTheGalleryNameLeavesTheAddressAlone() {
    let setup = model()
    setup.name = "Mountains and People"
    XCTAssertEqual(setup.slug, "innei")
  }

  func testEditingTheAddressNormalisesAndMarksItEdited() {
    let setup = model()
    setup.editSlug("My Gallery!!")
    XCTAssertEqual(setup.slug, "my-gallery")
    XCTAssertTrue(setup.slugEdited)
  }

  func testAShortAddressIsInvalidAndBlocksSubmit() {
    let setup = model()
    setup.editSlug("ab")
    XCTAssertEqual(setup.availability, .invalid)
    XCTAssertFalse(setup.canSubmit)
  }

  func testATakenAddressSuggestsTheFirstFreeCandidate() async {
    let setup = model(taken: ["innei", "innei-2"])
    await setup.checkAvailability()
    XCTAssertEqual(setup.availability, .unavailable(suggestion: "innei-3"))
    XCTAssertFalse(setup.canSubmit)
    setup.useSuggestion()
    XCTAssertEqual(setup.slug, "innei-3")
  }

  func testAFreeAddressIsAvailable() async {
    let setup = model()
    await setup.checkAvailability()
    XCTAssertEqual(setup.availability, .available)
    XCTAssertTrue(setup.canSubmit)
  }

  func testSubmitTakesTheFirstFreeCandidateAndMarksOnboardingPending() async throws {
    var createdWith: (String, String)?
    let setup = model(taken: ["innei"]) { createdWith = ($0, $1) }
    try await setup.submit()
    XCTAssertEqual(createdWith?.0, "Innei's Afilmory")
    XCTAssertEqual(createdWith?.1, "innei-2")
    XCTAssertTrue(flags.onboardingPending)
  }
}
