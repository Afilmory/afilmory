#if DEBUG
  import UIKit

  @MainActor
  private final class CatalogPermissions: PostSetupPermissions {
    private let undecided: Bool

    init(undecided: Bool) {
      self.undecided = undecided
    }

    func isPhotosUndecided() async -> Bool { undecided }
    func isNotificationsUndecided() async -> Bool { undecided }
    func requestPhotos() async {}
    func requestNotifications() async {}
  }

  @MainActor
  enum OnboardingCatalog {
    private static var volatileFlags: OnboardingFlags {
      let suite = "afilmory.catalog.onboarding"
      let defaults = UserDefaults(suiteName: suite) ?? .standard
      defaults.removePersistentDomain(forName: suite)
      return OnboardingFlags(defaults: defaults)
    }

    static var entries: [CatalogEntry] {
      [
        screen("onboarding.intro", "Intro · Exhibition page", scenario: .visitor, settle: 4) {
          IntroController(mode: .firstLaunch, flags: volatileFlags) {}
        },
        screen("onboarding.intro-signin", "Intro · Sign-in page", scenario: .visitor, settle: 4) {
          let intro = IntroController(mode: .firstLaunch, flags: volatileFlags) {}
          intro.loadViewIfNeeded()
          intro.skip()
          return intro
        },
        screen("onboarding.signin", "Sign in · Standalone", scenario: .visitor) { SignInPageController() },
        screen("onboarding.setup", "Setup · Name your gallery", settle: 4) {
          WorkspaceSetupViewController(mode: .create)
        },
        screen("onboarding.setup-waiting", "Setup · Still being set up") {
          WorkspaceSetupViewController(mode: .waiting(name: "Innei's Afilmory", slug: "innei"))
        },
        screen("onboarding.permissions", "Post-setup · Permissions") {
          PostSetupController(permissions: CatalogPermissions(undecided: true)) { _ in }
        },
        screen("onboarding.first-roll", "Post-setup · First roll") {
          PostSetupController(permissions: CatalogPermissions(undecided: false)) { _ in }
        },
        screen("billing.subscription", "Subscription page", settle: 4) { SubscriptionPageController(focus: nil) },
        screen("billing.subscription-storage", "Subscription · storage focus", settle: 4) {
          SubscriptionPageController(focus: .storage(usedBytes: 960_000_000, incomingBytes: 80_000_000, capacityBytes: 1_000_000_000))
        },
        app("billing.quota-wall", "Quota wall sheet") {
          QuotaWallPresenter.present(reason: .libraryItems(current: 20, limit: 20))
        },
        app("auth.email-sheet", "Email sign-in sheet", scenario: .visitor) {
          EmailSignInPresenter.present(state: SignInState()) {}
        },
        screen("account.deletion", "Account deletion", settle: 4) {
          AccountDeletionController(session: AfilmorySessionStore.shared.current().state.session)
        },
      ]
    }

    private static func screen(
      _ id: String,
      _ title: String,
      scenario: FixtureScenario = .owner,
      settle: TimeInterval = 3,
      _ make: @escaping @MainActor () -> UIViewController
    ) -> CatalogEntry {
      CatalogEntry(id: id, group: "Onboarding", title: title, scenario: scenario, settle: settle, launch: .screen(make))
    }

    private static func app(
      _ id: String,
      _ title: String,
      scenario: FixtureScenario = .owner,
      settle: TimeInterval = 3,
      _ body: @escaping @MainActor () -> Void
    ) -> CatalogEntry {
      CatalogEntry(id: id, group: "Onboarding", title: title, scenario: scenario, settle: settle, launch: .app { _ in
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { body() }
      })
    }
  }
#endif
