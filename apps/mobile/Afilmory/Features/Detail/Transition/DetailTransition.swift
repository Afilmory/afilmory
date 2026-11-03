import UIKit

final class DetailTransitionDelegate: NSObject, UIViewControllerTransitioningDelegate {
  func animationController(
    forPresented _: UIViewController,
    presenting _: UIViewController,
    source _: UIViewController
  ) -> UIViewControllerAnimatedTransitioning? {
    DetailTransitionAnimator(presenting: true)
  }

  func animationController(forDismissed _: UIViewController) -> UIViewControllerAnimatedTransitioning? {
    DetailTransitionAnimator(presenting: false)
  }
}

final class DetailTransitionAnimator: NSObject, UIViewControllerAnimatedTransitioning {
  private let presenting: Bool

  init(presenting: Bool) {
    self.presenting = presenting
  }

  func transitionDuration(using _: UIViewControllerContextTransitioning?) -> TimeInterval {
    MainActor.assumeIsolated { AFMotion.reduceMotion ? 0.25 : 0.56 }
  }

  func animateTransition(using context: UIViewControllerContextTransitioning) {
    MainActor.assumeIsolated {
      presenting ? present(context) : dismiss(context)
    }
  }

  @MainActor
  static func detail(in controller: UIViewController) -> PhotoDetailViewController? {
    controller as? PhotoDetailViewController
      ?? (controller as? UINavigationController)?.viewControllers.first as? PhotoDetailViewController
  }

  @MainActor
  private func present(_ context: UIViewControllerContextTransitioning) {
    guard let presented = context.viewController(forKey: .to), let detail = Self.detail(in: presented) else {
      context.completeTransition(false)
      return
    }
    let container = context.containerView
    let background = context.viewController(forKey: .from)?.view
    presented.view.frame = context.finalFrame(for: presented)
    container.addSubview(presented.view)
    presented.view.layoutIfNeeded()
    let source = detail.currentPhoto.flatMap { detail.sourceProvider($0.id) }
    let sourceImage = (source as? UIImageView)?.image
    detail.view.layoutIfNeeded()
    AppNavigator.shared.setTabBarHidden(true)
    let chrome: [UIView] = [detail.topChrome, detail.chips, detail.infoColumn]
    chrome.forEach { $0.alpha = 0 }
    detail.backdrop.alpha = 0
    detail.sheet.transform = CGAffineTransform(translationX: 0, y: 280)
    detail.chips.transform = detail.sheet.transform
    let target = DetailTransitionGeometry.imageFrame(detail: detail, in: container)
    let flyer = DetailTransitionGeometry.flyer(from: source, image: sourceImage, in: container)
    let reduce = AFMotion.reduceMotion
    if let flyer, !reduce {
      detail.photoLayer.isHidden = true
      container.addSubview(flyer)
      source?.alpha = 0
    } else {
      detail.photoLayer.alpha = 0
    }
    if let background, !reduce {
      AFMotion.defocus(background, amount: 1)
    }
    let duration = transitionDuration(using: context)
    AFMotion.spring(duration: duration, damping: 0.9, animations: {
      flyer?.frame = target
      flyer?.layer.cornerRadius = 0
      detail.backdrop.alpha = 1
      background?.transform = reduce ? .identity : CGAffineTransform(scaleX: 0.95, y: 0.95)
      if reduce || flyer == nil { detail.photoLayer.alpha = 1 }
    }, completion: { _ in
      detail.photoLayer.isHidden = false
      detail.photoLayer.alpha = 1
      flyer?.removeFromSuperview()
      source?.alpha = 1
      if let background {
        AFMotion.refocus(background, animated: false)
        background.transform = .identity
      }
      detail.isTransitioning = false
      context.completeTransition(!context.transitionWasCancelled)
    })
    AFMotion.spring(duration: reduce ? 0.25 : 0.6, delay: reduce ? 0 : 0.14, damping: 0.88, animations: {
      detail.sheet.transform = .identity
      detail.chips.transform = .identity
    })
    UIView.animate(withDuration: 0.32, delay: reduce ? 0 : 0.24, options: [.allowUserInteraction]) {
      chrome.forEach { $0.alpha = 1 }
    }
  }

