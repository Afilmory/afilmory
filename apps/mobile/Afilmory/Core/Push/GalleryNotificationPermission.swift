import UIKit
import UserNotifications

enum GalleryNotificationPermissionState: Equatable {
  case unknown
  case notDetermined
  case enabled
  case disabled
}

enum GalleryNotificationBannerState: Equatable {
  case hidden
  case enableNotifications
  case openSettings
}

func resolveGalleryNotificationBannerState(
  hasSubscriptions: Bool,
  permission: GalleryNotificationPermissionState
) -> GalleryNotificationBannerState {
  guard hasSubscriptions else { return .hidden }

  switch permission {
  case .unknown, .enabled:
    return .hidden
  case .notDetermined:
    return .enableNotifications
  case .disabled:
    return .openSettings
  }
}

func shouldRequestNotificationsAfterFollow(didFollow: Bool, permission: GalleryNotificationPermissionState) -> Bool {
  didFollow && permission == .notDetermined
}

@MainActor
final class GalleryNotificationPermissionCoordinator {
  private let notificationCenter: UNUserNotificationCenter

  init(notificationCenter: UNUserNotificationCenter = .current()) {
    self.notificationCenter = notificationCenter
  }

  func currentState() async -> GalleryNotificationPermissionState {
    let settings = await notificationCenter.notificationSettings()
    return Self.map(settings.authorizationStatus)
  }

  func requestAuthorization() async -> GalleryNotificationPermissionState {
    do {
      _ = try await notificationCenter.requestAuthorization(options: [.alert, .badge, .sound])
    } catch {
      return await currentState()
    }
    let state = await currentState()
    if state == .enabled {
      APNsRegistrationCoordinator.shared.registerForRemoteNotificationsIfAuthorized()
    }
    return state
  }

  func requestAfterFollowIfUndecided() async {
    guard shouldRequestNotificationsAfterFollow(didFollow: true, permission: await currentState()) else { return }
    _ = await requestAuthorization()
  }

  func openSettings() {
    guard let url = URL(string: UIApplication.openNotificationSettingsURLString) else { return }
    UIApplication.shared.open(url)
  }

  private static func map(_ status: UNAuthorizationStatus) -> GalleryNotificationPermissionState {
    switch status {
    case .notDetermined:
      return .notDetermined
    case .denied:
      return .disabled
    case .authorized, .provisional, .ephemeral:
      return .enabled
    @unknown default:
      return .disabled
    }
  }
}
