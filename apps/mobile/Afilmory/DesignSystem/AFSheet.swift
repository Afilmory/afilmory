import SwiftUI
import UIKit

class AFSheetController: UIViewController, UIViewControllerTransitioningDelegate {
  let sheetContent = UIView()
  let detent: AFSheetDetent
  var closeAction: (() -> Void)?

  private let titleLabel = AFLabel.exhibit(nil, size: 28)
  private let subtitleLabel = AFLabel.mono(nil, size: 11)
  private let closeButton = UIButton(type: .system)
  private let headerRow = UIStackView()
  private var hosted: UIViewController?
  private var hostedFitting: ((CGSize) -> CGSize)?

  init(title: String?, subtitle: String? = nil, detent: AFSheetDetent = .fit) {
    self.detent = detent
    super.init(nibName: nil, bundle: nil)
    titleLabel.text = title
    subtitleLabel.text = subtitle
    modalPresentationStyle = .custom
    transitioningDelegate = self
  }

  convenience init(title: String?, subtitle: String? = nil, detent: AFSheetDetent = .fit, rootView: some View) {
    self.init(title: title, subtitle: subtitle, detent: detent)
    let host = UIHostingController(rootView: rootView)
    host.view.backgroundColor = .clear
    host.sizingOptions = .preferredContentSize
    host.safeAreaRegions = []
    hosted = host
    hostedFitting = { [weak host] size in host?.sizeThatFits(in: size) ?? .zero }
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  static func topPresenter() -> UIViewController? {
    let window = UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .flatMap(\.windows)
      .first { $0.isKeyWindow }
    var top = window?.rootViewController
    while let presented = top?.presentedViewController, !presented.isBeingDismissed {
      top = presented
    }
    return top
  }

  func setHeader(title: String?, subtitle: String? = nil) {
    titleLabel.text = title
    subtitleLabel.text = subtitle
    updateHeaderVisibility()
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = AFColor.sheet
    view.layer.cornerRadius = AFRadius.sheet
    view.layer.cornerCurve = .continuous
    view.layer.borderWidth = 1
    view.layer.borderColor = AFColor.textPrimary.withAlphaComponent(0.08).cgColor
    view.clipsToBounds = true
    view.accessibilityViewIsModal = true

    let grabber = UIView()
    grabber.backgroundColor = AFColor.tick
    grabber.layer.cornerRadius = 2.5
    grabber.isAccessibilityElement = false

    titleLabel.font = AFFont.exhibit(size: 28, relativeTo: .title2)
    titleLabel.numberOfLines = 0
    titleLabel.accessibilityTraits = .header
    subtitleLabel.numberOfLines = 1
    let titles = UIStackView(arrangedSubviews: [titleLabel, subtitleLabel])
    titles.axis = .vertical
    titles.spacing = 2

    var configuration = UIButton.Configuration.filled()
    configuration.cornerStyle = .capsule
    configuration.baseBackgroundColor = AFColor.fill
    configuration.baseForegroundColor = AFColor.textPrimary
    configuration.image = UIImage(systemName: "xmark", withConfiguration: UIImage.SymbolConfiguration(pointSize: 15, weight: .semibold))
    closeButton.configuration = configuration
    closeButton.accessibilityLabel = String(localized: "Close")
    closeButton.addAction(UIAction { [weak self] _ in self?.close() }, for: .primaryActionTriggered)
    closeButton.setContentHuggingPriority(.required, for: .horizontal)

    headerRow.addArrangedSubview(titles)
    headerRow.addArrangedSubview(closeButton)
    headerRow.alignment = .center
    headerRow.spacing = 12

    for item in [grabber, headerRow, sheetContent] {
      item.translatesAutoresizingMaskIntoConstraints = false
      view.addSubview(item)
    }
    let contentTop = sheetContent.topAnchor.constraint(equalTo: headerRow.bottomAnchor, constant: 12)
    contentTopToGrabber = sheetContent.topAnchor.constraint(equalTo: grabber.bottomAnchor, constant: 8)
    contentTopToHeader = contentTop
    NSLayoutConstraint.activate([
      grabber.topAnchor.constraint(equalTo: view.topAnchor, constant: 8),
      grabber.centerXAnchor.constraint(equalTo: view.centerXAnchor),
      grabber.widthAnchor.constraint(equalToConstant: 36),
      grabber.heightAnchor.constraint(equalToConstant: 5),
      headerRow.topAnchor.constraint(equalTo: grabber.bottomAnchor, constant: 10),
      headerRow.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 22),
      headerRow.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -18),
      closeButton.widthAnchor.constraint(equalToConstant: 44),
      closeButton.heightAnchor.constraint(equalToConstant: 44),
      sheetContent.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      sheetContent.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      sheetContent.bottomAnchor.constraint(equalTo: view.bottomAnchor),
    ])
    updateHeaderVisibility()

