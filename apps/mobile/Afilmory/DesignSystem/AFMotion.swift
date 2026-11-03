import UIKit

struct AFDevelopState: Equatable, Sendable {
  let invert: CGFloat
  let grayscale: CGFloat
  let blur: CGFloat
}

@MainActor
enum AFMotion {
  enum Primitive: CaseIterable, Sendable {
    case rackIn
    case defocus
    case refocus
    case afLock
    case exposure
  }

  struct Plan: Equatable, Sendable {
    var fromBlur: CGFloat
    var toBlur: CGFloat
    var fromScale: CGFloat
    var toScale: CGFloat
    var fromAlpha: CGFloat
    var toAlpha: CGFloat
    var duration: TimeInterval
    var crossfadeOnly: Bool
  }

  static var reduceMotionOverride: Bool?

  static var reduceMotion: Bool {
    reduceMotionOverride ?? UIAccessibility.isReduceMotionEnabled
  }

  static func plan(_ primitive: Primitive) -> Plan {
    if reduceMotion {
      let fadesIn = primitive != .defocus
      return Plan(
        fromBlur: 0, toBlur: 0, fromScale: 1, toScale: 1,
        fromAlpha: fadesIn ? 0 : 1, toAlpha: fadesIn ? 1 : 0.5,
        duration: primitive == .afLock ? 0 : 0.2, crossfadeOnly: true
      )
    }
    switch primitive {
    case .rackIn:
      return Plan(fromBlur: 24, toBlur: 0, fromScale: 1.06, toScale: 1, fromAlpha: 0, toAlpha: 1, duration: 0.7, crossfadeOnly: false)
    case .defocus:
      return Plan(fromBlur: 0, toBlur: 10, fromScale: 1, toScale: 0.97, fromAlpha: 1, toAlpha: 0.45, duration: 0.45, crossfadeOnly: false)
    case .refocus:
      return Plan(fromBlur: 10, toBlur: 0, fromScale: 0.97, toScale: 1, fromAlpha: 0.45, toAlpha: 1, duration: 0.5, crossfadeOnly: false)
    case .afLock:
      return Plan(fromBlur: 7, toBlur: 0, fromScale: 0.98, toScale: 1, fromAlpha: 1, toAlpha: 1, duration: 0.55, crossfadeOnly: false)
    case .exposure:
      return Plan(fromBlur: 14, toBlur: 0, fromScale: 1.04, toScale: 1, fromAlpha: 1, toAlpha: 1, duration: 1.5, crossfadeOnly: false)
    }
  }

  nonisolated static func developState(progress: Double) -> AFDevelopState {
    let remaining = CGFloat(1 - min(1, max(0, progress)))
    return AFDevelopState(invert: remaining, grayscale: 0.7 * remaining, blur: 3 * remaining)
  }

  static func spring(
    duration: TimeInterval,
    delay: TimeInterval = 0,
    damping: CGFloat = 0.86,
    animations: @escaping () -> Void,
    completion: ((Bool) -> Void)? = nil
  ) {
    UIView.animate(
      withDuration: duration,
      delay: delay,
      usingSpringWithDamping: damping,
      initialSpringVelocity: 0,
      options: [.allowUserInteraction, .beginFromCurrentState],
      animations: animations,
      completion: completion
    )
  }

  static func rackIn(_ view: UIView, delay: TimeInterval = 0, completion: (() -> Void)? = nil) {
    let plan = plan(.rackIn)
    view.alpha = plan.fromAlpha
    view.transform = CGAffineTransform(scaleX: plan.fromScale, y: plan.fromScale)
    let blur = plan.crossfadeOnly ? nil : attachTransientBlur(to: view, radius: plan.fromBlur)
    spring(duration: plan.duration, delay: delay, animations: {
      view.alpha = plan.toAlpha
      view.transform = .identity
    }, completion: { _ in completion?() })
    animateBlur(blur, to: plan.toBlur, duration: plan.duration * 0.8, delay: delay, removeWhenSharp: true)
  }

  static func defocus(_ view: UIView, amount: CGFloat = 1, animated: Bool = true) {
    let plan = plan(.defocus)
    let clamped = min(1, max(0, amount))
    let scale = 1 - (1 - plan.toScale) * clamped
    let alpha = 1 - (1 - plan.toAlpha) * clamped
    let changes = {
      view.transform = plan.crossfadeOnly ? .identity : CGAffineTransform(scaleX: scale, y: scale)
      view.alpha = alpha
    }
    animated ? spring(duration: plan.duration, animations: changes) : changes()
    guard !plan.crossfadeOnly else { return }
    let blur = persistentBlur(on: view)
    animateBlur(blur, to: plan.toBlur * clamped, duration: animated ? plan.duration : 0, delay: 0, removeWhenSharp: false)
  }

  static func refocus(_ view: UIView, animated: Bool = true) {
    let plan = plan(.refocus)
    let changes = {
      view.transform = .identity
      view.alpha = 1
    }
    animated ? spring(duration: plan.duration, animations: changes) : changes()
    if let blur = view.subviews.compactMap({ $0 as? PersistentBlur }).first {
      animateBlur(blur, to: 0, duration: animated ? plan.duration : 0, delay: 0, removeWhenSharp: true)
    }
  }

