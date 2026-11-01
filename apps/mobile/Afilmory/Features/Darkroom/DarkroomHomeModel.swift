import Foundation

private struct DarkroomWorkspaceSwitchBody: Encodable {
  let tenantId: String
}

private struct DarkroomWorkspaceSwitchResponse: Decodable {
  let activeWorkspace: AfilmorySessionWorkspace
}

@MainActor
final class DarkroomHomeModel {
  private(set) var session: AfilmorySession?
  private(set) var overview: StudioDashboardOverview?
  private(set) var pendingComments: (count: Int, hasMore: Bool)?
  private(set) var domains: StudioDomainListing?
  private(set) var photos: [GalleryPhoto] = []
  private(set) var loadError: String?
  private(set) var switchingWorkspaceID: String?

  var onChange: (() -> Void)?
  var onError: ((String) -> Void)?

  private var sessionToken: AfilmorySessionObservationToken?
  private var feedToken: PhotoFeedObservationToken?
  private var feedSlug: String?
  private var loadTask: Task<Void, Never>?
  private var loadedWorkspaceID: String?

  var canManage: Bool {
    guard let session, let membership = session.activeMembership else { return false }
    return membership.status == "active"
      && (membership.role == "admin" || membership.role == "owner")
      && session.activeWorkspace?.status == "active"
  }

  var stats: DarkroomStats? {
    guard overview != nil || !photos.isEmpty else { return nil }
    return DarkroomStats(overview: overview?.stats, photos: photos)
  }

  var libraryTags: [String] {
    DarkroomTagSelection.libraryTags(photos.map(\.tags))
  }

  var customDomain: String? {
    guard let domains = domains?.domains else { return nil }
    return (domains.first { $0.status == .verified } ?? domains.first)?.domain
  }

  var galleryHost: String? {
    customDomain ?? AfilmorySessionStore.shared.current().tenantBaseURL.flatMap { URL(string: $0)?.host }
  }

  var manageableWorkspaces: [AfilmorySessionWorkspace] {
    guard let session else { return [] }
    return session.memberships
      .filter { $0.status == "active" && $0.workspace.status == "active" && ($0.role == "admin" || $0.role == "owner") }
      .map(\.workspace)
  }

  func start() {
    guard sessionToken == nil else { return }
    sessionToken = AfilmorySessionStore.shared.observe { [weak self] state in
      Task { @MainActor in self?.handle(state) }
    }
  }

  func reload() {
    loadedWorkspaceID = nil
    if let state = session.map(AfilmorySessionState.signedIn) { handle(state) }
    if let feedSlug { PhotoFeedStore.shared.load(.manifest(feedSlug), force: true) }
    Task { await EntitlementStore.shared.refresh(); self.onChange?() }
  }

  private func handle(_ state: AfilmorySessionState) {
    session = state.session
    guard let workspace = session?.activeWorkspace, workspace.status == "active" else {
      onChange?()
      return
    }
    if switchingWorkspaceID != nil { switchingWorkspaceID = nil }
    bindFeed(slug: workspace.slug)
    if loadedWorkspaceID != workspace.id {
      loadedWorkspaceID = workspace.id
      overview = nil
      pendingComments = nil
      domains = nil
      if canManage { load() }
    }
    onChange?()
  }

  private func bindFeed(slug: String) {
    guard feedSlug != slug else { return }
    feedSlug = slug
    let feed = PhotoFeedStore.shared.feed(for: .manifest(slug))
    feedToken = feed.observe { [weak self, weak feed] in
      guard let self, let feed else { return }
      self.photos = feed.photos
      self.onChange?()
    }
    photos = feed.photos
    PhotoFeedStore.shared.load(.manifest(slug))
  }

  private func load() {
    loadTask?.cancel()
    loadTask = Task { [weak self] in
      async let overview: StudioDashboardOverview = AfilmoryAPI.shared.request(
        APIEndpoint(baseURL: .tenant, path: "dashboard/overview", retryPolicy: .transientGET(maxAttempts: 2, delay: 0.25))
      )
      async let comments = NativeStudioAPI.comments(limit: 20, status: "pending")
      async let domains = NativeStudioAPI.tenantDomains()
      do {
        let resolved = try await overview
        guard !Task.isCancelled, let self else { return }
        self.overview = resolved
        self.loadError = nil
        self.onChange?()
      } catch {
        guard !Task.isCancelled, let self, !(error is CancellationError) else { return }
        self.loadError = error.localizedDescription
        self.onChange?()
      }
      if let page = try? await comments, let self {
        self.pendingComments = (page.comments.count, page.nextCursor != nil)
        self.onChange?()
      }
      if let listing = try? await domains, let self {
        self.domains = listing
        self.onChange?()
      }
      await EntitlementStore.shared.refresh()
      self?.onChange?()
    }
  }

  func switchWorkspace(to id: String) {
    guard switchingWorkspaceID == nil, id != session?.activeWorkspace?.id else { return }
    switchingWorkspaceID = id
    onChange?()
    Task { [weak self] in
      do {
        let endpoint = APIEndpoint(
          baseURL: .platform,
          path: "auth/workspaces/switch",
          method: .post,
          body: try APIEndpoint.jsonBody(DarkroomWorkspaceSwitchBody(tenantId: id))
        )
        let response: DarkroomWorkspaceSwitchResponse = try await AfilmoryAPI.shared.request(endpoint)
        ApiEnvironmentStore.shared.activateTenant(slug: response.activeWorkspace.slug)
        AfilmorySessionStore.shared.refreshSession()
      } catch {
        guard let self else { return }
        self.switchingWorkspaceID = nil
        self.onChange?()
        if !(error is CancellationError) { self.onError?(error.localizedDescription) }
      }
    }
  }
}
