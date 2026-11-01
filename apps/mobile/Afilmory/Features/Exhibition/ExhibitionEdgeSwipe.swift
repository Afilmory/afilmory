import UIKit

@MainActor
final class ExhibitionEdgeSwipe: NSObject, UIGestureRecognizerDelegate {
  private weak var navigation: UINavigationController?
  private var saved: [(gesture: UIGestureRecognizer, delegate: UIGestureRecognizerDelegate?, enabled: Bool)] = []

  func attach(to navigation: UINavigationController?) {
    guard let navigation, self.navigation == nil else { return }
    self.navigation = navigation
    for gesture in Self.popGestures(of: navigation) where gesture.delegate !== self {
      saved.append((gesture, gesture.delegate, gesture.isEnabled))
      gesture.delegate = self
      gesture.isEnabled = true
    }
  }

  deinit {
    MainActor.assumeIsolated { restore() }
  }

  func detach() {
    restore()
    navigation = nil
  }

  private func restore() {
    for entry in saved where entry.gesture.delegate === self || entry.gesture.delegate == nil {
      entry.gesture.delegate = entry.delegate
      entry.gesture.isEnabled = entry.enabled
    }
    saved.removeAll()
  }

  func gestureRecognizerShouldBegin(_ gesture: UIGestureRecognizer) -> Bool {
    guard let navigation, navigation.viewControllers.count > 1,
          navigation.transitionCoordinator == nil, navigation.presentedViewController == nil
    else { return false }
    guard !(gesture is UIScreenEdgePanGestureRecognizer), let pan = gesture as? UIPanGestureRecognizer else { return true }
    guard BackSwipeRule.isBackDrag(velocity: pan.velocity(in: navigation.view)) else { return false }
    return !BackSwipeRule.isBlocked(at: pan.location(in: navigation.view), in: navigation.view)
  }

  func gestureRecognizer(_ gesture: UIGestureRecognizer, shouldBeRequiredToFailBy other: UIGestureRecognizer) -> Bool {
    gesture is UIScreenEdgePanGestureRecognizer && other is UIPanGestureRecognizer && !(other is UIScreenEdgePanGestureRecognizer)
  }

  private static func popGestures(of navigation: UINavigationController) -> [UIGestureRecognizer] {
    [navigation.interactivePopGestureRecognizer, navigation.interactiveContentPopGestureRecognizer].compactMap { $0 }
  }
}
