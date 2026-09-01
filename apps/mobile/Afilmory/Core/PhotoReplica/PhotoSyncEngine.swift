import Foundation

protocol PhotoSyncTransport: Sendable {
  func fetchSnapshot(slug: String) async throws -> (revision: Int, photos: [GalleryPhoto])
  func fetchChanges(slug: String, after: Int) async throws -> ManifestChangesResponse
  func fetchStudioAssets() async throws -> [StudioAsset]
}

struct LivePhotoSyncTransport: PhotoSyncTransport {
  private let api: AfilmoryAPI

  init(api: AfilmoryAPI = .shared) {
    self.api = api
  }

  func fetchSnapshot(slug: String) async throws -> (revision: Int, photos: [GalleryPhoto]) {
    let apiBaseURL = try ApiEnvironmentStore.shared.galleryAPIBaseURL(slug: slug)
    let origin = try ApiEnvironmentStore.shared.galleryOrigin(slug: slug)
    let endpoint = APIEndpoint(
      baseURL: .explicit(apiBaseURL.absoluteString),
      path: "manifest/snapshot",
      retryPolicy: .transientGET(maxAttempts: 2, delay: 0.4)
    )
    let snapshot: ManifestSnapshotResponse = try await api.request(endpoint)
    return (snapshot.revision, ManifestDecoding.normalize(snapshot.manifest.data, galleryOrigin: origin))
  }

  func fetchChanges(slug: String, after: Int) async throws -> ManifestChangesResponse {
    let apiBaseURL = try ApiEnvironmentStore.shared.galleryAPIBaseURL(slug: slug)
    let endpoint = APIEndpoint(
      baseURL: .explicit(apiBaseURL.absoluteString),
      path: "manifest/changes",
      queryItems: [URLQueryItem(name: "after", value: String(after))],
      retryPolicy: .transientGET(maxAttempts: 2, delay: 0.4)
    )
    return try await api.request(endpoint)
  }

  func fetchStudioAssets() async throws -> [StudioAsset] {
    let endpoint = APIEndpoint(baseURL: .tenant, path: "photos/assets")
    return try await api.request(endpoint)
  }
}

@MainActor
final class PhotoSyncEngine {
  static let shared = PhotoSyncEngine()

  private let repository: PhotoReplicaRepository
  private let transport: PhotoSyncTransport
  private var inFlight: [String: Task<Void, Never>] = [:]
  private var followUp: Set<String> = []

  init(
    repository: PhotoReplicaRepository = PhotoReplicaRepository(),
    transport: PhotoSyncTransport = LivePhotoSyncTransport()
  ) {
    self.repository = repository
    self.transport = transport
  }

  func ensureSynced(slug: String, force: Bool = false, includeStudio: Bool = false) {
    if let existing = inFlight[slug] {
      if force {
        followUp.insert(slug)
      }
      _ = existing
      return
    }

    inFlight[slug] = Task { [weak self] in
      guard let self else { return }
      await self.sync(slug: slug, includeStudio: includeStudio)
      self.inFlight[slug] = nil
      if self.followUp.remove(slug) != nil {
        self.ensureSynced(slug: slug, force: true, includeStudio: includeStudio)
      }
    }
  }

  func applyCommitted(_ change: PhotoChange, slug: String) {
    do {
      let result = try repository.apply(slug: slug, tenantId: change.tenantId, change: change)
      if result.needsReconcile {
        ensureSynced(slug: slug, force: true)
      }
    } catch {
      NSLog("[PhotoSyncEngine] Failed to apply committed change: %@", error.localizedDescription)
      ensureSynced(slug: slug, force: true)
    }
  }

  func wipeAll() {
    inFlight.values.forEach { $0.cancel() }
    inFlight.removeAll()
    followUp.removeAll()
    try? repository.wipeAll()
  }

  private func sync(slug: String, includeStudio: Bool) async {
    do {
      if let state = try repository.state(for: slug) {
        try await catchUp(slug: slug, from: state, includeStudio: includeStudio)
      } else {
        try await bootstrap(slug: slug, includeStudio: includeStudio)
      }
    } catch {
      if case APIError.unauthorized = error {
        wipeAll()
        return
      }
      NSLog("[PhotoSyncEngine] Sync failed for %@: %@", slug, error.localizedDescription)
      return
    }
    refreshWidgetSnapshot(slug: slug)
  }

  private func refreshWidgetSnapshot(slug: String) {
    guard AfilmoryBuildConfiguration.appGroupIdentifier != nil,
          AfilmorySessionStore.shared.current().state.session?.activeWorkspace?.slug == slug
    else { return }
    let repository = repository
    Task.detached { await WidgetSnapshotWriter.shared.update(slug: slug, repository: repository) }
  }

  private func catchUp(slug: String, from state: PhotoReplicaState, includeStudio: Bool) async throws {
    var cursor = state.contiguousRevision
    var tenantId = state.tenantId
    var pages = 0

    while pages < 32 {
      pages += 1
      let delta = try await transport.fetchChanges(slug: slug, after: cursor)
      if delta.expired || delta.revision < cursor {
        try await bootstrap(slug: slug, includeStudio: includeStudio)
        return
      }

      for change in delta.changes {
        let result = try repository.apply(slug: slug, tenantId: change.tenantId, change: change)
        if let advancedTo = result.advancedTo {
          cursor = advancedTo
          tenantId = change.tenantId
        }
      }

      let latest = try repository.state(for: slug)
      if latest?.needsReconcile == true {
        try await bootstrap(slug: slug, includeStudio: includeStudio)
        return
      }

      if includeStudio {
        let assets = try await transport.fetchStudioAssets()
        let photos = try repository.publishedPhotos(for: slug)
        try repository.replaceSnapshot(
          slug: slug,
          tenantId: tenantId,
          revision: delta.revision,
          photos: photos,
          assets: assets
        )
        return
      }

      if delta.changes.isEmpty || (delta.changes.last?.revision ?? cursor) >= delta.revision {
        try repository.markReconciled(slug: slug, revision: delta.revision)
        return
      }

      cursor = latest?.contiguousRevision ?? cursor
    }

    try await bootstrap(slug: slug, includeStudio: includeStudio)
  }

  private func bootstrap(slug: String, includeStudio: Bool) async throws {
    let snapshot = try await transport.fetchSnapshot(slug: slug)
    var assets: [StudioAsset] = []
    if includeStudio {
      assets = (try? await transport.fetchStudioAssets()) ?? []
    }
    try repository.replaceSnapshot(
      slug: slug,
      tenantId: nil,
      revision: snapshot.revision,
      photos: snapshot.photos,
      assets: assets
    )
  }
}
