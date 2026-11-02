import UIKit

enum LaunchRoute: Equatable {
  case loading
  case intro
  case visitor
  case setup
  case tabs(postSetup: Bool)

  static func resolve(
    _ presentation: AfilmoryRootPresentation,
    flags: OnboardingFlags,
    hasPendingDeepLink: Bool = false
  ) -> LaunchRoute {
    switch presentation {
    case .loading:
      .loading
    case .visitor:
      flags.introSeen || hasPendingDeepLink ? .visitor : .intro
    case .workspaceSetup:
      .setup
    case .authenticatedTabs:
      .tabs(postSetup: flags.onboardingPending)
    }
  }
}

@MainActor
enum DeepLinkGate {
  enum Decision: Equatable {
    case apply
    case hold
    case reroute
  }

  static func decide(root: UIViewController?, presented: UIViewController?) -> Decision {
    if root is IntroController { return .reroute }
    if presented is PostSetupController { return .hold }
    return .apply
  }
}