    sheetContent.keyboardLayoutGuide.usesBottomSafeArea = false
    if let hosted {
      addChild(hosted)
      hosted.view.translatesAutoresizingMaskIntoConstraints = false
      sheetContent.addSubview(hosted.view)
      NSLayoutConstraint.activate([
        hosted.view.topAnchor.constraint(equalTo: sheetContent.topAnchor),
        hosted.view.leadingAnchor.constraint(equalTo: sheetContent.leadingAnchor),
        hosted.view.trailingAnchor.constraint(equalTo: sheetContent.trailingAnchor),
        hosted.view.bottomAnchor.constraint(equalTo: sheetContent.keyboardLayoutGuide.topAnchor),
      ])
      hosted.didMove(toParent: self)
    }
  }

  private var contentTopToGrabber: NSLayoutConstraint?
  private var contentTopToHeader: NSLayoutConstraint?

  private func updateHeaderVisibility() {
    guard isViewLoaded else { return }
    let hasHeader = titleLabel.text?.isEmpty == false
    headerRow.isHidden = !hasHeader
    closeButton.isHidden = !hasHeader
    subtitleLabel.isHidden = subtitleLabel.text?.isEmpty != false
    contentTopToHeader?.isActive = hasHeader
    contentTopToGrabber?.isActive = !hasHeader
  }

  func fittingHeight(width: CGFloat) -> CGFloat {
    if let hostedFitting {
      loadViewIfNeeded()
      let hasHeader = !headerRow.isHidden
      let header = hasHeader
        ? headerRow.systemLayoutSizeFitting(
          CGSize(width: width - 40, height: UIView.layoutFittingCompressedSize.height),
          withHorizontalFittingPriority: .required,
          verticalFittingPriority: .fittingSizeLevel
        ).height + 10 + 12
        : 8
      let chrome = 8 + 5 + header
      let content = hostedFitting(CGSize(width: width, height: .greatestFiniteMagnitude)).height
      return chrome + content
    }
    return view.systemLayoutSizeFitting(
      CGSize(width: width, height: UIView.layoutFittingCompressedSize.height),
      withHorizontalFittingPriority: .required,
      verticalFittingPriority: .fittingSizeLevel
    ).height
  }

  override func preferredContentSizeDidChange(forChildContentContainer container: UIContentContainer) {
    super.preferredContentSizeDidChange(forChildContentContainer: container)
    (presentationController as? AFSheetPresentationController)?.contentSizeDidChange()
  }

  func close() {
    if let closeAction {
      closeAction()
    } else {
      dismiss(animated: true)
    }
  }

  override func accessibilityPerformEscape() -> Bool {
    close()
    return true
  }

  func presentationController(
    forPresented presented: UIViewController,
    presenting: UIViewController?,
    source _: UIViewController
  ) -> UIPresentationController? {
    AFSheetPresentationController(presentedViewController: presented, presenting: presenting)
  }

  func animationController(
    forPresented _: UIViewController,
    presenting _: UIViewController,
    source _: UIViewController
  ) -> UIViewControllerAnimatedTransitioning? {
    AFSheetAnimator(presenting: true)
  }

  func animationController(forDismissed _: UIViewController) -> UIViewControllerAnimatedTransitioning? {
    AFSheetAnimator(presenting: false)
  }
}

final class AFSheetPresentationController: UIPresentationController, UIGestureRecognizerDelegate {
  private static let backgroundDefocus: CGFloat = 0.4

  private let dimming = UIView()
  private var pan: UIPanGestureRecognizer?
  private var rest: AFSheetRest = .collapsed
  private var keyboardOverlap: CGFloat = 0
  private var trackedScrollView: UIScrollView?
  private var panGeometry: AFSheetGeometry?
  private var trackingOrigin: CGFloat = 0
  private var sheetTracking = false
  private var defocusedView: UIView?

  private var sheet: AFSheetController? { presentedViewController as? AFSheetController }

  private func geometry(in container: UIView) -> AFSheetGeometry {
    let inset = AFRadius.sheetInset
    let width = container.bounds.width - inset * 2
    return AFSheetGeometry(
      containerHeight: container.bounds.height - keyboardOverlap,
      topInset: container.safeAreaInsets.top,
      inset: inset,
      fittingHeight: sheet?.fittingHeight(width: width) ?? presentedViewController.view.systemLayoutSizeFitting(
        CGSize(width: width, height: UIView.layoutFittingCompressedSize.height),
        withHorizontalFittingPriority: .required,
        verticalFittingPriority: .fittingSizeLevel
      ).height,
      detent: sheet?.detent ?? .fit
    )
  }

