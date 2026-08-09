import UIKit
import UserNotifications

final class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?
  private var coordinator: ApplicationCoordinator?

  func scene(
    _ scene: UIScene,
    willConnectTo _: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene else { return }
    let window = UIWindow(windowScene: windowScene)
    let coordinator = ApplicationCoordinator(window: window)
    self.window = window
    self.coordinator = coordinator
    coordinator.start()

    if AfilmoryBuildConfiguration.supportsPushNotifications {
      UNUserNotificationCenter.current().delegate = coordinator
      APNsRegistrationCoordinator.shared.start()
    }

    for context in connectionOptions.urlContexts {
      if open(context.url) { break }
    }
    for userActivity in connectionOptions.userActivities {
      if continueActivity(userActivity) { break }
    }
  }

  func scene(_: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    for context in URLContexts {
      if open(context.url) { break }
    }
  }

  func scene(_: UIScene, continue userActivity: NSUserActivity) {
    _ = continueActivity(userActivity)
  }

  func sceneDidBecomeActive(_: UIScene) {
    guard AfilmoryBuildConfiguration.supportsPushNotifications else { return }
    APNsRegistrationCoordinator.shared.registerForRemoteNotificationsIfAuthorized()
  }

  private func open(_ url: URL) -> Bool {
    ShareUploadHandoff.handle(url) || coordinator?.open(url: url) == true
  }

  private func continueActivity(_ userActivity: NSUserActivity) -> Bool {
    guard let url = userActivity.webpageURL else { return false }
    return coordinator?.open(url: url) ?? false
  }
}
