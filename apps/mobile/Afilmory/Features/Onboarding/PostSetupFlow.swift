import Photos
import UserNotifications

@MainActor
protocol PostSetupPermissions: AnyObject {
  func isPhotosUndecided() async -> Bool
  func isNotificationsUndecided() async -> Bool
  func requestPhotos() async
  func requestNotifications() async
}

@MainActor
final class LivePostSetupPermissions: PostSetupPermissions {
  func isPhotosUndecided() async -> Bool {
    PHPhotoLibrary.authorizationStatus(for: .readWrite) == .notDetermined
  }

  func isNotificationsUndecided() async -> Bool {
    guard AfilmoryBuildConfiguration.supportsPushNotifications else { return false }
    return await UNUserNotificationCenter.current().notificationSettings().authorizationStatus == .notDetermined
  }

  func requestPhotos() async {
    _ = await PHPhotoLibrary.requestAuthorization(for: .readWrite)
  }

  func requestNotifications() async {
    _ = await GalleryNotificationPermissionCoordinator().requestAuthorization()
  }
}

@MainActor
final class PostSetupFlow {
  enum Step: Equatable {
    case permissions
    case firstRoll
    case done
  }

  private let permissions: PostSetupPermissions
  private let flags: OnboardingFlags
  private(set) var step: Step = .permissions
  var onStepChange: ((Step) -> Void)?

  init(permissions: PostSetupPermissions, flags: OnboardingFlags = .shared) {
    self.permissions = permissions
    self.flags = flags
  }

  func start() async {
    let photos = await permissions.isPhotosUndecided()
    let notifications = await permissions.isNotificationsUndecided()
    if !photos, !notifications { move(to: .firstRoll) }
  }

  func allow() async {
    if await permissions.isPhotosUndecided() { await permissions.requestPhotos() }
    if await permissions.isNotificationsUndecided() { await permissions.requestNotifications() }
    move(to: .firstRoll)
  }

  func later() {
    move(to: .firstRoll)
  }

  func finish() {
    flags.onboardingPending = false
    move(to: .done)
  }

  private func move(to next: Step) {
    guard step != next else { return }
    step = next
    onStepChange?(next)
  }
}
