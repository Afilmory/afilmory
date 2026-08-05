import XCTest
@testable import PhotoMasonry

@MainActor
final class SessionStoreCacheTests: XCTestCase {
  private static let cookie = "afilmory-tenant.session=abc"

  func testBootstrapPublishesTheCachedSessionBeforeTheNetworkResponds() async throws {
    let session = Self.makeSession()
    let repository = InMemoryPhotoCacheRepository()
    try await Self.seed(session, in: repository)
    let cookies = InMemorySessionCookieStorage(cookie: Self.cookie)
    let gate = Gate()
    let transport = FakeSessionTransport(steps: [.success(Self.makeResponse())], gate: gate)
    let store = AfilmorySessionStore(repository: repository, transport: transport, cookieStorage: cookies)

    let recorder = StateRecorder()
    let token = store.observe { recorder.record($0) }

    store.bootstrap()

    XCTAssertEqual(store.current().state, .signedIn(session))
    XCTAssertEqual(recorder.states.last, .signedIn(session))

    try await waitUntil { await transport.requestCount == 1 }
    XCTAssertEqual(store.current().state, .signedIn(session))

    await gate.open()
    token.cancel()
  }

  func testConcurrentBootstrapsIssueASingleSessionRequest() async throws {
    let repository = InMemoryPhotoCacheRepository()
    let cookies = InMemorySessionCookieStorage(cookie: Self.cookie)
    let gate = Gate()
    let transport = FakeSessionTransport(steps: [.success(Self.makeResponse())], gate: gate)
    let store = AfilmorySessionStore(repository: repository, transport: transport, cookieStorage: cookies)

    for _ in 0..<8 {
      store.bootstrap()
    }

    try await waitUntil { await transport.requestCount == 1 }
    try await Task.sleep(nanoseconds: 50_000_000)

    let requestCount = await transport.requestCount
    XCTAssertEqual(requestCount, 1)

    await gate.open()
  }

  func testBootstrapJoinsAnAlreadyRunningRefresh() async throws {
    let session = Self.makeSession()
    let repository = InMemoryPhotoCacheRepository()
    try await Self.seed(session, in: repository)
    let cookies = InMemorySessionCookieStorage(cookie: Self.cookie)
    let gate = Gate()
    let transport = FakeSessionTransport(steps: [.success(Self.makeResponse())], gate: gate)
    let store = AfilmorySessionStore(repository: repository, transport: transport, cookieStorage: cookies)

    store.refreshSession()
    try await waitUntil { await transport.requestCount == 1 }

    store.bootstrap()
    XCTAssertEqual(store.current().state, .signedIn(session))

    try await Task.sleep(nanoseconds: 50_000_000)
    let requestCount = await transport.requestCount
    XCTAssertEqual(requestCount, 1)

    await gate.open()
  }

  func testBootstrapRetriesAfterAFailedRefresh() async throws {
    let repository = InMemoryPhotoCacheRepository()
    let cookies = InMemorySessionCookieStorage(cookie: Self.cookie)
    let transport = FakeSessionTransport(
      steps: [.failure(APIError.transport(URLError(.notConnectedToInternet))), .success(Self.makeResponse())]
    )
    let store = AfilmorySessionStore(repository: repository, transport: transport, cookieStorage: cookies)

    store.bootstrap()
    try await waitUntil { store.current().state != .loading }
    XCTAssertNil(store.current().state.session)

    store.bootstrap()

    try await waitUntil { store.current().state == .signedIn(Self.makeSession()) }
    let requestCount = await transport.requestCount
    XCTAssertEqual(requestCount, 2)
  }

  func testBootstrapRetriesAfterAnUnreadableCookieAtLaunch() async throws {
    let repository = InMemoryPhotoCacheRepository()
    let cookies = InMemorySessionCookieStorage()
    let transport = FakeSessionTransport(steps: [.success(Self.makeResponse())])
    let store = AfilmorySessionStore(repository: repository, transport: transport, cookieStorage: cookies)

    store.bootstrap()
    XCTAssertEqual(store.current().state, .signedOut)

    cookies.write(Self.cookie)
    store.bootstrap()

    try await waitUntil { store.current().state == .signedIn(Self.makeSession()) }
    let requestCount = await transport.requestCount
    XCTAssertEqual(requestCount, 1)
  }

  func testForegroundingRetriesAnUnresolvedSession() async throws {
    let repository = InMemoryPhotoCacheRepository()
    let cookies = InMemorySessionCookieStorage(cookie: Self.cookie)
    let transport = FakeSessionTransport(
      steps: [.failure(APIError.transport(URLError(.notConnectedToInternet))), .success(Self.makeResponse())]
    )
    let store = AfilmorySessionStore(repository: repository, transport: transport, cookieStorage: cookies)

    store.bootstrap()
    try await waitUntil { store.current().state != .loading }
    XCTAssertNil(store.current().state.session)

    NotificationCenter.default.post(name: UIApplication.didBecomeActiveNotification, object: nil)

    try await waitUntil { store.current().state == .signedIn(Self.makeSession()) }
    let requestCount = await transport.requestCount
    XCTAssertEqual(requestCount, 2)
  }

