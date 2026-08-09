import UIKit
import UserNotifications

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
  func application(
    _: UIApplication,
    didFinishLaunchingWithOptions _: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    CacheLifecycleCoordinator.shared.runOnce()
    return true
  }

  func application(
    _ application: UIApplication,
    didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
  ) {
    APNsRegistrationCoordinator.shared.didRegisterForRemoteNotifications(deviceToken: deviceToken)
  }

  func application(
    _ application: UIApplication,
    didFailToRegisterForRemoteNotificationsWithError error: Error
  ) {
    APNsRegistrationCoordinator.shared.didFailToRegisterForRemoteNotifications(error)
  }

  func application(
    _: UIApplication,
    handleEventsForBackgroundURLSession identifier: String,
    completionHandler: @escaping () -> Void
  ) {
    guard identifier == UploadCenter.sessionIdentifier else {
      completionHandler()
      return
    }
    UploadCenter.backgroundCompletionHandler = completionHandler
    _ = UploadCenter.shared
  }

}
