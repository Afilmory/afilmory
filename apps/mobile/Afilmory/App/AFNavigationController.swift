import UIKit

final class AFNavigationController: UINavigationController {
  override init(rootViewController: UIViewController) {
    super.init(rootViewController: rootViewController)
    setNavigationBarHidden(true, animated: false)
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = AFColor.ground
    let appearance = UINavigationBarAppearance()
    appearance.configureWithTransparentBackground()
    appearance.titleTextAttributes = [.foregroundColor: UIColor.clear]
    navigationBar.standardAppearance = appearance
    navigationBar.compactAppearance = appearance
    navigationBar.scrollEdgeAppearance = appearance
    navigationBar.compactScrollEdgeAppearance = appearance
    registerForTraitChanges([DuoContextTrait.self]) { (navigation: AFNavigationController, _: UITraitCollection) in
      navigation.applyDuoContext()
    }
    applyDuoContext()
  }

  private lazy var duoContextProvider = DuoContextProvider(controller: self)

  override func viewDidLayoutSubviews() {
    super.viewDidLayoutSubviews()
    if view.window?.rootViewController === self {
      duoContextProvider.refresh()
    }
  }

  override func pushViewController(_ viewController: UIViewController, animated: Bool) {
    untitle(viewController)
    super.pushViewController(viewController, animated: animated)
  }

  override func setViewControllers(_ viewControllers: [UIViewController], animated: Bool) {
    viewControllers.forEach(untitle)
    super.setViewControllers(viewControllers, animated: animated)
  }

  private func applyDuoContext() {
    viewControllers.forEach(untitle)
    let hidden = !traitCollection.duoContext.hasVerticalBar
    if isNavigationBarHidden != hidden {
      setNavigationBarHidden(hidden, animated: false)
    }
  }

  private func untitle(_ viewController: UIViewController) {
    guard viewController.navigationItem.titleView == nil else { return }
    viewController.navigationItem.titleView = UIView()
  }
}
