import Foundation

final class OnboardingFlags: @unchecked Sendable {
  static let shared: OnboardingFlags = {
    guard FixtureMode.isOn else { return OnboardingFlags(defaults: .standard) }
    let suite = "afilmory.fixture.onboarding"
    let defaults = UserDefaults(suiteName: suite) ?? .standard
    defaults.removePersistentDomain(forName: suite)
    let flags = OnboardingFlags(defaults: defaults)
    flags.introSeen = !UserDefaults.standard.bool(forKey: "fixture.intro")
    return flags
  }()

  private enum Key {
    static let introSeen = "onboarding.introSeen"
    static let pending = "onboarding.pending"
  }

  private let defaults: UserDefaults

  init(defaults: UserDefaults) {
    self.defaults = defaults
  }

  var introSeen: Bool {
    get { defaults.bool(forKey: Key.introSeen) }
    set { defaults.set(newValue, forKey: Key.introSeen) }
  }

  var onboardingPending: Bool {
    get { defaults.bool(forKey: Key.pending) }
    set { defaults.set(newValue, forKey: Key.pending) }
  }

  func note(_ presentation: AfilmoryRootPresentation) {
    switch presentation {
    case .authenticatedTabs, .workspaceSetup:
      if !introSeen { introSeen = true }
    case .loading, .visitor:
      break
    }
  }
}
