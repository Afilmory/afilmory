import Foundation

@MainActor
final class ViewingPhotoLoader {
  static let shared = ViewingPhotoLoader()

  private struct SearchRequest: Encodable {
    let limit: Int
    let sort: String
  }

  private var recent: [String: [GalleryPhoto]] = [:]
  private var recentTasks: [String: Task<[GalleryPhoto], Never>] = [:]
  private var photosByID: [String: GalleryPhoto] = [:]

  func cachedRecentPhotos(slug: String) -> [GalleryPhoto]? {
    recent[slug]
  }

  func recentPhotos(slug: String, limit: Int = ViewingContent.galleryCoverLimit) async -> [GalleryPhoto] {
    if let cached = recent[slug] { return cached }
    if let running = recentTasks[slug] { return await running.value }
    let task = Task { @MainActor [weak self] () -> [GalleryPhoto] in
      let photos = (try? await Self.search(slug: slug, limit: limit)) ?? []
      self?.remember(photos)
      return photos
    }
    recentTasks[slug] = task
    let photos = await task.value
    recentTasks[slug] = nil
    if !photos.isEmpty { recent[slug] = photos }
    return photos
  }

  func photos(slug: String, ids: [String]) async -> [GalleryPhoto] {
    let missing = ids.filter { photosByID[$0] == nil }
    if !missing.isEmpty, let fetched = try? await Self.fetch(slug: slug, ids: missing) {
      remember(fetched)
    }
    return ids.compactMap { photosByID[$0] }
  }

  private func remember(_ photos: [GalleryPhoto]) {
    for photo in photos {
      photosByID[photo.id] = photo
    }
  }

  private static func search(slug: String, limit: Int) async throws -> [GalleryPhoto] {
    let origin = try ApiEnvironmentStore.shared.galleryOrigin(slug: slug)
    let base = try ApiEnvironmentStore.shared.galleryAPIBaseURL(slug: slug)
    let endpoint = APIEndpoint(
      baseURL: .explicit(base.absoluteString),
      path: "manifest/photos/search",
      method: .post,
      body: try APIEndpoint.jsonBody(SearchRequest(limit: limit, sort: "desc"))
    )
    let envelope: ManifestEnvelope = try await AfilmoryAPI.shared.request(endpoint)
    return ManifestDecoding.normalize(envelope.data, galleryOrigin: origin)
  }

  private static func fetch(slug: String, ids: [String]) async throws -> [GalleryPhoto] {
    let origin = try ApiEnvironmentStore.shared.galleryOrigin(slug: slug)
    let base = try ApiEnvironmentStore.shared.galleryAPIBaseURL(slug: slug)
    let endpoint = APIEndpoint(
      baseURL: .explicit(base.absoluteString),
      path: "manifest/photos",
      queryItems: [URLQueryItem(name: "ids", value: ids.joined(separator: ","))],
      retryPolicy: .transientGET(maxAttempts: 2, delay: 0.25)
    )
    let photos: [ManifestPhoto] = try await AfilmoryAPI.shared.request(endpoint)
    return ManifestDecoding.normalize(photos, galleryOrigin: origin)
  }
}
