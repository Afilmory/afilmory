import ExpoModulesCore
import UIKit

struct GalleryRouteRequest: Decodable, Equatable {
  let requestId: String
  let slug: String
  let title: String
}

final class PageControllerHostView: ExpoView {
  let onAuthChange = EventDispatcher()
  let onNavigate = EventDispatcher()
  let onRequestSignIn = EventDispatcher()

  private var page = ""
  private var galleryRoute: GalleryRouteRequest?
  private var controller: UIViewController?
  private weak var parentController: UIViewController?

  deinit {
    detachController()
  }

  func setPage(_ page: String) {
    guard page != self.page else { return }
    detachController()
    self.page = page
    installControllerIfPossible()
  }

  func setGalleryRoute(_ value: String?) {
    let route = value
      .flatMap { $0.data(using: .utf8) }
      .flatMap { try? JSONDecoder().decode(GalleryRouteRequest.self, from: $0) }
    guard route != galleryRoute else { return }
    galleryRoute = route
    applyGalleryRouteIfPossible()
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    controller?.view.frame = bounds
    updateTabletLayout()
  }

  override func safeAreaInsetsDidChange() {
    super.safeAreaInsetsDidChange()
    updateTabletLayout()
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    guard window != nil else { return }
    installControllerIfPossible()
  }

  private func installControllerIfPossible() {
    guard controller == nil,
          window != nil,
          let parent = enclosingViewController(),
          let child = makeController()
    else { return }
    parent.addChild(child)
    child.view.frame = bounds
    child.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    addSubview(child.view)
    child.didMove(toParent: parent)
    controller = child
    parentController = parent
    applyGalleryRouteIfPossible()
    updateTabletLayout()
  }

  private func detachController() {
    guard let controller else { return }
    controller.willMove(toParent: nil)
    controller.view.removeFromSuperview()
    controller.removeFromParent()
    self.controller = nil
    parentController = nil
  }

  private func makeController() -> UIViewController? {
    let requestSignIn: () -> Void = { [weak self] in
      guard let self else { return }
      onRequestSignIn([:])
    }
    let navigate: (StudioHomeRoute) -> Void = { [weak self] route in
      guard let self else { return }
      onNavigate(["path": route.rawValue])
    }
    let requestSignOut: () -> Void = { [weak self] in
      guard let self else { return }
      onAuthChange(["type": "signOut"])
    }
    let requestWorkspaceSetup: () -> Void = { [weak self] in
      guard let self else { return }
      onAuthChange(["type": "workspaceSetup"])
    }
    let requestAccountSettings: () -> Void = { [weak self] in
      guard let self else { return }
      onAuthChange(["type": "accountSettings"])
    }
    let requestAccountDeletion: () -> Void = { [weak self] in
      guard let self else { return }
      onAuthChange(["type": "deleteAccountRequested"])
    }
    let workspaceChanged: (String) -> Void = { [weak self] slug in
      guard let self else { return }
      onAuthChange(["type": "workspaceChanged", "workspaceSlug": slug])
    }
    switch page {
    case "photos":
      return PhotosHomeController(
        appContext: appContext,
        onRequestSignIn: requestSignIn,
        onRequestSignOut: requestSignOut,
        onRequestWorkspaceSetup: requestWorkspaceSetup,
        onRequestAccountSettings: requestAccountSettings,
        onRequestAccountDeletion: requestAccountDeletion
      )
    case "explore":
      let root = GalleriesController(appContext: appContext, onRequestSignIn: requestSignIn)
      let navigationController = UINavigationController(rootViewController: root)
      if let galleryRoute {
        root.openGallery(galleryRoute)
      }
      return navigationController
    case "map":
      return PhotoMapController(appContext: appContext, onRequestSignIn: requestSignIn)
    case "studio-library":
      let root = StudioLibraryController(appContext: appContext, onRequestSignIn: requestSignIn)
      return UINavigationController(rootViewController: root)
    case "studio-home":
      return StudioHomeController(
        onRequestSignIn: requestSignIn,
        onRequestSignOut: requestSignOut,
        onNavigate: navigate,
        onWorkspaceChanged: workspaceChanged
      )
    default:
      return nil
    }
  }

  private func applyGalleryRouteIfPossible() {
    guard page == "explore",
          let galleryRoute,
          let navigationController = controller as? UINavigationController,
          let galleriesController = navigationController.viewControllers.first as? GalleriesController
    else { return }
    galleriesController.openGallery(galleryRoute)
  }

  private func enclosingViewController() -> UIViewController? {
    var responder: UIResponder? = next
    while let current = responder {
      if let viewController = current as? UIViewController {
        return viewController
      }
      responder = current.next
    }
    return nil
  }

  private func updateTabletLayout() {
    guard UIDevice.current.userInterfaceIdiom == .pad,
          let controller,
          let tabBarController = parentController?.tabBarController
    else {
      if controller?.additionalSafeAreaInsets.right != 0 {
        controller?.additionalSafeAreaInsets.right = 0
      }
      return
    }
    tabBarController.sidebar.preferredLayout = .tile
    tabBarController.view.layoutIfNeeded()
    let containerWidth = tabBarController.view.bounds.width
    let contentWidth = min(
      containerWidth,
      tabBarController.selectedViewController?.viewIfLoaded?.bounds.width ?? containerWidth
    )
    let trailingInset = max(0, containerWidth - contentWidth)
    guard abs(controller.additionalSafeAreaInsets.right - trailingInset) >= 0.5 else { return }
    controller.additionalSafeAreaInsets.right = trailingInset
  }
}
