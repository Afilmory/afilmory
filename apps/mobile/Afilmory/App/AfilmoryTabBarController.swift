import UIKit

final class AfilmoryTabBarController: UITabBarController, UITabBarControllerDelegate {
  var onRequestDeveloperLab: (() -> Void)?

  let focusBar = AFFocusTabBar()
  private(set) var isFocusBarHidden = false
  private var developerLabTapCount = 0
  private var lastDeveloperLabTap: TimeInterval?
  private lazy var duoContextProvider = DuoContextProvider(controller: self)
  private var horizontalBarConstraints: [NSLayoutConstraint] = []

  private var usesRail: Bool { traitCollection.duoContext.hasVerticalBar }

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
    horizontalBarConstraints = [
      focusBar.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      focusBar.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      focusBar.bottomAnchor.constraint(equalTo: view.bottomAnchor),
      focusBar.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -AFFocusTabBar.barHeight),
    ]
    NSLayoutConstraint.activate(horizontalBarConstraints)
    registerForTraitChanges([DuoContextTrait.self]) { (tabs: AfilmoryTabBarController, _: UITraitCollection) in
      tabs.applyBarAxis()
    }
    applyBarAxis()
    _ = duoContextProvider
  }

  override func viewDidLayoutSubviews() {
    super.viewDidLayoutSubviews()
    view.bringSubviewToFront(focusBar)
    if usesRail {
      focusBar.frame = Self.railFrame(
        edge: traitCollection.duoContext.barEdge,
        bounds: view.bounds,
        safeArea: view.safeAreaInsets,
        occlusionMaxY: occlusionMaxY()
      )
    }
    duoContextProvider.refresh()
  }

  static func railFrame(edge: DuoBarEdge, bounds: CGRect, safeArea: UIEdgeInsets, occlusionMaxY: CGFloat) -> CGRect {
    let width = edge == .leading ? safeArea.left : safeArea.right
    let x = edge == .leading ? bounds.minX : bounds.maxX - width
    let top = max(occlusionMaxY + 24, bounds.minY + bounds.height * 0.4)
    let bottom = bounds.maxY - max(safeArea.bottom, 16)
    return CGRect(x: x, y: top, width: width, height: max(0, bottom - top))
  }

  private func occlusionMaxY() -> CGFloat {
    guard #available(iOS 27.1, *) else { return 0 }
    return view.reservedRegions(kind: .occlusion)
      .map(\.frame.maxY)
      .max() ?? 0
  }

  private func applyBarAxis() {
    let rail = usesRail
    focusBar.axis = rail ? .vertical : .horizontal
    if rail {
      NSLayoutConstraint.deactivate(horizontalBarConstraints)
      focusBar.translatesAutoresizingMaskIntoConstraints = true
    } else {
      focusBar.translatesAutoresizingMaskIntoConstraints = false
      NSLayoutConstraint.activate(horizontalBarConstraints)
    }
    applyContentInsets()
    view.setNeedsLayout()
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
      self.focusBar.transform = hidden ? self.hiddenBarTransform : .identity
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

  private var hiddenBarTransform: CGAffineTransform {
    switch traitCollection.duoContext.barEdge {
    case .none: CGAffineTransform(translationX: 0, y: 24)
    case .leading: CGAffineTransform(translationX: -24, y: 0)
    case .trailing: CGAffineTransform(translationX: 24, y: 0)
    }
  }

  private func applyContentInsets() {
    let inset: CGFloat = isFocusBarHidden || usesRail ? 0 : AFFocusTabBar.barHeight
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
