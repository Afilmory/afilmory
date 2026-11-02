@testable import Afilmory
import XCTest

@MainActor
private final class FakePermissions: PostSetupPermissions {
  var photosUndecided: Bool
  var notificationsUndecided: Bool
  var requests: [String] = []

  init(photos: Bool, notifications: Bool) {
    photosUndecided = photos
    notificationsUndecided = notifications
  }

  func isPhotosUndecided() async -> Bool { photosUndecided }
  func isNotificationsUndecided() async -> Bool { notificationsUndecided }
  func requestPhotos() async { requests.append("photos") }
  func requestNotifications() async { requests.append("notifications") }
}

@MainActor
final class PostSetupFlowTests: XCTestCase {
  private var flags: OnboardingFlags!

  override func setUp() {
    super.setUp()
    let defaults = UserDefaults(suiteName: "PostSetupFlowTests")!
    defaults.removePersistentDomain(forName: "PostSetupFlowTests")
    flags = OnboardingFlags(defaults: defaults)
    flags.onboardingPending = true
  }

  func testStartsOnPermissionsWhileEitherIsUndecided() async {
    let flow = PostSetupFlow(permissions: FakePermissions(photos: false, notifications: true), flags: flags)
    await flow.start()
    XCTAssertEqual(flow.step, .permissions)
  }

  func testSkipsPermissionsWhenBothAreDecided() async {
    let flow = PostSetupFlow(permissions: FakePermissions(photos: false, notifications: false), flags: flags)
    await flow.start()
    XCTAssertEqual(flow.step, .firstRoll)
  }

  func testAllowAsksForPhotosBeforeNotificationsThenAdvances() async {
    let permissions = FakePermissions(photos: true, notifications: true)
    let flow = PostSetupFlow(permissions: permissions, flags: flags)
    await flow.start()
    await flow.allow()
    XCTAssertEqual(permissions.requests, ["photos", "notifications"])
    XCTAssertEqual(flow.step, .firstRoll)
  }

  func testAllowOnlyAsksForWhatIsStillUndecided() async {
    let permissions = FakePermissions(photos: false, notifications: true)
    let flow = PostSetupFlow(permissions: permissions, flags: flags)
    await flow.allow()
    XCTAssertEqual(permissions.requests, ["notifications"])
  }

  func testLaterAdvancesWithoutAsking() async {
    let permissions = FakePermissions(photos: true, notifications: true)
    let flow = PostSetupFlow(permissions: permissions, flags: flags)
    await flow.start()
    flow.later()
    XCTAssertTrue(permissions.requests.isEmpty)
    XCTAssertEqual(flow.step, .firstRoll)
  }

  func testFinishingClearsThePendingFlag() async {
    let flow = PostSetupFlow(permissions: FakePermissions(photos: true, notifications: true), flags: flags)
    flow.finish()
    XCTAssertFalse(flags.onboardingPending)
    XCTAssertEqual(flow.step, .done)
  }
}