  private func frame(height: CGFloat, in container: UIView) -> CGRect {
    let inset = AFRadius.sheetInset
    let bottom = container.bounds.height - keyboardOverlap - inset
    return CGRect(x: inset, y: bottom - height, width: container.bounds.width - inset * 2, height: height)
  }

  override var frameOfPresentedViewInContainerView: CGRect {
    guard let container = containerView else { return .zero }
    return frame(height: geometry(in: container).height(for: rest), in: container)
  }

  override func presentationTransitionWillBegin() {
    guard let container = containerView else { return }
    dimming.backgroundColor = UIColor.black.withAlphaComponent(0.55)
    dimming.frame = container.bounds
    dimming.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    dimming.alpha = 0
    dimming.isAccessibilityElement = true
    dimming.accessibilityLabel = String(localized: "Close")
    dimming.accessibilityTraits = .button
    dimming.addGestureRecognizer(UITapGestureRecognizer(target: self, action: #selector(dismissSheet)))
    container.insertSubview(dimming, at: 0)
    AppNavigator.shared.setTabBarHidden(true)
    if let background = presentingViewController.viewIfLoaded {
      defocusedView = background
      AFMotion.defocus(background, amount: Self.backgroundDefocus)
    }
    NotificationCenter.default.addObserver(
      self, selector: #selector(keyboardWillChange(_:)),
      name: UIResponder.keyboardWillChangeFrameNotification, object: nil
    )
    presentedViewController.transitionCoordinator?.animate { _ in self.dimming.alpha = 1 }
  }

  override func presentationTransitionDidEnd(_ completed: Bool) {
    guard completed else {
      AppNavigator.shared.setTabBarHidden(false)
      restoreBackground()
      return
    }
    let pan = UIPanGestureRecognizer(target: self, action: #selector(handlePan(_:)))
    pan.delegate = self
    presentedView?.addGestureRecognizer(pan)
    self.pan = pan
  }

  override func dismissalTransitionWillBegin() {
    AppNavigator.shared.setTabBarHidden(false)
    restoreBackground()
    presentedViewController.transitionCoordinator?.animate { _ in self.dimming.alpha = 0 }
  }

  override func dismissalTransitionDidEnd(_ completed: Bool) {
    if completed {
      NotificationCenter.default.removeObserver(self)
    } else {
      AppNavigator.shared.setTabBarHidden(true)
      if let defocusedView { AFMotion.defocus(defocusedView, amount: Self.backgroundDefocus) }
    }
  }

  private func restoreBackground() {
    guard let defocusedView else { return }
    AFMotion.refocus(defocusedView)
  }

  override func containerViewWillLayoutSubviews() {
    super.containerViewWillLayoutSubviews()
    guard !sheetTracking else { return }
    presentedView?.frame = frameOfPresentedViewInContainerView
  }

  func contentSizeDidChange() {
    guard let presentedView, !sheetTracking else { return }
    AFMotion.spring(duration: 0.45, animations: { presentedView.frame = self.frameOfPresentedViewInContainerView })
  }

  override func preferredContentSizeDidChange(forChildContentContainer _: UIContentContainer) {
    contentSizeDidChange()
  }

  @objc private func keyboardWillChange(_ note: Notification) {
    guard let container = containerView,
          let end = note.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect
    else { return }
    let local = container.convert(end, from: nil)
    keyboardOverlap = max(0, container.bounds.maxY - local.minY)
    if keyboardOverlap > 0, sheet?.detent == .fitAndExpanded { rest = .expanded }
    let duration = note.userInfo?[UIResponder.keyboardAnimationDurationUserInfoKey] as? TimeInterval ?? 0.25
    UIView.animate(withDuration: duration) {
      self.presentedView?.frame = self.frameOfPresentedViewInContainerView
    }
  }

  func gestureRecognizerShouldBegin(_ gesture: UIGestureRecognizer) -> Bool {
    guard let pan = gesture as? UIPanGestureRecognizer, let view = presentedView else { return true }
    let velocity = pan.velocity(in: view)
    return abs(velocity.y) > abs(velocity.x)
  }

  func gestureRecognizer(
    _ gesture: UIGestureRecognizer,
    shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer
  ) -> Bool {
    guard gesture === pan, let scroll = other.view as? UIScrollView else { return false }
    return other === scroll.panGestureRecognizer
  }

  @objc private func dismissSheet() {
    sheet?.close() ?? presentedViewController.dismiss(animated: true)
  }

  private func scrollIsAtTop(_ scroll: UIScrollView) -> Bool {
    scroll.contentOffset.y <= -scroll.adjustedContentInset.top + 0.5
  }

  private func pinToTop(_ scroll: UIScrollView) {
    scroll.contentOffset.y = -scroll.adjustedContentInset.top
  }

  @objc private func handlePan(_ gesture: UIPanGestureRecognizer) {
    guard let view = presentedView, let container = containerView else { return }
    if gesture.state == .began { panGeometry = geometry(in: container) }
    guard let geometry = panGeometry else { return }
    let raw = gesture.translation(in: view).y
    switch gesture.state {
    case .began:
      let downward = gesture.velocity(in: view).y > 0
      trackedScrollView = AFSheetHandoff.scrollView(at: gesture.location(in: view), in: view)
      trackingOrigin = 0
      if let scroll = trackedScrollView {
        sheetTracking = downward ? scrollIsAtTop(scroll) : (rest == .collapsed && geometry.canExpand)
      } else {
        sheetTracking = true
      }
    case .changed:
      if !sheetTracking, let scroll = trackedScrollView,
         AFSheetHandoff.sheetTakesOver(scrollAtTop: scrollIsAtTop(scroll), movingDown: gesture.velocity(in: view).y > 0) {
        sheetTracking = true
        trackingOrigin = raw
      }
      guard sheetTracking else { return }
      let translation = raw - trackingOrigin
      if let scroll = trackedScrollView { pinToTop(scroll) }
      let start = geometry.height(for: rest)
      let upper = geometry.height(for: .expanded)
      let lower = geometry.height(for: .collapsed)
      let proposed = start - translation
      if proposed >= lower {
        let height = proposed > upper ? upper + (proposed - upper) * 0.15 : proposed
        view.transform = .identity
        view.frame = frame(height: height, in: container)
        dimming.alpha = 1
      } else {
        view.frame = frame(height: lower, in: container)
        let drop = lower - proposed
        view.transform = CGAffineTransform(translationX: 0, y: drop)
        dimming.alpha = 1 - min(1, drop / max(1, lower))
      }
    case .ended, .cancelled:
      defer {
        sheetTracking = false
        trackedScrollView = nil
        panGeometry = nil
      }
      guard sheetTracking else { return }
      switch geometry.release(from: rest, translation: raw - trackingOrigin, velocity: gesture.velocity(in: view).y) {
      case .dismiss:
        dismissSheet()
      case .rest(let next):
        rest = next
        AFMotion.spring(duration: 0.4, animations: {
          view.transform = .identity
          view.frame = self.frame(height: geometry.height(for: next), in: container)
          self.dimming.alpha = 1
        })
      }
    default:
      break
    }
  }
}

final class AFSheetAnimator: NSObject, UIViewControllerAnimatedTransitioning {
  private let presenting: Bool

  init(presenting: Bool) {
    self.presenting = presenting
  }

  func transitionDuration(using _: UIViewControllerContextTransitioning?) -> TimeInterval {
    MainActor.assumeIsolated { AFMotion.reduceMotion ? 0.25 : 0.56 }
  }

  func animateTransition(using context: UIViewControllerContextTransitioning) {
    MainActor.assumeIsolated {
      let key: UITransitionContextViewControllerKey = presenting ? .to : .from
      guard let controller = context.viewController(forKey: key) else {
        context.completeTransition(false)
        return
      }
      let view = controller.view!
      let duration = transitionDuration(using: context)
      let final = context.finalFrame(for: controller)
      let reduce = AFMotion.reduceMotion
      if presenting {
        context.containerView.addSubview(view)
        view.frame = final
        if reduce {
          view.alpha = 0
        } else {
          view.transform = CGAffineTransform(translationX: 0, y: final.height + 40)
        }
      }
      UIView.animate(
        withDuration: duration, delay: 0, usingSpringWithDamping: presenting ? 0.9 : 1, initialSpringVelocity: 0,
        options: [.allowUserInteraction, .beginFromCurrentState]
      ) {
        if self.presenting {
          view.transform = .identity
          view.alpha = 1
        } else if reduce {
          view.alpha = 0
        } else {
          view.transform = CGAffineTransform(translationX: 0, y: view.bounds.height + 40)
        }
      } completion: { _ in
        context.completeTransition(!context.transitionWasCancelled)
      }
    }
  }
}
