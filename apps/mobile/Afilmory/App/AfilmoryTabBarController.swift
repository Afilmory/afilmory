import UIKit

final class AfilmoryTabBarController: UITabBarController {
  var onRequestDeveloperLab: (() -> Void)?

  let focusBar = AFFocusTabBar()
  private(set) var isFocusBarHidden = false
  private var developerLabTapCount = 0
  private var lastDeveloperLabTap: TimeInterval?
  private lazy var duoContextProvider = DuoContextProvider(controller: self)
  private var horizontalBarConstraints: [NSLayoutConstraint] = []
  private var switchOverlay: UIView?
  private var switchBlur: AFBlurView?
  private weak var switchTarget: UIView?

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
      let rail = Self.railFrame(
        edge: traitCollection.duoContext.barEdge,
        bounds: view.bounds,
        safeArea: view.safeAreaInsets,
        occlusionMaxY: occlusionMaxY()
      )
      focusBar.bounds = CGRect(origin: .zero, size: rail.size)
      focusBar.center = CGPoint(x: rail.midX, y: rail.midY)
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
    if animated, tab.rawValue != selectedIndex, let outgoing = selectedViewController?.view,
       let incoming = viewControllers?[tab.rawValue] {
      settleSwitch()
      let snapshot = outgoing.snapshotView(afterScreenUpdates: false)
      let snapshotFrame = outgoing.convert(outgoing.bounds, to: view)
      selectedIndex = tab.rawValue
      playSwitch(snapshot: snapshot, frame: snapshotFrame, incoming: incoming.view)
    } else {
      selectedIndex = tab.rawValue
    }
    focusBar.select(tab, animated: animated)
  }

  private func settleSwitch() {
    switchOverlay?.removeFromSuperview()
    switchOverlay = nil
    switchBlur?.removeFromSuperview()
    switchBlur = nil
    if let target = switchTarget {
      target.layer.removeAllAnimations()
      target.alpha = 1
      target.transform = .identity
    }
    switchTarget = nil
  }

  private func playSwitch(snapshot: UIView?, frame: CGRect, incoming: UIView) {
    let overlay = UIView(frame: frame)
    overlay.isUserInteractionEnabled = false
    if let snapshot {
      snapshot.frame = overlay.bounds
      overlay.addSubview(snapshot)
    }
    view.insertSubview(overlay, belowSubview: focusBar)
    switchOverlay = overlay
    switchTarget = incoming
    guard !AFMotion.reduceMotion else {
      incoming.alpha = 0
      UIView.animate(withDuration: 0.2, delay: 0, options: [.allowUserInteraction]) {
        overlay.alpha = 0
        incoming.alpha = 1
      } completion: { [weak self, weak overlay] _ in
        guard let overlay, self?.switchOverlay === overlay else { return }
        self?.settleSwitch()
      }
      return
    }
    let outgoingBlur = AFBlurView(frame: overlay.bounds)
    outgoingBlur.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    overlay.addSubview(outgoingBlur)
    outgoingBlur.setRadius(10, duration: 0.45)
    UIView.animate(withDuration: 0.45, delay: 0, options: [.allowUserInteraction, .curveEaseOut]) {
      overlay.alpha = 0
      overlay.transform = CGAffineTransform(scaleX: 0.985, y: 0.985)
    }

    let incomingBlur = AFBlurView(frame: incoming.bounds)
    incomingBlur.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    incoming.addSubview(incomingBlur)
    incomingBlur.radius = 24
    switchBlur = incomingBlur
    incoming.alpha = 0
    incoming.transform = CGAffineTransform(scaleX: 1.06, y: 1.06)
    AFMotion.spring(duration: 0.7, animations: {
      incoming.alpha = 1
      incoming.transform = .identity
    })
    incomingBlur.setRadius(0, duration: 0.56) { [weak self, weak incomingBlur] in
      guard let self, let incomingBlur, switchBlur === incomingBlur else { return }
      incomingBlur.removeFromSuperview()
      switchBlur = nil
      switchOverlay?.removeFromSuperview()
      switchOverlay = nil
    }
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
