import UIKit

final class DarkroomNavigationDelegate: NSObject, UINavigationControllerDelegate, UIGestureRecognizerDelegate {
  private weak var navigation: UINavigationController?
  private var interaction: DarkroomBackInteraction?
  private let backPan = UIPanGestureRecognizer()

  init(navigation: UINavigationController) {
    self.navigation = navigation
    super.init()
    navigation.delegate = self
    navigation.interactivePopGestureRecognizer?.isEnabled = false
    navigation.interactiveContentPopGestureRecognizer?.isEnabled = false
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
    interactionControllerFor animationController: UIViewControllerAnimatedTransitioning
  ) -> UIViewControllerInteractiveTransitioning? {
    guard let interaction, let animator = animationController as? DarkroomPushAnimator else { return nil }
    interaction.animator = animator
    return interaction
  }

  func gestureRecognizerShouldBegin(_ gesture: UIGestureRecognizer) -> Bool {
    guard (navigation?.viewControllers.count ?? 0) > 1, navigation?.transitionCoordinator == nil,
          gesture === backPan, let view = backPan.view
    else { return false }
    return BackSwipeRule.isBackDrag(velocity: backPan.velocity(in: view))
      && !BackSwipeRule.isBlocked(at: backPan.location(in: view), in: view)
  }

  func gestureRecognizer(_ gesture: UIGestureRecognizer, shouldBeRequiredToFailBy other: UIGestureRecognizer) -> Bool {
    gesture === backPan && other is UIPanGestureRecognizer
  }

  @objc private func handleBackPan(_ gesture: UIPanGestureRecognizer) {
    guard let view = gesture.view else { return }
    let width = max(1, view.bounds.width)
    let progress = min(1, max(0, gesture.translation(in: view).x / width))
    switch gesture.state {
    case .began:
      interaction = DarkroomBackInteraction()
      navigation?.popViewController(animated: true)
    case .changed:
      interaction?.update(progress)
    case .ended:
      interaction?.release(DarkroomBackRelease(progress: progress, velocity: gesture.velocity(in: view).x, width: width))
      interaction = nil
    case .cancelled, .failed:
      interaction?.release(DarkroomBackRelease(progress: 0, velocity: 0, width: width))
      interaction = nil
    default:
      break
    }
  }
}

@MainActor
final class DarkroomBackInteraction: NSObject, UIViewControllerInteractiveTransitioning {
  weak var animator: DarkroomPushAnimator?
  private var context: UIViewControllerContextTransitioning?
  private var driven: UIViewImplicitlyAnimating?
  private var progress: CGFloat = 0
  private var pending: DarkroomBackRelease?

  var wantsInteractiveStart: Bool { true }

  nonisolated func startInteractiveTransition(_ context: UIViewControllerContextTransitioning) {
    MainActor.assumeIsolated { begin(context) }
  }

  private func begin(_ context: UIViewControllerContextTransitioning) {
    guard let animator else {
      context.completeTransition(false)
      return
    }
    self.context = context
    driven = animator.interruptibleAnimator(using: context)
    update(progress)
    if let pending { release(pending) }
  }

  func update(_ progress: CGFloat) {
    self.progress = progress
    guard let driven, let context else { return }
    driven.fractionComplete = progress
    context.updateInteractiveTransition(progress)
  }

  func release(_ release: DarkroomBackRelease) {
    guard let driven, let context else {
      pending = release
      return
    }
    pending = nil
    if release.finishes {
      context.finishInteractiveTransition()
    } else {
      driven.isReversed = true
      context.cancelInteractiveTransition()
    }
    driven.continueAnimation?(withTimingParameters: release.timing, durationFactor: 1)
  }
}

final class DarkroomPushAnimator: NSObject, UIViewControllerAnimatedTransitioning {
  private let pushing: Bool
  private var running: UIViewPropertyAnimator?

  init(pushing: Bool) {
    self.pushing = pushing
  }

  func transitionDuration(using _: UIViewControllerContextTransitioning?) -> TimeInterval {
    MainActor.assumeIsolated { AFMotion.reduceMotion ? 0.25 : 0.5 }
  }

  func animateTransition(using context: UIViewControllerContextTransitioning) {
    MainActor.assumeIsolated { animator(for: context).startAnimation() }
  }

  func interruptibleAnimator(using context: UIViewControllerContextTransitioning) -> UIViewImplicitlyAnimating {
    MainActor.assumeIsolated { animator(for: context) }
  }

  func animationEnded(_: Bool) {
    MainActor.assumeIsolated { running = nil }
  }

  @MainActor
  private func animator(for context: UIViewControllerContextTransitioning) -> UIViewPropertyAnimator {
    if let running { return running }
    let animator = UIViewPropertyAnimator(duration: transitionDuration(using: context), dampingRatio: 1)
    animator.isUserInteractionEnabled = true
    running = animator
    guard let fromController = context.viewController(forKey: .from),
          let toController = context.viewController(forKey: .to)
    else {
      animator.addCompletion { _ in context.completeTransition(false) }
      return animator
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
    let pushing = pushing
    animator.addAnimations {
      apply(end)
      if reduce {
        front.alpha = pushing ? 1 : 0
      } else {
        front.transform = CGAffineTransform(translationX: pushing ? 0 : width, y: 0)
      }
    }
    animator.addCompletion { _ in
      let cancelled = context.transitionWasCancelled
      follower?.stop()
      blur.removeFromSuperview()
      back.transform = .identity
      back.alpha = 1
      front.transform = .identity
      front.alpha = 1
      front.layer.shadowOpacity = 0
      if cancelled, pushing { front.removeFromSuperview() }
      context.completeTransition(!cancelled)
    }
    return animator
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