  func testBootstrapDoesNotRefetchOnceTheSessionIsResolved() async throws {
    let repository = InMemoryPhotoCacheRepository()
    let cookies = InMemorySessionCookieStorage(cookie: Self.cookie)
    let transport = FakeSessionTransport(steps: [.success(Self.makeResponse())])
    let store = AfilmorySessionStore(repository: repository, transport: transport, cookieStorage: cookies)

    store.bootstrap()
    try await waitUntil { store.current().state == .signedIn(Self.makeSession()) }

    store.bootstrap()
    store.bootstrap()
    try await Task.sleep(nanoseconds: 50_000_000)

    let requestCount = await transport.requestCount
    XCTAssertEqual(requestCount, 1)
  }

  func testRefreshFailureKeepsTheCachedSignedInState() async throws {
    let session = Self.makeSession()
    let repository = InMemoryPhotoCacheRepository()
    try await Self.seed(session, in: repository)
    let cookies = InMemorySessionCookieStorage(cookie: Self.cookie)
    let transport = FakeSessionTransport(steps: [.failure(APIError.transport(URLError(.notConnectedToInternet)))])
    let store = AfilmorySessionStore(repository: repository, transport: transport, cookieStorage: cookies)

    store.bootstrap()
    XCTAssertEqual(store.current().state, .signedIn(session))

    try await waitUntil { await transport.requestCount == 1 }
    try await Task.sleep(nanoseconds: 50_000_000)

    XCTAssertEqual(store.current().state, .signedIn(session))
    XCTAssertNotNil(cookies.read())
    XCTAssertNotNil(repository.loadSession())
  }

  func testServerErrorWithoutACachedSessionKeepsTheStoredCookie() async throws {
    let repository = InMemoryPhotoCacheRepository()
    let cookies = InMemorySessionCookieStorage(cookie: Self.cookie)
    let transport = FakeSessionTransport(steps: [.failure(APIError.http(status: 500, body: nil))])
    let store = AfilmorySessionStore(repository: repository, transport: transport, cookieStorage: cookies)

    store.bootstrap()
    XCTAssertEqual(store.current().state, .loading)

    try await waitUntil { store.current().state != .loading }

    XCTAssertNil(store.current().state.session)
    XCTAssertNotEqual(store.current().state, .signedOut)
    XCTAssertNotNil(cookies.read())
  }

  func testUnauthorizedRefreshClearsTheCookieAndWipesTheCache() async throws {
    let session = Self.makeSession()
    let repository = InMemoryPhotoCacheRepository()
    try await Self.seed(session, in: repository)
    await repository.saveGalleryDirectory(Data("{}".utf8))
    let cookies = InMemorySessionCookieStorage(cookie: Self.cookie)
    let transport = FakeSessionTransport(steps: [.failure(APIError.unauthorized)])
    let store = AfilmorySessionStore(repository: repository, transport: transport, cookieStorage: cookies)

    store.bootstrap()
    XCTAssertEqual(store.current().state, .signedIn(session))

    try await waitUntil { store.current().state == .signedOut }
    try await waitUntil { await MainActor.run { repository.loadSession() == nil } }

    XCTAssertNil(cookies.read())
    XCTAssertNil(repository.loadGalleryDirectory())
  }

  func testSuccessfulRefreshPublishesAndPersistsTheSession() async throws {
    let repository = InMemoryPhotoCacheRepository()
    let cookies = InMemorySessionCookieStorage(cookie: Self.cookie)
    let transport = FakeSessionTransport(steps: [.success(Self.makeResponse())])
    let store = AfilmorySessionStore(repository: repository, transport: transport, cookieStorage: cookies)

    store.bootstrap()
    XCTAssertEqual(store.current().state, .loading)

    try await waitUntil { store.current().state == .signedIn(Self.makeSession()) }
    try await waitUntil { await MainActor.run { repository.loadSession() != nil } }

    let payload = try XCTUnwrap(repository.loadSession())
    let persisted = try JSONDecoder().decode(AfilmorySession.self, from: payload)
    XCTAssertEqual(persisted, Self.makeSession())
  }

  func testCorruptedCachedSessionIsIgnoredAtBootstrap() async throws {
    let repository = InMemoryPhotoCacheRepository()
    await repository.saveSession(Data("not-a-session".utf8))
    let cookies = InMemorySessionCookieStorage(cookie: Self.cookie)
    let gate = Gate()
    let transport = FakeSessionTransport(steps: [.success(Self.makeResponse())], gate: gate)
    let store = AfilmorySessionStore(repository: repository, transport: transport, cookieStorage: cookies)

    store.bootstrap()
    XCTAssertEqual(store.current().state, .loading)

    try await waitUntil { await transport.requestCount == 1 }
    await gate.open()
    try await waitUntil { store.current().state == .signedIn(Self.makeSession()) }
  }

