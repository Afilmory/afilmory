import UIKit

final class DarkroomNavigationDelegate: NSObject, UINavigationControllerDelegate, UIGestureRecognizerDelegate {
  private weak var navigation: UINavigationController?
  private var interaction: UIPercentDrivenInteractiveTransition?
  private let backPan: UIPanGestureRecognizer = {
    if #available(iOS 26.0, *) { return UIPanGestureRecognizer() }
    let edge = UIScreenEdgePanGestureRecognizer()
    edge.edges = .left
    return edge
  }()

  init(navigation: UINavigationController) {
    self.navigation = navigation
    super.init()
    navigation.delegate = self
    navigation.interactivePopGestureRecognizer?.isEnabled = false
    if #available(iOS 26.0, *) {
      navigation.interactiveContentPopGestureRecognizer?.isEnabled = false
    }
    backPan.delegate = self
    backPan.addTarget(self, action: #selector(handleBackPan(_:)))
    navigation.view.addGestureRecognizer(backPan)
  }

  func navigationController(
    _: UINavigationController,
    animationControllerFor operation: UINavigationController.Operation,
    from _: UIViewController,
    to _: UIViewController
  ) -> UIViewControllerAnimatedTransitioning? {
    switch operation {
    case .push: DarkroomPushAnimator(pushing: true)
    case .pop: DarkroomPushAnimator(pushing: false)
    default: nil
    }
  }

  func navigationController(
    _: UINavigationController,
    interactionControllerFor _: UIViewControllerAnimatedTransitioning
  ) -> UIViewControllerInteractiveTransitioning? {
    interaction
  }

  func gestureRecognizerShouldBegin(_ gesture: UIGestureRecognizer) -> Bool {
    guard (navigation?.viewControllers.count ?? 0) > 1, navigation?.transitionCoordinator == nil,
          gesture === backPan, let view = backPan.view
    else { return false }
    if backPan is UIScreenEdgePanGestureRecognizer { return true }
    return BackSwipeRule.isBackDrag(velocity: backPan.velocity(in: view))
      && !BackSwipeRule.isBlocked(at: backPan.location(in: view), in: view)
  }

  func gestureRecognizer(_ gesture: UIGestureRecognizer, shouldBeRequiredToFailBy other: UIGestureRecognizer) -> Bool {
    gesture === backPan && other is UIPanGestureRecognizer && !(other is UIScreenEdgePanGestureRecognizer)
  }

  @objc private func handleBackPan(_ gesture: UIPanGestureRecognizer) {
    guard let view = gesture.view else { return }
    let progress = min(1, max(0, gesture.translation(in: view).x / max(1, view.bounds.width)))
    switch gesture.state {
    case .began:
      let interaction = UIPercentDrivenInteractiveTransition()
      interaction.completionCurve = .easeOut
      self.interaction = interaction
      navigation?.popViewController(animated: true)
    case .changed:
      interaction?.update(progress)
    case .ended:
      let velocity = gesture.velocity(in: view).x
      if progress > 0.35 || velocity > 600 {
        interaction?.finish()
      } else {
        interaction?.cancel()
      }
      interaction = nil
    case .cancelled, .failed:
      interaction?.cancel()
      interaction = nil
    default:
      break
    }
  }
}

final class DarkroomPushAnimator: NSObject, UIViewControllerAnimatedTransitioning {
  private let pushing: Bool

  init(pushing: Bool) {
    self.pushing = pushing
  }

  func transitionDuration(using _: UIViewControllerContextTransitioning?) -> TimeInterval {
    MainActor.assumeIsolated { AFMotion.reduceMotion ? 0.25 : 0.5 }
  }

  func animateTransition(using context: UIViewControllerContextTransitioning) {
    MainActor.assumeIsolated { run(context) }
  }

  @MainActor
  private func run(_ context: UIViewControllerContextTransitioning) {
    guard let fromController = context.viewController(forKey: .from),
          let toController = context.viewController(forKey: .to)
    else {
      context.completeTransition(false)
      return
    }
    let container = context.containerView
    let width = container.bounds.width
    let back = pushing ? fromController.view! : toController.view!
    let front = pushing ? toController.view! : fromController.view!
    let reduce = AFMotion.reduceMotion
    toController.view.frame = context.finalFrame(for: toController)
    if pushing {
      container.addSubview(front)
    } else {
      container.insertSubview(back, belowSubview: front)
    }
    let blur = AFBlurView(frame: back.bounds)
    blur.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    if !reduce { back.addSubview(blur) }
    let covered = DarkroomPushGeometry(progress: 1, width: width)
    let rest = DarkroomPushGeometry(progress: 0, width: width)
    let start = pushing ? rest : covered
    let end = pushing ? covered : rest
    let apply: (DarkroomPushGeometry) -> Void = { geometry in
      back.transform = reduce ? .identity : CGAffineTransform(translationX: geometry.translation, y: 0)
      back.alpha = geometry.alpha
    }
    apply(start)
    blur.radius = start.blur
    let follower = reduce ? nil : DarkroomBlurFollower(blur: blur, source: back)
    front.layer.shadowColor = UIColor.black.cgColor
    front.layer.shadowOpacity = 0.5
    front.layer.shadowRadius = 20
    front.layer.shadowOffset = CGSize(width: -20, height: 0)
    if reduce {
      front.alpha = pushing ? 0 : 1
    } else {
      front.transform = CGAffineTransform(translationX: pushing ? width : 0, y: 0)
    }
    let duration = transitionDuration(using: context)
    let options: UIView.AnimationOptions = context.isInteractive ? [.curveLinear, .allowUserInteraction] : [.curveEaseOut, .allowUserInteraction]
    let animations = {
      apply(end)
      if reduce {
        front.alpha = self.pushing ? 1 : 0
      } else {
        front.transform = CGAffineTransform(translationX: self.pushing ? 0 : width, y: 0)
      }
    }
    let finish: (Bool) -> Void = { _ in
      let cancelled = context.transitionWasCancelled
      follower?.stop()
      blur.removeFromSuperview()
      back.transform = .identity
      back.alpha = 1
      front.transform = .identity
      front.alpha = 1
      front.layer.shadowOpacity = 0
      if cancelled, self.pushing { front.removeFromSuperview() }
      context.completeTransition(!cancelled)
    }
    if context.isInteractive {
      UIView.animate(withDuration: duration, delay: 0, options: options, animations: animations, completion: finish)
    } else {
      UIView.animate(
        withDuration: duration, delay: 0, usingSpringWithDamping: 1, initialSpringVelocity: 0,
        options: options, animations: animations, completion: finish
      )
    }
  }
}

@MainActor
private final class DarkroomBlurFollower: NSObject {
  private weak var blur: AFBlurView?
  private weak var source: UIView?
  private var link: CADisplayLink?

  init(blur: AFBlurView, source: UIView) {
    self.blur = blur
    self.source = source
    super.init()
    let link = CADisplayLink(target: self, selector: #selector(tick))
    link.add(to: .main, forMode: .common)
    self.link = link
  }

  @objc private func tick() {
    guard let blur, let source else { return stop() }
    let alpha = CGFloat(source.layer.presentation()?.opacity ?? Float(source.alpha))
    let progress = (1 - alpha) / (1 - DarkroomPushGeometry.dimmedAlpha)
    blur.radius = DarkroomPushGeometry.maximumBlur * min(1, max(0, progress))
  }

  func stop() {
    link?.invalidate()
    link = nil
  }
}
