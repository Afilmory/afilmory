import UIKit

enum PhotoPinchDismissalPolicy {
  static let zoomTolerance: CGFloat = 0.01

  static func canBeginGesture(
    startZoomScale: CGFloat,
    minimumZoomScale: CGFloat
  ) -> Bool {
    startZoomScale <= minimumZoomScale + zoomTolerance
  }
}

final class PhotoTransitionInteraction: UIPercentDrivenInteractiveTransition,
  UIGestureRecognizerDelegate
{
  private enum ActiveInput {
    case pan
    case pinch
  }

  private weak var viewController: PhotoDetailViewController?
  private weak var detailView: PhotoDetailView?
  private weak var sourceView: UIView?
  private(set) var isInteracting = false
  private(set) var translation = CGPoint.zero
  private(set) var velocity = CGPoint.zero
  private var gestureGeneration = 0
  private var activeInput: ActiveInput?
  private var pinchCanStart = false
  private var pinchStartZoomScale: CGFloat = 1
  private var pinchAnchor = CGPoint.zero
  private var pinchScale: CGFloat = 1
  private var pinchVelocity: CGFloat = 0
  private var lastPinchLocation = CGPoint.zero
  private var lastPinchTimestamp: TimeInterval = 0

  private lazy var panGestureRecognizer: UIPanGestureRecognizer = {
    let recognizer = UIPanGestureRecognizer(target: self, action: #selector(handlePan(_:)))
    recognizer.delegate = self
    recognizer.maximumNumberOfTouches = 1
    return recognizer
  }()

  private lazy var pinchGestureRecognizer: UIPinchGestureRecognizer = {
    let recognizer = UIPinchGestureRecognizer(target: self, action: #selector(handlePinch(_:)))
    recognizer.cancelsTouchesInView = false
    recognizer.delegate = self
    return recognizer
  }()

  override init() {
    super.init()
    completionCurve = .easeOut
    wantsInteractiveStart = false
  }

  func attach(to viewController: PhotoDetailViewController, detailView: PhotoDetailView) {
    self.viewController = viewController
    self.detailView = detailView
    detailView.addGestureRecognizer(panGestureRecognizer)
    detailView.addGestureRecognizer(pinchGestureRecognizer)
    detailView.configureExternalDismissGesture(panGestureRecognizer)
  }

  @objc private func handlePan(_ gesture: UIPanGestureRecognizer) {
    guard let detailView else { return }
    translation = gesture.translation(in: detailView)
    velocity = gesture.velocity(in: detailView)

    switch gesture.state {
    case .began:
      _ = beginInteraction(input: .pan, detailView: detailView)
    case .changed:
      guard activeInput == .pan else { return }
      update(detailView.updateViewControllerDismissal(translation: translation))
    case .ended:
      guard activeInput == .pan else { return }
      let progress = detailView.updateViewControllerDismissal(translation: translation)
      update(progress)
      let commits = PhotoTransitionGeometry.shouldCommitDragDismissal(
        progress: progress,
        translationY: translation.y,
        velocityY: velocity.y
      )
      finishInteraction(commits: commits, detailView: detailView, velocity: velocity)
    case .cancelled, .failed:
      guard activeInput == .pan else { return }
      finishInteraction(commits: false, detailView: detailView, velocity: velocity)
    default:
      break
    }
  }

  @objc private func handlePinch(_ gesture: UIPinchGestureRecognizer) {
    guard let detailView else { return }
    let location = gesture.location(in: detailView)

    switch gesture.state {
    case .began:
      pinchCanStart = detailView.canBeginViewerPinchDismissal()
      pinchStartZoomScale = max(detailView.currentViewerZoomScale(), 1)
      pinchAnchor = location
      pinchScale = 1
      pinchVelocity = 0
      lastPinchLocation = location
      lastPinchTimestamp = ProcessInfo.processInfo.systemUptime
    case .changed:
      updatePinchCentroidVelocity(location: location)
      guard pinchCanStart || activeInput == .pinch else { return }
      let effectiveScale = pinchStartZoomScale * gesture.scale
      if activeInput != .pinch {
        guard !isInteracting, effectiveScale < 0.995, gesture.velocity < 0 else { return }
        detailView.beginViewerPinchDismissal()
        pinchAnchor = location
        guard beginInteraction(input: .pinch, detailView: detailView) else {
          detailView.endViewerPinchDismissal()
          resetPinchTracking()
          return
        }
      }
      guard activeInput == .pinch else { return }
      detailView.maintainViewerPinchDismissal()
      applyPinch(
        effectiveScale: effectiveScale,
        location: location,
        gestureVelocity: gesture.velocity,
        detailView: detailView
      )
    case .ended:
      guard activeInput == .pinch else {
        resetPinchTracking()
        return
      }
      let effectiveScale = pinchStartZoomScale * gesture.scale
      let progress = applyPinch(
        effectiveScale: effectiveScale,
        location: location,
        gestureVelocity: gesture.velocity,
        detailView: detailView
      )
      detailView.endViewerPinchDismissal()
      let commits = PhotoTransitionGeometry.shouldCommitPinchDismissal(
        progress: progress,
        scale: pinchScale,
        velocity: pinchVelocity
      )
      finishInteraction(commits: commits, detailView: detailView, velocity: velocity)
      resetPinchTracking()
    case .cancelled, .failed:
      if activeInput == .pinch {
        detailView.endViewerPinchDismissal()
        finishInteraction(commits: false, detailView: detailView, velocity: velocity)
      }
      resetPinchTracking()
    default:
      break
    }
  }

  private func beginInteraction(
    input: ActiveInput,
    detailView: PhotoDetailView
  ) -> Bool {
    guard !isInteracting else { return false }
    gestureGeneration += 1
    viewController?.prepareForInteractiveDismissal()
    activeInput = input
    isInteracting = true
    wantsInteractiveStart = true
    completionSpeed = 1
    sourceView = viewController?.transitionSourceView()
    sourceView?.isHidden = true
    detailView.beginViewControllerDismissal()
    viewController?.dismiss(animated: true)
    return true
  }

  @discardableResult
  private func applyPinch(
    effectiveScale: CGFloat,
    location: CGPoint,
    gestureVelocity: CGFloat,
    detailView: PhotoDetailView
  ) -> CGFloat {
    let state = PhotoTransitionGeometry.dismissalPinchState(
      scale: effectiveScale,
      anchor: pinchAnchor,
      location: location,
      viewportCenter: CGPoint(x: detailView.bounds.midX, y: detailView.bounds.midY)
    )
    translation = state.transform.translation
    pinchScale = state.transform.scale
    pinchVelocity = gestureVelocity
    let progress = detailView.updateViewControllerDismissal(state: state)
    update(progress)
    return progress
  }

  private func updatePinchCentroidVelocity(location: CGPoint) {
    let now = ProcessInfo.processInfo.systemUptime
    let elapsed = now - lastPinchTimestamp
    if elapsed > 0.001 {
      velocity = CGPoint(
        x: (location.x - lastPinchLocation.x) / elapsed,
        y: (location.y - lastPinchLocation.y) / elapsed
      )
    }
    lastPinchLocation = location
    lastPinchTimestamp = now
  }

  private func finishInteraction(
    commits: Bool,
    detailView: PhotoDetailView,
    velocity: CGPoint
  ) {
    isInteracting = false
    wantsInteractiveStart = false
    activeInput = nil
    if commits {
      viewController?.flushPendingSocialActions()
      commitDismissal(detailView: detailView, velocity: velocity)
    } else {
      cancelDismissal(detailView: detailView, velocity: velocity)
    }
  }

  private func resetPinchTracking() {
    pinchCanStart = false
    pinchStartZoomScale = 1
    pinchAnchor = .zero
    pinchScale = 1
    pinchVelocity = 0
    lastPinchLocation = .zero
    lastPinchTimestamp = 0
  }

  private func commitDismissal(detailView: PhotoDetailView, velocity: CGPoint) {
    let source = sourceView
    let target = source.flatMap {
      detailView.transitionGeometry(targetRect: $0.convert($0.bounds, to: detailView))
    }
    detailView.commitViewControllerDismissal(target: target, velocity: velocity) { [weak self] in
      source?.isHidden = false
      guard let self else { return }
      completionSpeed = 1_000
      finish()
      if sourceView === source {
        sourceView = nil
      }
    }
  }

  private func cancelDismissal(detailView: PhotoDetailView, velocity: CGPoint) {
    let generation = gestureGeneration
    let source = sourceView
    detailView.cancelViewControllerDismissal(velocity: velocity) { [weak self] in
      guard let self, gestureGeneration == generation else { return }
      source?.isHidden = false
      if sourceView === source {
        sourceView = nil
      }
    }
    completionSpeed = 1_000
    cancel()
    translation = .zero
    self.velocity = .zero
  }

  func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
    guard let detailView else { return false }
    if gestureRecognizer === pinchGestureRecognizer {
      return detailView.canBeginViewerPinchDismissal()
    }
    guard detailView.canBeginViewControllerDismissal() else { return false }
    guard gestureRecognizer === panGestureRecognizer else { return false }
    let translation = panGestureRecognizer.translation(in: detailView)
    let velocity = panGestureRecognizer.velocity(in: detailView)
    let direction = abs(translation.x) + abs(translation.y) > 0.5 ? translation : velocity
    guard abs(direction.y) > abs(direction.x) * 1.12 else { return false }
    return direction.y > 0
  }

  func gestureRecognizer(
    _ gestureRecognizer: UIGestureRecognizer,
    shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer
  ) -> Bool {
    guard gestureRecognizer === pinchGestureRecognizer
      || otherGestureRecognizer === pinchGestureRecognizer
    else {
      return false
    }
    let companion = gestureRecognizer === pinchGestureRecognizer
      ? otherGestureRecognizer
      : gestureRecognizer
    return companion is UIPinchGestureRecognizer
  }
}
