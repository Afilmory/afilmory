import Foundation
import Security
import UIKit

struct AfilmorySessionSnapshot: Sendable {
  let cookie: String?
  let platformBaseURL: String?
  let tenantBaseURL: String?
  let state: AfilmorySessionState
}

typealias AfilmorySessionObserver = @Sendable (AfilmorySessionState) -> Void

protocol SessionTransport: Sendable {
  func fetchSession() async throws -> AfilmorySessionResponse?
}

struct LiveSessionTransport: SessionTransport {
  func fetchSession() async throws -> AfilmorySessionResponse? {
    try await AfilmoryAPI.shared.request(APIEndpoint(baseURL: .platform, path: "auth/session"))
  }
}

protocol SessionCookieStorage: Sendable {
  func read() -> String?
  func write(_ cookie: String)
  func clear()
}

struct KeychainSessionCookieStorage: SessionCookieStorage {
  private static let service = "app.afilmory.session.cookie"
  private static let account = "authenticated-session"

  func read() -> String? {
    var query = Self.query
    query[kSecReturnData as String] = true
    query[kSecMatchLimit as String] = kSecMatchLimitOne

    var result: CFTypeRef?
    guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
          let data = result as? Data
    else { return nil }
    return String(data: data, encoding: .utf8)
  }

  func write(_ cookie: String) {
    SecItemDelete(Self.query as CFDictionary)

    var attributes = Self.query
    attributes[kSecValueData as String] = Data(cookie.utf8)
    // Background upload retries can be recreated while the device is locked.
    attributes[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
    let status = SecItemAdd(attributes as CFDictionary, nil)
    if status != errSecSuccess {
      NSLog("[AfilmorySessionStore] Unable to persist the session cookie: %d", status)
    }
  }

  func clear() {
    let status = SecItemDelete(Self.query as CFDictionary)
    if status != errSecSuccess, status != errSecItemNotFound {
      NSLog("[AfilmorySessionStore] Unable to clear the session cookie: %d", status)
    }
  }

  private static var query: [String: Any] {
    [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
    ]
  }
}

final class AfilmorySessionStore: @unchecked Sendable {
  static let shared = AfilmorySessionStore()

  private let repository: PhotoCacheRepository
  private let transport: SessionTransport
  private let cookieStorage: SessionCookieStorage
  private let lock = NSLock()
  private var platformBaseURL: String?
  private var tenantBaseURL: String?
  private var state: AfilmorySessionState
  private var observers: [UUID: AfilmorySessionObserver] = [:]
  private var refreshTask: Task<Void, Never>?
  private var refreshGeneration: UInt64 = 0
  private var bootstrapped = false
  private var foregroundObserver: NSObjectProtocol?

  init(
    repository: PhotoCacheRepository = SwiftDataPhotoCacheRepository(container: AfilmoryDatabase.shared),
    transport: SessionTransport = LiveSessionTransport(),
    cookieStorage: SessionCookieStorage = KeychainSessionCookieStorage()
  ) {
    self.repository = repository
    self.transport = transport
    self.cookieStorage = cookieStorage
    platformBaseURL = ApiEnvironmentStore.storedOrBuildDefault().platformAPIBaseURL().absoluteString
    tenantBaseURL = nil
    state = cookieStorage.read() == nil ? .signedOut : .loading
    foregroundObserver = NotificationCenter.default.addObserver(
      forName: UIApplication.didBecomeActiveNotification,
      object: nil,
      queue: .main
    ) { [weak self] _ in
      Task { @MainActor in
        self?.bootstrap()
      }
    }
  }

  deinit {
    if let foregroundObserver {
      NotificationCenter.default.removeObserver(foregroundObserver)
    }
  }

  func register(cookie: String) {
    let normalized = cookie.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !normalized.isEmpty else {
      clearSession()
      return
    }
    cookieStorage.write(normalized)
    refreshSession()
  }

  func registerEnvironment(platformBaseURL: String, tenantBaseURL: String?) {
    lock.withLock {
      self.platformBaseURL = Self.normalizedBaseURL(platformBaseURL)
      self.tenantBaseURL = tenantBaseURL.flatMap(Self.normalizedBaseURL)
    }
  }

  func clearSession() {
    APNsRegistrationCoordinator.unregisterCurrentDevice(using: current())
    cookieStorage.clear()
    ShareUploadContextStore.clear()
    let observers = lock.withLock { () -> [AfilmorySessionObserver] in
      refreshGeneration &+= 1
      refreshTask?.cancel()
      refreshTask = nil
      tenantBaseURL = nil
      state = .signedOut
      return Array(self.observers.values)
    }
    ApiEnvironmentStore.shared.activateTenant(slug: nil)
    let repository = repository
    Task { await repository.wipeAll() }
    notify(observers, state: .signedOut)
  }

  func current() -> AfilmorySessionSnapshot {
    let environment = lock.withLock { (platformBaseURL, tenantBaseURL) }
    return AfilmorySessionSnapshot(
      cookie: cookieStorage.read(),
      platformBaseURL: environment.0,
      tenantBaseURL: environment.1,
      state: lock.withLock { state }
    )
  }

  @MainActor
  func bootstrap() {
    let isFirstBootstrap = lock.withLock { () -> Bool in
      guard !bootstrapped else { return false }
      bootstrapped = true
      return true
    }
    if isFirstBootstrap {
      publishCachedSession()
    }
    // Later bootstraps (foreground, tab mount) are the only retry hook an unresolved session gets.
    let isUnresolved = lock.withLock { state.session == nil }
    guard isFirstBootstrap || isUnresolved else { return }
    startRefresh(joinInFlight: true)
  }

