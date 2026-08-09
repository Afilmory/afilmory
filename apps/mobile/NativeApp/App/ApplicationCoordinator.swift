import AuthenticationServices
import SwiftUI
import UIKit
import UserNotifications

@MainActor
final class ApplicationCoordinator: NSObject, UNUserNotificationCenterDelegate {
  private let window: UIWindow
  private var sessionObservation: AfilmorySessionObservationToken?
  private var pendingDeepLink: AfilmoryDeepLink?

  init(window: UIWindow) {
    self.window = window
    super.init()
  }

  func start() {
    window.backgroundColor = .black
    window.rootViewController = LoadingViewController()
    window.makeKeyAndVisible()
    sessionObservation = AfilmorySessionStore.shared.observe { [weak self] state in
      Task { @MainActor in
        self?.render(state)
      }
    }
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(appleCredentialWasRevoked),
      name: ASAuthorizationAppleIDProvider.credentialRevokedNotification,
      object: nil
    )
    AfilmorySessionStore.shared.bootstrap()
  }

  func open(url: URL) -> Bool {
    guard let route = AfilmoryDeepLink.parse(url) else { return false }
    pendingDeepLink = route
    applyPendingDeepLinkIfPossible()
    return true
  }

  nonisolated func userNotificationCenter(
    _: UNUserNotificationCenter,
    willPresent _: UNNotification,
    withCompletionHandler completionHandler: @escaping @Sendable (UNNotificationPresentationOptions) -> Void
  ) {
    DispatchQueue.main.async {
      completionHandler([.banner, .list, .sound])
    }
  }

  nonisolated func userNotificationCenter(
    _: UNUserNotificationCenter,
    didReceive response: UNNotificationResponse,
    withCompletionHandler completionHandler: @escaping @Sendable () -> Void
  ) {
    let url = galleryNotificationDeepLink(
      userInfo: response.notification.request.content.userInfo
    )
    DispatchQueue.main.async { [weak self] in
      if let url {
        _ = self?.open(url: url)
      }
      completionHandler()
    }
  }

  private func render(_ state: AfilmorySessionState) {
    let next: UIViewController
    switch state {
    case .loading:
      next = LoadingViewController()
    case .signedIn:
      next = makeAuthenticatedTabs()
    case .signedOut, .failed:
      next = makeVisitorController()
    }
    replaceRoot(with: next)
    applyPendingDeepLinkIfPossible()
  }

  private func makeVisitorController() -> UIViewController {
    let galleries = GalleriesController { [weak self] in
      self?.presentSignIn()
    }
    return UINavigationController(rootViewController: galleries)
  }

  private func makeAuthenticatedTabs() -> UIViewController {
    let tabs = AfilmoryTabBarController()

    let photos = PhotosHomeController(
      onRequestSignIn: { [weak self] in self?.presentSignIn() },
      onRequestSignOut: { AfilmorySessionStore.shared.clearSession() },
      onRequestWorkspaceSetup: { [weak self] in self?.presentWorkspaceSetup() },
      onRequestAccountSettings: { [weak self] in self?.presentAccountSettings(startsDeletion: false) },
      onRequestAccountDeletion: { [weak self] in self?.presentAccountSettings(startsDeletion: true) }
    )
    photos.tabBarItem = UITabBarItem(
      title: String(localized: "Photos"),
      image: UIImage(systemName: "photo.on.rectangle"),
      selectedImage: UIImage(systemName: "photo.fill.on.rectangle.fill")
    )

    let map = PhotoMapController { [weak self] in
      self?.presentSignIn()
    }
    map.tabBarItem = UITabBarItem(
      title: String(localized: "Map"),
      image: UIImage(systemName: "map"),
      selectedImage: UIImage(systemName: "map.fill")
    )

    let galleries = GalleriesController { [weak self] in
      self?.presentSignIn()
    }
    let explore = UINavigationController(rootViewController: galleries)
    explore.tabBarItem = UITabBarItem(
      title: String(localized: "Explore"),
      image: UIImage(systemName: "safari"),
      selectedImage: UIImage(systemName: "safari.fill")
    )

    let studio = makeStudioNavigationController()
    studio.tabBarItem = UITabBarItem(
      title: String(localized: "Studio"),
      image: UIImage(systemName: "rectangle.3.group"),
      selectedImage: UIImage(systemName: "rectangle.3.group.fill")
    )

    tabs.viewControllers = [photos, map, explore, studio]
    #if DEBUG
      tabs.onRequestDeveloperLab = { [weak self, weak studio] in
        guard let self, let studio else { return }
        self.presentDeveloperLab(on: studio)
      }
    #endif
    return tabs
  }

  private func makeStudioNavigationController() -> UINavigationController {
    let navigationController = UINavigationController()
    let home = StudioHomeController(
      onRequestSignIn: { [weak self] in self?.presentSignIn() },
      onRequestSignOut: { AfilmorySessionStore.shared.clearSession() },
      onNavigate: { [weak self, weak navigationController] route in
        guard let self, let navigationController else { return }
        navigationController.pushViewController(self.makeStudioRoute(route), animated: true)
      },
      onWorkspaceChanged: { _ in
        AfilmorySessionStore.shared.refreshSession()
      }
    )
    navigationController.setViewControllers([home], animated: false)
    return navigationController
  }

  private func makeStudioRoute(_ route: StudioHomeRoute) -> UIViewController {
    if route == .library {
      return StudioLibraryController { [weak self] in
        self?.presentSignIn()
      }
    }
    let controller: UIViewController = switch route {
    case .analytics:
      UIHostingController(rootView: StudioAnalyticsView())
    case .comments:
      UIHostingController(rootView: StudioCommentsView())
    case .operations:
      UIHostingController(rootView: StudioOperationsView())
    case .site:
      UIHostingController(rootView: StudioSiteView())
    case .library:
      preconditionFailure("The library route is handled above.")
    }
    controller.title = route.title
    return controller
  }

  private func presentSignIn() {
    guard let presenter = topViewController() else { return }
    let presentsAsForm = presenter.traitCollection.userInterfaceIdiom == .pad
    let controller = UIHostingController(
      rootView: SignInView(showsCloseButton: presentsAsForm)
    )

    if presentsAsForm {
      let availableSize = presenter.view.bounds.inset(by: presenter.view.safeAreaInsets).size
      controller.modalPresentationStyle = .formSheet
      controller.preferredContentSize = CGSize(
        width: min(430, max(360, availableSize.width - 80)),
        height: min(780, max(640, availableSize.height - 120))
      )
    } else {
      controller.modalPresentationStyle = .pageSheet
    }
    controller.sheetPresentationController?.prefersGrabberVisible = false

    presenter.present(controller, animated: true)
  }

  private func presentWorkspaceSetup() {
    presentSheet(WorkspaceSetupView())
  }

  private func presentAccountSettings(startsDeletion: Bool) {
    presentSheet(
      AccountSettingsView(
        session: AfilmorySessionStore.shared.current().state.session,
        startsDeletion: startsDeletion
      )
    )
  }

  private func applyPendingDeepLinkIfPossible() {
    guard let route = pendingDeepLink,
          !(window.rootViewController is LoadingViewController)
    else {
      return
    }
    pendingDeepLink = nil

    switch route {
    case .root:
      if let tabs = window.rootViewController as? AfilmoryTabBarController {
        tabs.selectTab(at: 0)
      } else {
        (window.rootViewController as? UINavigationController)?.popToRootViewController(animated: false)
      }
    case .photos:
      (window.rootViewController as? AfilmoryTabBarController)?.selectTab(at: 0)
    case .map:
      (window.rootViewController as? AfilmoryTabBarController)?.selectTab(at: 1)
    case .explore(let galleryRoute):
      guard let navigation = exploreNavigationController() else { return }
      navigation.popToRootViewController(animated: false)
      if let galleryRoute,
         let galleries = navigation.viewControllers.first as? GalleriesController
      {
        galleries.openGallery(galleryRoute)
      }
    case .studio(let studioRoute):
      guard let tabs = window.rootViewController as? AfilmoryTabBarController,
            let navigation = tabs.viewControllers?[safe: 3] as? UINavigationController
      else { return }
      tabs.selectTab(at: 3)
      navigation.popToRootViewController(animated: false)
      if let studioRoute {
        navigation.pushViewController(makeStudioRoute(studioRoute), animated: true)
      }
    case .developerLab:
      #if DEBUG
        guard let tabs = window.rootViewController as? AfilmoryTabBarController,
              let navigation = tabs.viewControllers?[safe: 3] as? UINavigationController
        else { return }
        tabs.selectTab(at: 3)
        presentDeveloperLab(on: navigation)
      #endif
    }
  }

  private func exploreNavigationController() -> UINavigationController? {
    if let navigation = window.rootViewController as? UINavigationController {
      return navigation
    }
    guard let tabs = window.rootViewController as? AfilmoryTabBarController,
          let navigation = tabs.viewControllers?[safe: 2] as? UINavigationController
    else { return nil }
    tabs.selectTab(at: 2)
    return navigation
  }

  #if DEBUG
    private func presentDeveloperLab(on navigation: UINavigationController) {
      guard !(navigation.visibleViewController is UIHostingController<DeveloperLabView>) else { return }
      let controller = UIHostingController(rootView: DeveloperLabView())
      controller.hidesBottomBarWhenPushed = true
      navigation.pushViewController(controller, animated: true)
    }
  #endif

  @objc private func appleCredentialWasRevoked() {
    AfilmorySessionStore.shared.clearSession()
  }

  private func presentSheet<Content: View>(_ content: Content) {
    let controller = UIHostingController(rootView: content)
    controller.modalPresentationStyle = .pageSheet
    controller.sheetPresentationController?.prefersGrabberVisible = true
    topViewController()?.present(controller, animated: true)
  }

  private func topViewController() -> UIViewController? {
    var current = window.rootViewController
    while let presented = current?.presentedViewController {
      current = presented
    }
    if let tabs = current as? UITabBarController {
      current = tabs.selectedViewController
    }
    if let navigation = current as? UINavigationController {
      current = navigation.visibleViewController
    }
    return current
  }

  private func replaceRoot(with controller: UIViewController) {
    if let current = window.rootViewController,
       type(of: current) == type(of: controller)
    {
      return
    }
    window.rootViewController = controller
  }
}

private extension Collection {
  subscript(safe index: Index) -> Element? {
    indices.contains(index) ? self[index] : nil
  }
}

private extension StudioHomeRoute {
  var title: String {
    switch self {
    case .analytics: String(localized: "Analytics")
    case .comments: String(localized: "Comments")
    case .library: String(localized: "Photo Library")
    case .operations: String(localized: "Operations")
    case .site: String(localized: "Site Settings")
    }
  }
}
