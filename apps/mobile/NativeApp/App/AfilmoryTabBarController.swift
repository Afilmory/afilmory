import UIKit

final class AfilmoryTabBarController: UITabBarController, UITabBarControllerDelegate {
  var onRequestDeveloperLab: (() -> Void)?

  private var appliedContentControllerIDs = Set<ObjectIdentifier>()
  private var appliedContentHorizontalSizeClass: UIUserInterfaceSizeClass = .unspecified
  private var contentHorizontalSizeClass: UIUserInterfaceSizeClass = .unspecified
  private var developerLabTapCount = 0
  private var lastDeveloperLabTap: TimeInterval?

  override func viewDidLoad() {
    super.viewDidLoad()
    delegate = self
    mode = .tabBar
    configureIPadBottomTabBar()
    applyMinimizeBehavior()
  }

  override func viewWillLayoutSubviews() {
    super.viewWillLayoutSubviews()
    preserveContentSizeClass()
  }

  func tabBarController(_: UITabBarController, didSelect _: UIViewController) {
    applyMinimizeBehavior()
  }

  func selectTab(at index: Int) {
    guard viewControllers?.indices.contains(index) == true else { return }
    selectedIndex = index
    applyMinimizeBehavior()
  }

  func tabBarController(
    _: UITabBarController,
    shouldSelect viewController: UIViewController
  ) -> Bool {
    #if DEBUG
      guard viewControllers?.firstIndex(of: viewController) == 3 else {
        developerLabTapCount = 0
        lastDeveloperLabTap = nil
        return true
      }
      let now = ProcessInfo.processInfo.systemUptime
      if let lastDeveloperLabTap, now - lastDeveloperLabTap <= 1 {
        developerLabTapCount += 1
      } else {
        developerLabTapCount = 1
      }
      self.lastDeveloperLabTap = now
      if developerLabTapCount >= 5 {
        developerLabTapCount = 0
        self.lastDeveloperLabTap = nil
        DispatchQueue.main.async { [weak self] in self?.onRequestDeveloperLab?() }
      }
    #endif
    return true
  }

  private func applyMinimizeBehavior() {
    if #available(iOS 26.0, *) {
      let isStudio = selectedIndex == 3
      tabBarMinimizeBehavior = isStudio ? .never : .onScrollDown
    }
  }

  private func configureIPadBottomTabBar() {
    guard traitCollection.userInterfaceIdiom == .pad else { return }
    contentHorizontalSizeClass = traitCollection.horizontalSizeClass
    traitOverrides.horizontalSizeClass = .compact
    preserveContentSizeClass()
  }

  private func preserveContentSizeClass() {
    guard traitCollection.userInterfaceIdiom == .pad else { return }
    let systemSizeClass = view.window?.windowScene?.traitCollection.horizontalSizeClass
      ?? contentHorizontalSizeClass
    guard systemSizeClass != .unspecified else { return }
    let controllers = viewControllers ?? []
    let controllerIDs = Set(controllers.map(ObjectIdentifier.init))
    guard systemSizeClass != appliedContentHorizontalSizeClass
      || controllerIDs != appliedContentControllerIDs
    else { return }
    contentHorizontalSizeClass = systemSizeClass
    for controller in controllers {
      controller.traitOverrides.horizontalSizeClass = systemSizeClass
    }
    appliedContentHorizontalSizeClass = systemSizeClass
    appliedContentControllerIDs = controllerIDs
  }
}
