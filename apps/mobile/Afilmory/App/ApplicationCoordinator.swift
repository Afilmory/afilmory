import AuthenticationServices
import SwiftUI
import UIKit
import UserNotifications

@MainActor
final class ApplicationCoordinator: NSObject, UNUserNotificationCenterDelegate, AppNavigating {
  private let window: UIWindow
  private var sessionObservation: AfilmorySessionObservationToken?
  private var pendingDeepLink: AfilmoryDeepLink?
  #if DEBUG
    private var pendingCatalogEntryID = FixtureMode.catalogEntryID
  #endif

  init(window: UIWindow) {
    self.window = window
    super.init()
  }

  func start() {
    AppNavigator.shared.host = self
    window.backgroundColor = AFColor.ground
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
    let state = AfilmorySessionStore.shared.current().state
    switch DeepLinkGate.decide(root: window.rootViewController, presented: window.rootViewController?.presentedViewController) {
    case .apply: applyPendingDeepLinkIfPossible(for: state)
    case .reroute: render(state)
    case .hold: break
    }
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
    let flags = OnboardingFlags.shared
    flags.note(state.rootPresentation)
    let next: UIViewController
    let route = LaunchRoute.resolve(state.rootPresentation, flags: flags, hasPendingDeepLink: pendingDeepLink != nil)
    switch route {
    case .loading:
      next = LoadingViewController()
    case .tabs:
      next = makeAuthenticatedTabs()
    case .setup:
      next = WorkspaceSetupViewController(
        mode: state.session?.workspaceSetupMode ?? .create
      )
    case .intro:
      next = IntroController(mode: .firstLaunch) { [weak self] in
        self?.render(AfilmorySessionStore.shared.current().state)
      }
    case .visitor:
      next = makeVisitorController()
    }
    replaceRoot(with: next)
    if route == .tabs(postSetup: true) {
      presentPostSetupIfNeeded()
    } else {
      applyPendingDeepLinkIfPossible(for: state)
    }
    #if DEBUG
      if FixtureMode.isOn {
        applyCatalogEntryIfNeeded(for: state)
        return
      }
    #endif
    presentTestFlightAppStorePromptIfNeeded(for: state)
  }

  #if DEBUG
    private func applyCatalogEntryIfNeeded(for state: AfilmorySessionState) {
      guard let id = pendingCatalogEntryID, state.rootPresentation != .loading else { return }
      pendingCatalogEntryID = nil
      guard let entry = UICatalog.entry(id) else {
        NSLog("[UICatalog] Unknown entry %@", id)
        return
      }
      DispatchQueue.main.async { [weak self] in
        guard let root = self?.window.rootViewController else { return }
        UICatalog.open(entry, over: root)
      }
    }
  #endif

  private func makeVisitorController() -> UIViewController {
    let viewing = ViewingController(isVisitor: true) { [weak self] in
      self?.presentSignIn()
    }
    return Self.chromelessNavigation(root: viewing)
  }

  private func makeAuthenticatedTabs() -> UIViewController {
    let requestSignIn: () -> Void = { [weak self] in self?.presentSignIn() }
    let exhibition = Self.chromelessNavigation(
      root: ExhibitionController(source: .own, onRequestSignIn: requestSignIn)
    )
    let viewing = Self.chromelessNavigation(
      root: ViewingController(isVisitor: false, onRequestSignIn: requestSignIn)
    )
    let darkroom = Self.chromelessNavigation(
      root: DarkroomController(onRequestSignIn: requestSignIn)
    )
    let tabs = AfilmoryTabBarController(controllers: [exhibition, viewing, darkroom])
    #if DEBUG
      tabs.onRequestDeveloperLab = { [weak self, weak darkroom] in
        guard let self, let darkroom else { return }
        self.presentDeveloperLab(on: darkroom)
      }
    #endif
    return tabs
  }

  private static func chromelessNavigation(root: UIViewController) -> UINavigationController {
    AFNavigationController(rootViewController: root)
  }

  func presentSignIn() {
    guard let presenter = topViewController(), !(presenter is SignInPageController) else { return }
    presenter.present(SignInPageController(), animated: true)
  }

  private func presentPostSetupIfNeeded() {
    DispatchQueue.main.async { [weak self] in
      guard let self else { return }
      guard let tabs, tabs.presentedViewController == nil, OnboardingFlags.shared.onboardingPending else {
        applyPendingDeepLinkIfPossible(for: AfilmorySessionStore.shared.current().state)
        return
      }
      let postSetup = PostSetupController { [weak self, weak tabs] _ in
        tabs?.select(.exhibition, animated: false)
        tabs?.dismiss(animated: true) {
          guard let self else { return }
          self.applyPendingDeepLinkIfPossible(for: AfilmorySessionStore.shared.current().state)
        }
      }
      tabs.present(postSetup, animated: true)
    }
  }

  func presentIntro() {
    guard let presenter = topViewController() else { return }
    let intro = IntroController(mode: .replay) { [weak presenter] in
      presenter?.dismiss(animated: true)
    }
    presenter.present(intro, animated: true)
  }

