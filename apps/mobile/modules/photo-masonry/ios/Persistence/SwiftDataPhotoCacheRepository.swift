import Foundation
import SwiftData

final class SwiftDataPhotoCacheRepository: PhotoCacheRepository, Sendable {
  private let container: ModelContainer
  private let mutator: PhotoCacheMutator

  init(container: ModelContainer) {
    self.container = container
    mutator = PhotoCacheMutator(modelContainer: container)
  }

  @MainActor
  func loadFeed(_ key: PhotoFeedKey) -> (photos: [GalleryPhoto], etag: String?)? {
    let feedKey = key.rawValue
    let context = container.mainContext

    let feedDescriptor = FetchDescriptor<CachedFeed>(predicate: #Predicate<CachedFeed> { $0.feedKey == feedKey })
    guard let feed = try? context.fetch(feedDescriptor).first else { return nil }

    let photoDescriptor = FetchDescriptor<CachedPhoto>(
      predicate: #Predicate<CachedPhoto> { $0.feedKey == feedKey },
      sortBy: [SortDescriptor(\.orderIndex)]
    )
    let rows = (try? context.fetch(photoDescriptor)) ?? []

    let decoder = JSONDecoder()
    var photos: [GalleryPhoto] = []
    photos.reserveCapacity(rows.count)
    var corruptedPhotoIds: [String] = []
    for row in rows {
      if let photo = try? decoder.decode(GalleryPhoto.self, from: row.payload) {
        photos.append(photo)
      } else {
        corruptedPhotoIds.append(row.photoId)
      }
    }

    guard corruptedPhotoIds.isEmpty else {
      let mutator = mutator
      Task { await mutator.deleteCorruptedPhotos(feedKey: feedKey, photoIds: corruptedPhotoIds) }
      return photos.isEmpty ? nil : (photos, nil)
    }

    return (photos, feed.etag)
  }

  func saveFeed(_ key: PhotoFeedKey, photos: [GalleryPhoto], etag: String?) async {
    await mutator.saveFeed(feedKey: key.rawValue, photos: photos, etag: etag)
  }

  func touchFeed(_ key: PhotoFeedKey) async {
    await mutator.touchFeed(feedKey: key.rawValue)
  }

  @MainActor
  func loadGalleryDirectory() -> Data? {
    let context = container.mainContext
    return (try? context.fetch(FetchDescriptor<CachedGalleryDirectory>()))?.first?.payload
  }

  func saveGalleryDirectory(_ payload: Data) async {
    await mutator.saveGalleryDirectory(payload: payload)
  }

  @MainActor
  func loadSession() -> Data? {
    let context = container.mainContext
    return (try? context.fetch(FetchDescriptor<CachedSession>()))?.first?.payload
  }

  func saveSession(_ payload: Data) async {
    await mutator.saveSession(payload: payload)
  }

  func clearSession() async {
    await mutator.clearSession()
  }

  func wipeAll() async {
    await mutator.wipeAll()
  }

  func pruneStale(olderThan cutoff: Date) async {
    await mutator.pruneStale(olderThan: cutoff)
  }
}

@ModelActor
private actor PhotoCacheMutator {
  func saveFeed(feedKey: String, photos: [GalleryPhoto], etag: String?) {
    let existingDescriptor = FetchDescriptor<CachedPhoto>(predicate: #Predicate<CachedPhoto> { $0.feedKey == feedKey })
    var rowsByPhotoId = Dictionary(
      uniqueKeysWithValues: ((try? modelContext.fetch(existingDescriptor)) ?? []).map { ($0.photoId, $0) }
    )

    let encoder = JSONEncoder()
    var orderIndex = 0
    for photo in photos {
      guard let payload = try? encoder.encode(photo) else { continue }
      let takenAt = photo.dateTaken.flatMap { PhotoDateParser.date($0) }
      if let row = rowsByPhotoId.removeValue(forKey: photo.id) {
        row.orderIndex = orderIndex
        row.takenAt = takenAt
        row.payload = payload
      } else {
        modelContext.insert(
          CachedPhoto(photoId: photo.id, feedKey: feedKey, orderIndex: orderIndex, takenAt: takenAt, payload: payload)
        )
      }
      orderIndex += 1
    }

    for orphan in rowsByPhotoId.values {
      modelContext.delete(orphan)
    }

    let feedDescriptor = FetchDescriptor<CachedFeed>(predicate: #Predicate<CachedFeed> { $0.feedKey == feedKey })
    if let feed = try? modelContext.fetch(feedDescriptor).first {
      feed.etag = etag
      feed.fetchedAt = Date()
      feed.photoCount = orderIndex
    } else {
      modelContext.insert(CachedFeed(feedKey: feedKey, etag: etag, fetchedAt: Date(), photoCount: orderIndex))
    }

    try? modelContext.save()
  }

  func deleteCorruptedPhotos(feedKey: String, photoIds: [String]) {
    let idSet = Set(photoIds)
    let descriptor = FetchDescriptor<CachedPhoto>(predicate: #Predicate<CachedPhoto> { $0.feedKey == feedKey })
    let rows = (try? modelContext.fetch(descriptor)) ?? []
    for row in rows where idSet.contains(row.photoId) {
      modelContext.delete(row)
    }
    try? modelContext.save()
  }

  func touchFeed(feedKey: String) {
    let descriptor = FetchDescriptor<CachedFeed>(predicate: #Predicate<CachedFeed> { $0.feedKey == feedKey })
    guard let feed = try? modelContext.fetch(descriptor).first else { return }
    feed.fetchedAt = Date()
    try? modelContext.save()
  }

  func saveGalleryDirectory(payload: Data) {
    let rows = (try? modelContext.fetch(FetchDescriptor<CachedGalleryDirectory>())) ?? []
    if let first = rows.first {
      first.payload = payload
      first.fetchedAt = Date()
      for extra in rows.dropFirst() {
        modelContext.delete(extra)
      }
    } else {
      modelContext.insert(CachedGalleryDirectory(payload: payload, fetchedAt: Date()))
    }
    try? modelContext.save()
  }

  func saveSession(payload: Data) {
    let rows = (try? modelContext.fetch(FetchDescriptor<CachedSession>())) ?? []
    if let first = rows.first {
      first.payload = payload
      first.fetchedAt = Date()
      for extra in rows.dropFirst() {
        modelContext.delete(extra)
      }
    } else {
      modelContext.insert(CachedSession(payload: payload, fetchedAt: Date()))
    }
    try? modelContext.save()
  }

  func clearSession() {
    deleteAll(CachedSession.self)
    try? modelContext.save()
  }

  func wipeAll() {
    deleteAll(CachedPhoto.self)
    deleteAll(CachedFeed.self)
    deleteAll(CachedGalleryDirectory.self)
    deleteAll(CachedSession.self)
    try? modelContext.save()
  }

  func pruneStale(olderThan cutoff: Date) {
    let staleDescriptor = FetchDescriptor<CachedFeed>(predicate: #Predicate<CachedFeed> { $0.fetchedAt < cutoff })
    let staleFeeds = (try? modelContext.fetch(staleDescriptor)) ?? []
    for feed in staleFeeds {
      let feedKey = feed.feedKey
      let photoDescriptor = FetchDescriptor<CachedPhoto>(predicate: #Predicate<CachedPhoto> { $0.feedKey == feedKey })
      for row in (try? modelContext.fetch(photoDescriptor)) ?? [] {
        modelContext.delete(row)
      }
      modelContext.delete(feed)
    }
    try? modelContext.save()
  }

  private func deleteAll<T: PersistentModel>(_ type: T.Type) {
    guard let rows = try? modelContext.fetch(FetchDescriptor<T>()) else { return }
    for row in rows {
      modelContext.delete(row)
    }
  }
}