  static func refocusAlongsideTransition(_ view: UIView) {
    view.transform = .identity
    view.alpha = 1
    view.subviews.compactMap { $0 as? PersistentBlur }.forEach { $0.alpha = 0 }
  }

  static func afLock(label: UIView, dot: UIView? = nil, haptic: Bool = true) {
    let plan = plan(.afLock)
    let lock = {
      dot?.transform = .identity
      dot?.alpha = 1
      if haptic { UIImpactFeedbackGenerator(style: .light).impactOccurred() }
    }
    guard !plan.crossfadeOnly else {
      label.alpha = 1
      lock()
      return
    }
    let blur = attachTransientBlur(to: label, radius: plan.fromBlur)
    label.transform = CGAffineTransform(scaleX: plan.fromScale, y: plan.fromScale)
    dot?.transform = CGAffineTransform(scaleX: 0.01, y: 0.01)
    blur?.animateRadius(
      through: [(0, plan.duration * 0.45), (1.6, plan.duration * 0.2), (0, plan.duration * 0.35)],
      completion: { blur?.removeFromSuperview() }
    )
    UIView.animateKeyframes(withDuration: plan.duration, delay: 0, options: [.allowUserInteraction, .calculationModeCubic]) {
      UIView.addKeyframe(withRelativeStartTime: 0, relativeDuration: 0.45) {
        label.transform = CGAffineTransform(scaleX: 1.01, y: 1.01)
      }
      UIView.addKeyframe(withRelativeStartTime: 0.65, relativeDuration: 0.35) {
        label.transform = .identity
      }
    }
    UIView.animate(withDuration: 0.16, delay: plan.duration * 0.62, options: [.allowUserInteraction]) {
      dot?.transform = CGAffineTransform(scaleX: 1.8, y: 1.8)
      dot?.alpha = 1
    } completion: { _ in
      spring(duration: 0.3, damping: 0.6, animations: { dot?.transform = .identity })
      if haptic { UIImpactFeedbackGenerator(style: .light).impactOccurred() }
    }
  }

  static func expose(_ view: UIView, completion: (() -> Void)? = nil) {
    let plan = plan(.exposure)
    guard !plan.crossfadeOnly else {
      view.alpha = 0
      UIView.animate(withDuration: plan.duration, animations: { view.alpha = 1 }, completion: { _ in completion?() })
      return
    }
    view.layoutIfNeeded()
    let bounds = view.bounds
    let centre = CGPoint(x: bounds.midX, y: bounds.midY)
    let endRadius = hypot(bounds.width, bounds.height) / 2 + 2
    let mask = CAShapeLayer()
    mask.frame = bounds
    mask.path = UIBezierPath(arcCenter: centre, radius: endRadius, startAngle: 0, endAngle: .pi * 2, clockwise: true).cgPath
    view.layer.mask = mask
    let iris = CABasicAnimation(keyPath: "path")
    iris.fromValue = UIBezierPath(arcCenter: centre, radius: 1, startAngle: 0, endAngle: .pi * 2, clockwise: true).cgPath
    iris.toValue = mask.path
    iris.duration = plan.duration * 0.42
    iris.timingFunction = CAMediaTimingFunction(controlPoints: 0.2, 0.8, 0.2, 1)
    mask.add(iris, forKey: "iris")

    let flare = UIView(frame: bounds)
    flare.backgroundColor = .white
    flare.alpha = 0.75
    flare.isUserInteractionEnabled = false
    flare.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    view.addSubview(flare)
    let blur = attachTransientBlur(to: view, radius: plan.fromBlur)
    view.transform = CGAffineTransform(scaleX: plan.fromScale, y: plan.fromScale)

    UIView.animate(withDuration: plan.duration * 0.55, delay: plan.duration * 0.1, options: [.allowUserInteraction, .curveEaseOut]) {
      flare.alpha = 0
    } completion: { _ in
      flare.removeFromSuperview()
    }
    spring(duration: plan.duration, animations: { view.transform = .identity })
    let total = plan.duration
    blur?.animateRadius(through: [(0.5, total * 0.6), (2.4, total * 0.15), (0, total * 0.25)])
    DispatchQueue.main.asyncAfter(deadline: .now() + total) {
      blur?.removeFromSuperview()
      view.layer.mask = nil
      completion?()
    }
  }

  private final class PersistentBlur: AFBlurView {}

  private static func attachTransientBlur(to view: UIView, radius: CGFloat) -> AFBlurView? {
    guard radius > 0 else { return nil }
    let blur = AFBlurView(frame: view.bounds)
    blur.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    view.addSubview(blur)
    blur.radius = radius
    return blur
  }

  private static func persistentBlur(on view: UIView) -> AFBlurView {
    if let existing = view.subviews.compactMap({ $0 as? PersistentBlur }).first {
      existing.alpha = 1
      view.bringSubviewToFront(existing)
      return existing
    }
    let blur = PersistentBlur(frame: view.bounds)
    blur.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    view.addSubview(blur)
    return blur
  }

  private static func animateBlur(_ blur: AFBlurView?, to radius: CGFloat, duration: TimeInterval, delay: TimeInterval, removeWhenSharp: Bool) {
    guard let blur else { return }
    blur.setRadius(radius, duration: duration, delay: delay) { [weak blur] in
      guard let blur, removeWhenSharp, blur.radius < 0.05 else { return }
      blur.removeFromSuperview()
    }
  }
}
