import ExpoModulesCore

public final class AfilmorySessionModule: Module {
  private var observation: AfilmorySessionObservationToken?

  public func definition() -> ModuleDefinition {
    Name("AfilmorySession")
    Events("onSessionChange")

    OnCreate {
      self.observation = AfilmorySessionStore.shared.observe { [weak self] state in
        DispatchQueue.main.async {
          self?.sendEvent("onSessionChange", Self.eventPayload(state))
        }
      }
      Task { @MainActor in
        AfilmorySessionStore.shared.bootstrap()
      }
      CacheLifecycleCoordinator.shared.runOnce()
    }

    OnDestroy {
      self.observation?.cancel()
      self.observation = nil
    }

    Function("registerSession") { (cookie: String) in
      AfilmorySessionStore.shared.register(cookie: cookie)
    }

    Function("setApiEnvironment") {
      (
        id: String,
        label: String,
        scheme: String,
        platformHost: String,
        baseDomain: String,
        port: Int?
      ) in
      try ApiEnvironmentStore.shared.set(
        ApiEnvironment(
          id: id,
          label: label,
          scheme: scheme,
          platformHost: platformHost,
          baseDomain: baseDomain,
          port: port
        )
      )
    }

    Function("getBuildConfiguration") {
      [
        "allowsApiEnvironmentOverride": AfilmoryBuildConfiguration.allowsApiEnvironmentOverride,
        "apiEnvironment": AfilmoryBuildConfiguration.defaultApiEnvironment.id,
        "appVariant": AfilmoryBuildConfiguration.variant.rawValue,
        "supportsAppleAuthentication": AfilmoryBuildConfiguration.supportsAppleAuthentication,
        "urlScheme": AfilmoryBuildConfiguration.urlScheme,
      ] as [String: Any]
    }

    Function("clearSession") {
      AfilmorySessionStore.shared.clearSession()
    }

    Function("hasStoredCookie") {
      AfilmorySessionStore.shared.hasStoredCookie()
    }

    Function("getSessionSnapshot") {
      Self.eventPayload(AfilmorySessionStore.shared.current().state)
    }

    Function("refreshSession") {
      AfilmorySessionStore.shared.refreshSession()
    }
  }

  private static func eventPayload(_ state: AfilmorySessionState) -> [String: Any] {
    var payload: [String: Any] = [
      "status": state.status,
      "session": state.session.flatMap(Self.serializedSession) ?? NSNull(),
    ]
    if case .failed(let message) = state {
      payload["error"] = message
    }
    return payload
  }

  private static func serializedSession(_ session: AfilmorySession) -> [String: Any]? {
    guard let data = try? JSONEncoder().encode(session) else { return nil }
    return (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
  }
}
