import UIKit

final class ProjectionController: UIViewController {
  private let photos: [GalleryPhoto]
  private let numbers: [String: Int]
  private var timeline: ProjectionTimeline
  private let revealCenter: CGPoint
  private let chrome = ProjectionChromeView()
  private let stage = UIView()
  private var current = UIImageView()
  private var displayLink: CADisplayLink?
  private let reveal = CAShapeLayer()

  init(photos: [GalleryPhoto], startIndex: Int, numbers: [String: Int], revealCenter: CGPoint) {
    self.photos = photos
    self.numbers = numbers
    self.revealCenter = revealCenter
    timeline = ProjectionTimeline(count: photos.count, startIndex: startIndex, now: CACurrentMediaTime())
    super.init(nibName: nil, bundle: nil)
    modalPresentationStyle = .overFullScreen
    modalPresentationCapturesStatusBarAppearance = true
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  override var prefersStatusBarHidden: Bool { true }
  override var prefersHomeIndicatorAutoHidden: Bool { true }

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .black
    view.accessibilityViewIsModal = true
    stage.clipsToBounds = false
    view.addSubview(stage)
    chrome.frame = view.bounds
    chrome.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    chrome.onClose = { [weak self] in self?.close() }
    chrome.onStep = { [weak self] delta in self?.step(delta) }
    view.addSubview(chrome)
    let swipeLeft = UISwipeGestureRecognizer(target: self, action: #selector(swiped(_:)))
    swipeLeft.direction = .left
    let swipeRight = UISwipeGestureRecognizer(target: self, action: #selector(swiped(_:)))
    swipeRight.direction = .right
    [swipeLeft, swipeRight].forEach(view.addGestureRecognizer)
    current.contentMode = .scaleAspectFit
    stage.addSubview(current)
    show(index: timeline.index, animated: false)
  }

  override func viewDidLayoutSubviews() {
    super.viewDidLayoutSubviews()
    let safe = view.safeAreaInsets
    let top = max(safe.top, 20) + 54
    let bottomReserve: CGFloat = 200 + max(safe.bottom, 12)
    stage.frame = CGRect(x: 20, y: top, width: view.bounds.width - 40, height: max(200, view.bounds.height - top - bottomReserve))
    stage.subviews.forEach { $0.frame = stage.bounds }
    chrome.stageBottom = stage.frame.maxY
  }

  override func viewWillAppear(_ animated: Bool) {
    super.viewWillAppear(animated)
    guard !AFMotion.reduceMotion else {
      view.alpha = 0
      return
    }
    reveal.path = UIBezierPath(arcCenter: revealCenter, radius: 1, startAngle: 0, endAngle: .pi * 2, clockwise: true).cgPath
    view.layer.mask = reveal
  }

  override func viewDidAppear(_ animated: Bool) {
    super.viewDidAppear(animated)
    AppNavigator.shared.setTabBarHidden(true, animated: false)
    playReveal(opening: true, completion: nil)
    timeline.step(0, at: CACurrentMediaTime())
    let link = CADisplayLink(target: self, selector: #selector(tick))
    link.add(to: .main, forMode: .common)
    displayLink = link
    UIAccessibility.post(notification: .screenChanged, argument: chrome)
  }

  override func viewWillDisappear(_ animated: Bool) {
    super.viewWillDisappear(animated)
    displayLink?.invalidate()
    displayLink = nil
  }

  override func accessibilityPerformEscape() -> Bool {
    close()
    return true
  }

  @objc private func tick() {
    let now = CACurrentMediaTime()
    if timeline.tick(at: now) {
      show(index: timeline.index, animated: true)
    }
    chrome.setProgress(timeline.progress(at: now))
  }

  @objc private func swiped(_ gesture: UISwipeGestureRecognizer) {
    step(gesture.direction == .left ? 1 : -1)
  }

  private func step(_ delta: Int) {
    timeline.step(delta, at: CACurrentMediaTime())
    show(index: timeline.index, animated: true)
  }

  private func show(index: Int, animated: Bool) {
    guard photos.indices.contains(index) else { return }
    let photo = photos[index]
    let incoming = UIImageView(frame: stage.bounds)
    incoming.contentMode = .scaleAspectFit
    incoming.afSetPhoto(photo, original: true)
    incoming.isAccessibilityElement = true
    incoming.accessibilityLabel = String(localized: "No. \(ExhibitFormat.frameNumber(numbers[photo.id] ?? index + 1))")
    stage.addSubview(incoming)
    let outgoing = current
    current = incoming
    if animated {
      AFMotion.rackIn(incoming)
      AFMotion.defocus(outgoing, amount: 1)
      UIView.animate(withDuration: AFMotion.reduceMotion ? 0.2 : 0.7, delay: 0, options: [.allowUserInteraction]) {
        outgoing.alpha = 0
      } completion: { _ in outgoing.removeFromSuperview() }
    } else {
      outgoing.removeFromSuperview()
    }
    let accent = AccentStore.shared.cachedAccent(photoId: photo.id) ?? AFColor.accentFallback
    chrome.configure(photo: photo, number: numbers[photo.id] ?? index + 1, total: photos.count, accent: accent, animated: animated)
    AccentStore.shared.accent(photoId: photo.id, thumbnailURL: URL(string: photo.thumbnailUrl)) { [weak self] color in
      guard let self, self.photos.indices.contains(self.timeline.index), self.photos[self.timeline.index].id == photo.id else { return }
      self.chrome.setAccent(color)
    }
  }

  private func close() {
    displayLink?.invalidate()
    displayLink = nil
    playReveal(opening: false) { [weak self] in
      AppNavigator.shared.setTabBarHidden(false)
      self?.dismiss(animated: false)
    }
  }

  private func playReveal(opening: Bool, completion: (() -> Void)?) {
    let radius = hypot(max(revealCenter.x, view.bounds.width - revealCenter.x), max(revealCenter.y, view.bounds.height - revealCenter.y)) + 20
    let small = UIBezierPath(arcCenter: revealCenter, radius: 1, startAngle: 0, endAngle: .pi * 2, clockwise: true).cgPath
    let large = UIBezierPath(arcCenter: revealCenter, radius: radius, startAngle: 0, endAngle: .pi * 2, clockwise: true).cgPath
    guard !AFMotion.reduceMotion else {
      view.alpha = opening ? 0 : 1
      UIView.animate(withDuration: 0.2, animations: { self.view.alpha = opening ? 1 : 0 }, completion: { _ in completion?() })
      return
    }
    reveal.path = opening ? large : small
    view.layer.mask = reveal
    CATransaction.begin()
    CATransaction.setCompletionBlock {
      if opening { self.view.layer.mask = nil }
      completion?()
    }
    let animation = CABasicAnimation(keyPath: "path")
    animation.fromValue = opening ? small : large
    animation.toValue = opening ? large : small
    animation.duration = 0.72
    animation.timingFunction = CAMediaTimingFunction(controlPoints: 0.65, 0, 0.35, 1)
    reveal.add(animation, forKey: "reveal")
    CATransaction.commit()
  }
}
