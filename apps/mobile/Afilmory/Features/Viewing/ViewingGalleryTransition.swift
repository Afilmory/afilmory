import UIKit

@MainActor
final class ViewingGalleryTransition: NSObject, UINavigationControllerDelegate {
  func navigationController(
    _: UINavigationController,
    animationControllerFor operation: UINavigationController.Operation,
    from fromVC: UIViewController,
    to toVC: UIViewController
  ) -> UIViewControllerAnimatedTransitioning? {
    guard operation == .push, fromVC is ViewingController, toVC is ExhibitionController else { return nil }
    return ViewingGalleryPushAnimator()
  }

  static func recede(_ view: UIView) {
    guard !AFMotion.reduceMotion else {
      UIView.animate(withDuration: 0.2, delay: 0, options: [.allowUserInteraction]) { view.alpha = 0.45 }
      return
    }
    AFMotion.defocus(view, amount: 1)
    AFMotion.spring(duration: 0.55, animations: {
      view.transform = CGAffineTransform(scaleX: 0.95, y: 0.95)
      view.alpha = 0.4
    })
  }

  static func restore(_ view: UIView, animated: Bool) {
    AFMotion.refocus(view, animated: animated)
  }
}

final class ViewingGalleryPushAnimator: NSObject, UIViewControllerAnimatedTransitioning {
  func transitionDuration(using _: UIViewControllerContextTransitioning?) -> TimeInterval {
    MainActor.assumeIsolated { AFMotion.reduceMotion ? 0.22 : 0.62 }
  }

  func animateTransition(using context: UIViewControllerContextTransitioning) {
    MainActor.assumeIsolated {
      guard let toView = context.view(forKey: .to), let toController = context.viewController(forKey: .to) else {
        context.completeTransition(!context.transitionWasCancelled)
        return
      }
      let fromView = context.view(forKey: .from)
      toView.frame = context.finalFrame(for: toController)
      context.containerView.addSubview(toView)
      if let fromView { ViewingGalleryTransition.recede(fromView) }
      AFMotion.rackIn(toView)
      DispatchQueue.main.asyncAfter(deadline: .now() + transitionDuration(using: context)) {
        context.completeTransition(!context.transitionWasCancelled)
      }
    }
  }
}
