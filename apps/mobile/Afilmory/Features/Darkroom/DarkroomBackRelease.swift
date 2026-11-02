import UIKit

struct DarkroomBackRelease {
  static let response: CGFloat = 0.4
  static let angularFrequency = 2 * .pi / response
  static let stiffness = angularFrequency * angularFrequency
  static let damping = 2 * angularFrequency

  let finishes: Bool
  let initialVelocity: CGFloat

  init(progress: CGFloat, velocity: CGFloat, width: CGFloat) {
    let clamped = min(1, max(0, progress))
    finishes = velocity > 600 || (clamped > 0.35 && velocity > -600)
    let remaining = max(1, width) * (finishes ? 1 - clamped : clamped)
    let towardDestination = finishes ? velocity : -velocity
    initialVelocity = remaining < 1 ? 0 : min(Self.angularFrequency, max(0, towardDestination / remaining))
  }

  var timing: UISpringTimingParameters {
    UISpringTimingParameters(
      mass: 1, stiffness: Self.stiffness, damping: Self.damping,
      initialVelocity: CGVector(dx: initialVelocity, dy: initialVelocity)
    )
  }
}