  func testBootstrapWithoutACookiePublishesSignedOutWithoutRequesting() async throws {
    let repository = InMemoryPhotoCacheRepository()
    try await Self.seed(Self.makeSession(), in: repository)
    let cookies = InMemorySessionCookieStorage()
    let transport = FakeSessionTransport(steps: [.success(Self.makeResponse())])
    let store = AfilmorySessionStore(repository: repository, transport: transport, cookieStorage: cookies)

    store.bootstrap()
    XCTAssertEqual(store.current().state, .signedOut)

    try await Task.sleep(nanoseconds: 50_000_000)
    let requestCount = await transport.requestCount
    XCTAssertEqual(requestCount, 0)
  }

  func testClearSessionWipesTheCacheAndTheCookie() async throws {
    let repository = InMemoryPhotoCacheRepository()
    try await Self.seed(Self.makeSession(), in: repository)
    let cookies = InMemorySessionCookieStorage(cookie: Self.cookie)
    let transport = FakeSessionTransport(steps: [])
    let store = AfilmorySessionStore(repository: repository, transport: transport, cookieStorage: cookies)

    store.clearSession()

    XCTAssertEqual(store.current().state, .signedOut)
    XCTAssertNil(cookies.read())
    try await waitUntil { await MainActor.run { repository.loadSession() == nil } }
  }

  func testRegisteringACookieRestartsTheInFlightRefresh() async throws {
    let repository = InMemoryPhotoCacheRepository()
    let cookies = InMemorySessionCookieStorage(cookie: Self.cookie)
    let gate = Gate()
    let transport = FakeSessionTransport(
      steps: [.success(Self.makeResponse()), .success(Self.makeResponse())],
      gate: gate
    )
    let store = AfilmorySessionStore(repository: repository, transport: transport, cookieStorage: cookies)

    store.bootstrap()
    try await waitUntil { await transport.requestCount == 1 }

    store.register(cookie: "afilmory-tenant.session=refreshed")
    try await waitUntil { await transport.requestCount == 2 }

    XCTAssertEqual(cookies.read(), "afilmory-tenant.session=refreshed")
    await gate.open()
  }

  private static func seed(_ session: AfilmorySession, in repository: InMemoryPhotoCacheRepository) async throws {
    let payload = try JSONEncoder().encode(session)
    await repository.saveSession(payload)
  }

  private static func makeSession() -> AfilmorySession {
    makeResponse().resolved()!
  }

  private static func makeResponse() -> AfilmorySessionResponse {
    let workspace = AfilmorySessionWorkspace(
      id: "workspace-1",
      slug: "acme",
      name: "Acme",
      status: "active",
      isPlaceholder: nil
    )
    return AfilmorySessionResponse(
      user: AfilmorySessionUser(id: "user-1", name: "Ada", email: "ada@example.com", image: nil, role: "user"),
      activeWorkspace: workspace,
      requestedWorkspace: nil,
      requestedMembership: nil,
      memberships: [
        AfilmorySessionMembership(id: "membership-1", role: "owner", status: "active", workspace: workspace),
      ]
    )
  }

  private func waitUntil(
    timeout: TimeInterval = 2,
    _ condition: () async -> Bool
  ) async throws {
    let deadline = Date().addingTimeInterval(timeout)
    while await !condition() {
      if Date() >= deadline {
        XCTFail("Timed out waiting for condition")
        return
      }
      try await Task.sleep(nanoseconds: 10_000_000)
    }
  }
}

private actor Gate {
  private var opened = false
  private var waiters: [CheckedContinuation<Void, Never>] = []

  func wait() async {
    if opened { return }
    await withCheckedContinuation { waiters.append($0) }
  }

  func open() {
    opened = true
    for waiter in waiters {
      waiter.resume()
    }
    waiters.removeAll()
  }
}

private actor FakeSessionTransport: SessionTransport {
  enum Step {
    case success(AfilmorySessionResponse)
    case failure(Error)
  }

  private var steps: [Step]
  private let gate: Gate?
  private(set) var requestCount = 0

  init(steps: [Step], gate: Gate? = nil) {
    self.steps = steps
    self.gate = gate
  }

  func fetchSession() async throws -> AfilmorySessionResponse? {
    requestCount += 1
    let step = steps.isEmpty ? Step.failure(APIError.cancelled) : steps.removeFirst()
    if let gate {
      await gate.wait()
    }
    switch step {
    case .success(let response):
      return response
    case .failure(let error):
      throw error
    }
  }
}

private final class InMemorySessionCookieStorage: SessionCookieStorage, @unchecked Sendable {
  private let lock = NSLock()
  private var cookie: String?

  init(cookie: String? = nil) {
    self.cookie = cookie
  }

  func read() -> String? {
    lock.withLock { cookie }
  }

  func write(_ cookie: String) {
    lock.withLock { self.cookie = cookie }
  }

  func clear() {
    lock.withLock { cookie = nil }
  }
}

private final class StateRecorder: @unchecked Sendable {
  private let lock = NSLock()
  private var recorded: [AfilmorySessionState] = []

  var states: [AfilmorySessionState] {
    lock.withLock { recorded }
  }

  func record(_ state: AfilmorySessionState) {
    lock.withLock { recorded.append(state) }
  }
}

private extension NSLock {
  func withLock<T>(_ body: () -> T) -> T {
    lock()
    defer { unlock() }
    return body()
  }
}
