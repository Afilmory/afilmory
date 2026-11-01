import UIKit

final class AfilmoryTabBarController: UITabBarController, UITabBarControllerDelegate {
  var onRequestDeveloperLab: (() -> Void)?

  let focusBar = AFFocusTabBar()
  private(set) var isFocusBarHidden = false
  private var developerLabTapCount = 0
  private var lastDeveloperLabTap: TimeInterval?

  init(controllers: [UIViewController]) {
    super.init(nibName: nil, bundle: nil)
    setViewControllers(controllers, animated: false)
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  var currentTab: AppTab {
    AppTab(rawValue: selectedIndex) ?? .exhibition
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    delegate = self
    view.backgroundColor = AFColor.ground
    isTabBarHidden = true
    tabBar.isHidden = true
    focusBar.translatesAutoresizingMaskIntoConstraints = false
    focusBar.onSelect = { [weak self] tab in self?.userSelected(tab) }
    view.addSubview(focusBar)
    NSLayoutConstraint.activate([
      focusBar.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      focusBar.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      focusBar.bottomAnchor.constraint(equalTo: view.bottomAnchor),
      focusBar.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -AFFocusTabBar.barHeight),
    ])
    applyContentInsets()
  }

  override func viewDidLayoutSubviews() {
    super.viewDidLayoutSubviews()
    view.bringSubviewToFront(focusBar)
  }

  override func setViewControllers(_ viewControllers: [UIViewController]?, animated: Bool) {
    super.setViewControllers(viewControllers, animated: animated)
    applyContentInsets()
  }

  func select(_ tab: AppTab, animated: Bool) {
    guard viewControllers?.indices.contains(tab.rawValue) == true else { return }
    if animated, tab.rawValue != selectedIndex, let target = viewControllers?[tab.rawValue] {
      selectedViewController = target
    } else {
      selectedIndex = tab.rawValue
    }
    focusBar.select(tab, animated: animated)
  }

  func setFocusBarHidden(_ hidden: Bool, animated: Bool) {
    guard hidden != isFocusBarHidden else { return }
    isFocusBarHidden = hidden
    applyContentInsets()
    let changes = {
      self.focusBar.alpha = hidden ? 0 : 1
      self.focusBar.transform = hidden ? CGAffineTransform(translationX: 0, y: 24) : .identity
    }
    focusBar.isUserInteractionEnabled = !hidden
    animated ? AFMotion.spring(duration: 0.4, animations: changes) : changes()
  }

  private func registerDeveloperLabTap(on tab: AppTab) {
    #if DEBUG
      guard tab == .darkroom else {
        developerLabTapCount = 0
        lastDeveloperLabTap = nil
        return
      }
      let now = ProcessInfo.processInfo.systemUptime
      if let lastDeveloperLabTap, now - lastDeveloperLabTap <= 1 {
        developerLabTapCount += 1
      } else {
        developerLabTapCount = 1
      }
      lastDeveloperLabTap = now
      if developerLabTapCount >= 5 {
        developerLabTapCount = 0
        lastDeveloperLabTap = nil
        DispatchQueue.main.async { [weak self] in self?.onRequestDeveloperLab?() }
      }
    #endif
  }

  func tabBarController(
    _: UITabBarController,
    animationControllerForTransitionFrom _: UIViewController,
    to _: UIViewController
  ) -> UIViewControllerAnimatedTransitioning? {
    AFTabFocusTransition()
  }

  private func userSelected(_ tab: AppTab) {
    registerDeveloperLabTap(on: tab)
    if tab.rawValue == selectedIndex {
      (viewControllers?[tab.rawValue] as? UINavigationController)?.popToRootViewController(animated: true)
      return
    }
    select(tab, animated: true)
  }

  private func applyContentInsets() {
    let inset: CGFloat = isFocusBarHidden ? 0 : AFFocusTabBar.barHeight
    for controller in viewControllers ?? [] {
      controller.additionalSafeAreaInsets.bottom = inset
    }
  }
}

final class AFTabFocusTransition: NSObject, UIViewControllerAnimatedTransitioning {
  func transitionDuration(using _: UIViewControllerContextTransitioning?) -> TimeInterval {
    MainActor.assumeIsolated { AFMotion.reduceMotion ? 0.2 : 0.5 }
  }

  func animateTransition(using context: UIViewControllerContextTransitioning) {
    MainActor.assumeIsolated {
      guard let fromView = context.view(forKey: .from), let toView = context.view(forKey: .to) else {
        context.completeTransition(!context.transitionWasCancelled)
        return
      }
      let container = context.containerView
      if let toController = context.viewController(forKey: .to) {
        toView.frame = context.finalFrame(for: toController)
      }
      container.addSubview(toView)
      let duration = transitionDuration(using: context)
      AFMotion.defocus(fromView, amount: 1)
      AFMotion.rackIn(toView)
      UIView.animate(withDuration: duration, delay: 0, options: [.allowUserInteraction]) {
        fromView.alpha = 0
      } completion: { _ in
        AFMotion.refocus(fromView, animated: false)
        fromView.alpha = 1
        fromView.transform = .identity
        context.completeTransition(!context.transitionWasCancelled)
      }
    }
  }
}
