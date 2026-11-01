import UIKit

@MainActor
enum AdaptiveGlass {
  static func effect(interactive: Bool = false) -> UIVisualEffect {
    let effect = UIGlassEffect(style: .regular)
    effect.isInteractive = interactive
    return effect
  }

  static func buttonConfiguration(prominent: Bool = false) -> UIButton.Configuration {
    prominent ? .prominentGlass() : .glass()
  }
}
