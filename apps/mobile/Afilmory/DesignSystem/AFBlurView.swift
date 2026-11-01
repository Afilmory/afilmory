import UIKit

class AFBlurView: UIView {
  static let maximumRadius: CGFloat = 30
  static var reduceTransparencyOverride: Bool?

  static var reduceTransparency: Bool {
    reduceTransparencyOverride ?? UIAccessibility.isReduceTransparencyEnabled
  }

  private let effectView = UIVisualEffectView(effect: nil)
  private var animator: UIViewPropertyAnimator?
  private var storedRadius: CGFloat = 0
  private var animation: RadiusAnimation?

  var radius: CGFloat {
    get { storedRadius }
    set {
      cancelAnimation()
      apply(newValue)
    }
  }

  var isApplyingEffect: Bool {
    animator != nil
  }

  override init(frame: CGRect) {
    super.init(frame: frame)
    isUserInteractionEnabled = false
    effectView.frame = bounds
    effectView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    addSubview(effectView)
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  deinit {
    MainActor.assumeIsolated {
      animation?.link.invalidate()
      animator?.stopAnimation(true)
    }
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    if window == nil {
      cancelAnimation()
      tearDownAnimator()
    } else {
      applyRadius()
    }
  }

  func setRadius(_ target: CGFloat, duration: TimeInterval, delay: TimeInterval = 0, completion: (() -> Void)? = nil) {
    animateRadius(through: [(target, duration)], delay: delay, completion: completion)
  }

  func animateRadius(
    through keyframes: [(radius: CGFloat, duration: TimeInterval)],
    delay: TimeInterval = 0,
    sample: ((CGFloat) -> Void)? = nil,
    completion: (() -> Void)? = nil
  ) {
    cancelAnimation()
    guard let last = keyframes.last else {
      completion?()
      return
    }
    let total = delay + keyframes.reduce(0) { $0 + max(0, $1.duration) }
    guard total > 0, window != nil else {
      apply(last.radius)
      sample?(storedRadius)
      completion?()
      return
    }
    let link = CADisplayLink(target: DisplayLinkProxy(self), selector: #selector(DisplayLinkProxy.tick(_:)))
    animation = RadiusAnimation(
      link: link,
      start: CACurrentMediaTime(),
      origin: storedRadius,
      delay: delay,
      keyframes: keyframes,
      sample: sample,
      completion: completion
    )
    link.add(to: .main, forMode: .common)
  }

  fileprivate func step() {
    guard let animation else { return }
    let elapsed = CACurrentMediaTime() - animation.start
    let value = animation.value(at: elapsed)
    apply(value)
    animation.sample?(value)
    guard elapsed >= animation.totalDuration else { return }
    animation.link.invalidate()
    self.animation = nil
    animation.completion?()
  }

  private func cancelAnimation() {
    animation?.link.invalidate()
    animation = nil
  }

  private func apply(_ value: CGFloat) {
    storedRadius = min(Self.maximumRadius, max(0, value))
    applyRadius()
  }

  private func applyRadius() {
    guard storedRadius > 0.05, window != nil, !Self.reduceTransparency else {
      if storedRadius <= 0.05 || Self.reduceTransparency {
        tearDownAnimator()
      }
      return
    }
    if animator == nil {
      effectView.effect = nil
      let animator = UIViewPropertyAnimator(duration: 1, curve: .linear) { [effectView] in
        effectView.effect = UIBlurEffect(style: .dark)
      }
      animator.pausesOnCompletion = true
      animator.pauseAnimation()
      self.animator = animator
    }
    animator?.fractionComplete = storedRadius / Self.maximumRadius
  }

  private func tearDownAnimator() {
    animator?.stopAnimation(true)
    animator = nil
    effectView.effect = nil
  }
}

private struct RadiusAnimation {
  let link: CADisplayLink
  let start: CFTimeInterval
  let origin: CGFloat
  let delay: TimeInterval
  let keyframes: [(radius: CGFloat, duration: TimeInterval)]
  let sample: ((CGFloat) -> Void)?
  let completion: (() -> Void)?

  var totalDuration: TimeInterval {
    delay + keyframes.reduce(0) { $0 + max(0, $1.duration) }
  }

  func value(at elapsed: TimeInterval) -> CGFloat {
    var cursor = delay
    var from = origin
    guard elapsed > delay else { return origin }
    for keyframe in keyframes {
      let duration = max(0, keyframe.duration)
      if elapsed < cursor + duration, duration > 0 {
        let progress = (elapsed - cursor) / duration
        let eased = 1 - pow(1 - progress, 3)
        return from + (keyframe.radius - from) * CGFloat(eased)
      }
      cursor += duration
      from = keyframe.radius
    }
    return keyframes.last?.radius ?? origin
  }
}

private final class DisplayLinkProxy: NSObject {
  weak var view: AFBlurView?

  init(_ view: AFBlurView) {
    self.view = view
  }

  @MainActor @objc func tick(_ link: CADisplayLink) {
    guard let view else {
      link.invalidate()
      return
    }
    view.step()
  }
}