  func refreshSession() {
    startRefresh(joinInFlight: false)
  }

  func observe(
    _ observer: @escaping AfilmorySessionObserver
  ) -> AfilmorySessionObservationToken {
    let id = UUID()
    let currentState = lock.withLock { () -> AfilmorySessionState in
      observers[id] = observer
      return state
    }
    observer(currentState)
    return AfilmorySessionObservationToken { [weak self] in
      _ = self?.lock.withLock {
        self?.observers.removeValue(forKey: id)
      }
    }
  }

  func hasStoredCookie() -> Bool {
    cookieStorage.read() != nil
  }

  @MainActor
  private func publishCachedSession() {
    guard cookieStorage.read() != nil,
          let payload = repository.loadSession(),
          let session = try? JSONDecoder().decode(AfilmorySession.self, from: payload)
    else { return }
    ApiEnvironmentStore.shared.activateTenant(slug: session.activeWorkspace?.slug)
    publish(.signedIn(session))
  }

  private func startRefresh(joinInFlight: Bool) {
    guard cookieStorage.read() != nil else {
      if lock.withLock({ state != .signedOut }) {
        publish(.signedOut)
      }
      return
    }

    var enteredLoading = false
    let started = lock.withLock { () -> Bool in
      if refreshTask != nil {
        guard !joinInFlight else { return false }
        refreshTask?.cancel()
      }
      refreshGeneration &+= 1
      if state.session == nil, state != .loading {
        state = .loading
        enteredLoading = true
      }
      let generation = refreshGeneration
      refreshTask = Task { [weak self] in
        await self?.performRefresh(generation: generation)
      }
      return true
    }
    guard started else { return }
    if enteredLoading {
      publishCurrent()
    }
  }

  private func performRefresh(generation: UInt64) async {
    do {
      let response = try await transport.fetchSession()
      guard !Task.isCancelled, isCurrentRefresh(generation) else { return }
      guard let session = response?.resolved() else {
        await applyServerSignOut(generation: generation)
        return
      }
      ApiEnvironmentStore.shared.activateTenant(slug: session.activeWorkspace?.slug)
      if let payload = try? JSONEncoder().encode(session) {
        await repository.saveSession(payload)
      }
      completeRefresh(generation: generation, state: .signedIn(session))
    } catch APIError.unauthorized {
      await applyServerSignOut(generation: generation)
    } catch APIError.cancelled {
      return
    } catch {
      completeRefreshKeepingSession(generation: generation, error: error)
    }
  }

  private func applyServerSignOut(generation: UInt64) async {
    guard isCurrentRefresh(generation) else { return }
    APNsRegistrationCoordinator.unregisterCurrentDevice(using: current())
    cookieStorage.clear()
    ApiEnvironmentStore.shared.activateTenant(slug: nil)
    await repository.wipeAll()
    completeRefresh(generation: generation, state: .signedOut)
  }

  private func isCurrentRefresh(_ generation: UInt64) -> Bool {
    lock.withLock { generation == refreshGeneration }
  }

  private func completeRefresh(generation: UInt64, state: AfilmorySessionState) {
    let observers = lock.withLock { () -> [AfilmorySessionObserver]? in
      guard generation == refreshGeneration else { return nil }
      refreshTask = nil
      self.state = state
      return Array(self.observers.values)
    }
    guard let observers else { return }
    synchronizeUploadContext(state)
    notify(observers, state: state)
  }

  private func completeRefreshKeepingSession(generation: UInt64, error: Error) {
    NSLog("[AfilmorySessionStore] Session refresh failed: %@", error.localizedDescription)
    let failure = lock.withLock { () -> (AfilmorySessionState, [AfilmorySessionObserver])? in
      guard generation == refreshGeneration else { return nil }
      refreshTask = nil
      guard state.session == nil else { return nil }
      state = .failed(error.localizedDescription)
      return (state, Array(observers.values))
    }
    guard let failure else { return }
    notify(failure.1, state: failure.0)
  }

  private func publish(_ state: AfilmorySessionState) {
    let observers = lock.withLock { () -> [AfilmorySessionObserver] in
      self.state = state
      return Array(self.observers.values)
    }
    synchronizeUploadContext(state)
    notify(observers, state: state)
  }

  private func publishCurrent() {
    let snapshot = lock.withLock { (state, Array(observers.values)) }
    notify(snapshot.1, state: snapshot.0)
  }

  private func synchronizeUploadContext(_ state: AfilmorySessionState) {
    if let session = state.session {
      ShareUploadContextStore.update(session: session)
    } else if state == .signedOut {
      ShareUploadContextStore.clear()
    }
  }

  private func notify(
    _ observers: [AfilmorySessionObserver],
    state: AfilmorySessionState
  ) {
    for observer in observers {
      observer(state)
    }
  }

  private static func normalizedBaseURL(_ value: String) -> String? {
    let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
    guard let components = URLComponents(string: trimmed),
          let scheme = components.scheme,
          scheme == "http" || scheme == "https",
          components.host != nil
    else { return nil }
    return trimmed.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
  }
}

private extension NSLock {
  func withLock<T>(_ operation: () throws -> T) rethrows -> T {
    lock()
    defer { unlock() }
    return try operation()
  }
}