  @MainActor
  private func dismiss(_ context: UIViewControllerContextTransitioning) {
    guard let presented = context.viewController(forKey: .from), let detail = Self.detail(in: presented) else {
      context.completeTransition(false)
      return
    }
    let container = context.containerView
    let background = context.viewController(forKey: .to)?.view
    let reduce = AFMotion.reduceMotion
    let source = detail.currentPhoto.flatMap { detail.sourceProvider($0.id) }
    let current = detail.currentCell?.imageView
    let start = current.map { $0.convert($0.bounds, to: container) } ?? DetailTransitionGeometry.imageFrame(detail: detail, in: container)
    let flyer = UIImageView(image: current?.image)
    flyer.contentMode = .scaleAspectFill
    flyer.clipsToBounds = true
    flyer.layer.cornerCurve = .continuous
    flyer.frame = start
    let end = source.map { $0.convert($0.bounds, to: container) }
    let endRadius = source.map(DetailTransitionGeometry.cornerRadius(of:)) ?? 0
    let refocuses = !reduce && detail.dismissTranslation == 0
    if !reduce {
      container.addSubview(flyer)
      detail.photoLayer.isHidden = true
      source?.alpha = 0
      if let background, refocuses {
        AFMotion.defocus(background, amount: 1, animated: false)
        background.transform = CGAffineTransform(scaleX: 0.95, y: 0.95)
      }
    }
    AppNavigator.shared.setTabBarHidden(false)
    let duration = transitionDuration(using: context)
    AFMotion.spring(duration: duration, damping: 0.92, animations: {
      if let end {
        flyer.frame = end
        flyer.layer.cornerRadius = endRadius
      } else {
        flyer.transform = CGAffineTransform(scaleX: 0.8, y: 0.8)
        flyer.alpha = 0
      }
      detail.backdrop.alpha = 0
      [detail.topChrome, detail.chips, detail.rail].forEach { $0.alpha = 0 }
      detail.sheet.alpha = 0
      detail.infoColumn.alpha = 0
      detail.commentsColumn?.alpha = 0
      detail.sheet.transform = CGAffineTransform(translationX: 0, y: 200)
      detail.chips.transform = detail.sheet.transform
      if reduce { detail.photoLayer.alpha = 0 }
      background?.transform = .identity
    }, completion: { _ in
      source?.alpha = 1
      flyer.removeFromSuperview()
      let cancelled = context.transitionWasCancelled
      if cancelled { detail.photoLayer.isHidden = false }
      context.completeTransition(!cancelled)
    })
    if let background, refocuses {
      AFMotion.refocus(background, animated: true)
    }
  }
}

@MainActor
enum DetailTransitionGeometry {
  static func imageFrame(detail: PhotoDetailViewController, in container: UIView) -> CGRect {
    guard let photo = detail.currentPhoto else { return detail.photoArea }
    let area = detail.photoArea
    let ratio = CGFloat(max(photo.aspectRatio, 0.01))
    var width = area.width
    var height = width / ratio
    if height > area.height {
      height = area.height
      width = height * ratio
    }
    let frame = CGRect(x: area.midX - width / 2, y: area.midY - height / 2, width: width, height: height)
    return detail.view.convert(frame, to: container)
  }

  static func flyer(from source: UIView?, image: UIImage?, in container: UIView) -> UIImageView? {
    guard let source, source.window != nil else { return nil }
    let flyer = UIImageView(image: image)
    flyer.contentMode = .scaleAspectFill
    flyer.clipsToBounds = true
    flyer.backgroundColor = AFColor.fill
    flyer.layer.cornerCurve = .continuous
    flyer.frame = source.convert(source.bounds, to: container)
    flyer.layer.cornerRadius = cornerRadius(of: source)
    return flyer
  }

  static func cornerRadius(of view: UIView) -> CGFloat {
    var current: UIView? = view
    var depth = 0
    while let candidate = current, depth < 3 {
      if candidate.layer.cornerRadius > 0, candidate.clipsToBounds || candidate.layer.masksToBounds {
        return candidate.layer.cornerRadius
      }
      current = candidate.superview
      depth += 1
    }
    return 0
  }
}
