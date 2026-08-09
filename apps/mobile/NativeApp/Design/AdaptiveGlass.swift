import UIKit

@MainActor
enum AdaptiveGlass {
  static func effect(
    interactive: Bool = false,
    fallbackStyle: UIBlurEffect.Style = .systemThinMaterial
  ) -> UIVisualEffect {
    if #available(iOS 26.0, *) {
      let effect = UIGlassEffect(style: .regular)
      effect.isInteractive = interactive
      return effect
    }
    return UIBlurEffect(style: fallbackStyle)
  }

  static func buttonConfiguration(prominent: Bool = false) -> UIButton.Configuration {
    if #available(iOS 26.0, *) {
      return prominent ? .prominentGlass() : .glass()
    }
    return prominent ? .filled() : .gray()
  }
}
