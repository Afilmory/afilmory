import Foundation
import SwiftData

protocol GalleryDirectoryTransport: Sendable {
  func fetchGalleryDirectory(query: String, limit: Int) async throws -> FeaturedGalleriesEnvelope
}

struct LiveGalleryDirectoryTransport: GalleryDirectoryTransport {
  func fetchGalleryDirectory(query: String, limit: Int) async throws -> FeaturedGalleriesEnvelope {
    let endpoint = APIEndpoint(
      baseURL: .platform,
      path: "gallery-directory",
      queryItems: [
        query.isEmpty ? nil : URLQueryItem(name: "q", value: query),
        URLQueryItem(name: "limit", value: String(limit)),
      ].compactMap { $0 },
      retryPolicy: .transientGET(maxAttempts: 2, delay: 0.25)
    )
    return try await AfilmoryAPI.shared.request(endpoint)
  }
}

@MainActor
final class GalleryDirectoryStore {
  private let repository: PhotoCacheRepository
  private let transport: GalleryDirectoryTransport

  init(
    repository: PhotoCacheRepository = SwiftDataPhotoCacheRepository(container: AfilmoryDatabase.shared),
    transport: GalleryDirectoryTransport = LiveGalleryDirectoryTransport()
  ) {
    self.repository = repository
    self.transport = transport
  }

  func loadCached() -> [FeaturedGallery]? {
    guard let payload = repository.loadGalleryDirectory() else { return nil }
    return try? JSONDecoder().decode(FeaturedGalleriesEnvelope.self, from: payload).galleries
  }

  func fetch(query: String, limit: Int) async throws -> [FeaturedGallery] {
    let envelope = try await transport.fetchGalleryDirectory(query: query, limit: limit)
    if query.isEmpty, let payload = try? JSONEncoder().encode(envelope) {
      await repository.saveGalleryDirectory(payload)
    }
    return envelope.galleries
  }
}
