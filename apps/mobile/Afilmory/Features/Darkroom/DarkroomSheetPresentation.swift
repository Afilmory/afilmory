import UIKit

class DarkroomSheetController: UIViewController, UIViewControllerTransitioningDelegate {
  let sheetContent = UIView()

  init() {
    super.init(nibName: nil, bundle: nil)
    modalPresentationStyle = .custom
    transitioningDelegate = self
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
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
    for item in [grabber, sheetContent] {
      item.translatesAutoresizingMaskIntoConstraints = false
      view.addSubview(item)
    }
    NSLayoutConstraint.activate([
      grabber.topAnchor.constraint(equalTo: view.topAnchor, constant: 8),
      grabber.centerXAnchor.constraint(equalTo: view.centerXAnchor),
      grabber.widthAnchor.constraint(equalToConstant: 36),
      grabber.heightAnchor.constraint(equalToConstant: 5),
      sheetContent.topAnchor.constraint(equalTo: grabber.bottomAnchor, constant: 8),
      sheetContent.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      sheetContent.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      sheetContent.bottomAnchor.constraint(equalTo: view.bottomAnchor),
    ])
  }

  override func accessibilityPerformEscape() -> Bool {
    dismiss(animated: true)
    return true
  }

  func presentationController(
    forPresented presented: UIViewController,
    presenting: UIViewController?,
    source _: UIViewController
  ) -> UIPresentationController? {
    DarkroomSheetPresentationController(presentedViewController: presented, presenting: presenting)
  }

  func animationController(
    forPresented _: UIViewController,
    presenting _: UIViewController,
    source _: UIViewController
  ) -> UIViewControllerAnimatedTransitioning? {
    DarkroomSheetAnimator(presenting: true)
  }

  func animationController(forDismissed _: UIViewController) -> UIViewControllerAnimatedTransitioning? {
    DarkroomSheetAnimator(presenting: false)
  }
}

final class DarkroomSheetPresentationController: UIPresentationController, UIGestureRecognizerDelegate {
  private let dimming = UIView()
  private var pan: UIPanGestureRecognizer?

  override var frameOfPresentedViewInContainerView: CGRect {
    guard let container = containerView else { return .zero }
    let inset = AFRadius.sheetInset
    let width = container.bounds.width - inset * 2
    let maximum = container.bounds.height - container.safeAreaInsets.top - inset * 2
    let fitting = presentedViewController.view.systemLayoutSizeFitting(
      CGSize(width: width, height: UIView.layoutFittingCompressedSize.height),
      withHorizontalFittingPriority: .required,
      verticalFittingPriority: .fittingSizeLevel
    ).height
    let height = min(maximum, max(200, fitting))
    return CGRect(x: inset, y: container.bounds.height - inset - height, width: width, height: height)
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
    presentedViewController.transitionCoordinator?.animate { _ in self.dimming.alpha = 1 }
  }

  override func presentationTransitionDidEnd(_ completed: Bool) {
    guard completed else {
      AppNavigator.shared.setTabBarHidden(false)
      return
    }
    let pan = UIPanGestureRecognizer(target: self, action: #selector(handlePan(_:)))
    pan.delegate = self
    presentedView?.addGestureRecognizer(pan)
    self.pan = pan
  }

  override func dismissalTransitionWillBegin() {
    AppNavigator.shared.setTabBarHidden(false)
    presentedViewController.transitionCoordinator?.animate { _ in self.dimming.alpha = 0 }
  }

  override func dismissalTransitionDidEnd(_ completed: Bool) {
    if !completed { AppNavigator.shared.setTabBarHidden(true) }
  }

  override func containerViewWillLayoutSubviews() {
    super.containerViewWillLayoutSubviews()
    presentedView?.frame = frameOfPresentedViewInContainerView
  }

  override func preferredContentSizeDidChange(forChildContentContainer _: UIContentContainer) {
    guard let presentedView else { return }
    AFMotion.spring(duration: 0.45, animations: { presentedView.frame = self.frameOfPresentedViewInContainerView })
  }

  func gestureRecognizerShouldBegin(_ gesture: UIGestureRecognizer) -> Bool {
    guard let pan = gesture as? UIPanGestureRecognizer, let view = presentedView else { return true }
    let velocity = pan.velocity(in: view)
    return velocity.y > abs(velocity.x)
  }

  @objc private func dismissSheet() {
    presentedViewController.dismiss(animated: true)
  }

  @objc private func handlePan(_ gesture: UIPanGestureRecognizer) {
    guard let view = presentedView else { return }
    let translation = max(0, gesture.translation(in: view).y)
    switch gesture.state {
    case .changed:
      view.transform = CGAffineTransform(translationX: 0, y: translation)
      dimming.alpha = 1 - min(1, translation / max(1, view.bounds.height))
    case .ended, .cancelled:
      let velocity = gesture.velocity(in: view).y
      if translation > view.bounds.height * 0.3 || velocity > 900 {
        presentedViewController.dismiss(animated: true)
      } else {
        AFMotion.spring(duration: 0.4, animations: {
          view.transform = .identity
          self.dimming.alpha = 1
        })
      }
    default:
      break
    }
  }
}

final class DarkroomSheetAnimator: NSObject, UIViewControllerAnimatedTransitioning {
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