  func presentAccountSettings(startsDeletion: Bool) {
    switch AccountRoute(startsDeletion: startsDeletion) {
    case .deletion:
      let session = AfilmorySessionStore.shared.current().state.session
      topViewController()?.present(AccountDeletionController(session: session), animated: true)
    case .sheet:
      openDarkroom(route: nil)
      (navigation(for: .darkroom)?.viewControllers.first as? DarkroomController)?.presentAccountSheet()
    }
  }


  private func applyPendingDeepLinkIfPossible(for state: AfilmorySessionState) {
    guard state.shouldApplyPendingDeepLink, let route = pendingDeepLink else {
      return
    }
    pendingDeepLink = nil

    guard let tabs else {
      let navigation = window.rootViewController as? UINavigationController
      switch route {
      case .explore(let galleryRoute):
        navigation?.popToRootViewController(animated: false)
        if let galleryRoute {
          (navigation?.viewControllers.first as? ViewingController)?.openGallery(galleryRoute)
        }
      case .developerLab:
        #if DEBUG
          if let navigation { presentDeveloperLab(on: navigation) }
        #endif
      default:
        navigation?.popToRootViewController(animated: false)
      }
      return
    }

    let tab = DeepLinkTabRouting.tab(for: route)
    switch route {
    case .root, .photos:
      switchToTab(tab, animated: false)
      navigation(for: .exhibition)?.popToRootViewController(animated: false)
    case .map:
      openOwnExhibition(level: .infinity, focusingPhotoID: nil)
    case .explore(let galleryRoute):
      switchToTab(tab, animated: false)
      navigation(for: .viewing)?.popToRootViewController(animated: false)
      if let galleryRoute {
        openGallery(galleryRoute, level: .day)
      }
    case .studio(let studioRoute):
      openDarkroom(route: studioRoute)
    case .developerLab:
      #if DEBUG
        switchToTab(tab, animated: false)
        if let navigation = navigation(for: .darkroom) {
          presentDeveloperLab(on: navigation)
        }
      #endif
    }
  }

  private func navigation(for tab: AppTab) -> UINavigationController? {
    tabs?.viewControllers?[safe: tab.rawValue] as? UINavigationController
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

  private func presentTestFlightAppStorePromptIfNeeded(for state: AfilmorySessionState) {
    guard state.shouldPresentTestFlightPrompt, let root = window.rootViewController else { return }
    TestFlightAppStorePrompt.shared.present(from: root)
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
    if let current = window.rootViewController as? WorkspaceSetupViewController,
       let next = controller as? WorkspaceSetupViewController
    {
      if current.rootView.mode != next.rootView.mode {
        window.rootViewController = next
      }
      return
    }
    if let current = window.rootViewController,
       type(of: current) == type(of: controller)
    {
      return
    }
    guard window.rootViewController is IntroController else {
      window.rootViewController = controller
      return
    }
    UIView.transition(with: window, duration: AFMotion.reduceMotion ? 0.2 : 0.35, options: .transitionCrossDissolve) {
      self.window.rootViewController = controller
    }
  }
}

extension ApplicationCoordinator {
  var tabs: AfilmoryTabBarController? {
    window.rootViewController as? AfilmoryTabBarController
  }

  func switchToTab(_ tab: AppTab, animated: Bool) {
    tabs?.select(tab, animated: animated)
  }

  func openGallery(_ route: GalleryRouteRequest, level: ContactSheetLevel) {
    if let tabs {
      tabs.select(.viewing, animated: false)
      guard let navigation = navigation(for: .viewing),
            let viewing = navigation.viewControllers.first as? ViewingController
      else { return }
      navigation.popToRootViewController(animated: false)
      viewing.openGallery(route, level: level)
      return
    }
    guard let navigation = window.rootViewController as? UINavigationController,
          let viewing = navigation.viewControllers.first as? ViewingController
    else { return }
    viewing.openGallery(route, level: level)
  }

  func openOwnExhibition(level: ContactSheetLevel, focusingPhotoID: String?) {
    guard let tabs else { return }
    tabs.select(.exhibition, animated: false)
    guard let navigation = navigation(for: .exhibition) else { return }
    navigation.popToRootViewController(animated: false)
    (navigation.viewControllers.first as? ExhibitionController)?.show(level: level, focusingPhotoID: focusingPhotoID)
  }

  func openDarkroom(route: StudioHomeRoute?) {
    guard let tabs else { return }
    tabs.select(.darkroom, animated: false)
    guard let navigation = navigation(for: .darkroom) else { return }
    navigation.popToRootViewController(animated: false)
    (navigation.viewControllers.first as? DarkroomController)?.open(route: route)
  }

  func presentSubscription(focus: QuotaWallReason?) {
    guard let presenter = topViewController(), !(presenter is SubscriptionPageController) else { return }
    presenter.present(SubscriptionPageController(focus: focus), animated: true)
  }

  func signOut() {
    AfilmorySessionStore.shared.clearSession()
  }
}

private extension Collection {
  subscript(safe index: Index) -> Element? {
    indices.contains(index) ? self[index] : nil
  }
}

extension StudioHomeRoute {
  var title: String {
    switch self {
    case .analytics: String(localized: "Analytics")
    case .comments: String(localized: "Comments")
    case .library: String(localized: "Photo Library")
    case .operations: String(localized: "Operations")
    case .site: String(localized: "Site Settings")
    case .domain: String(localized: "Custom domain")
    }
  }
}
