import Foundation
import SwiftData

@Model
final class CachedPhoto {
  #Unique<CachedPhoto>([\.feedKey, \.photoId])
  #Index<CachedPhoto>([\.feedKey])

  var photoId: String
  var feedKey: String
  var orderIndex: Int
  var takenAt: Date?
  var payload: Data

  init(photoId: String, feedKey: String, orderIndex: Int, takenAt: Date?, payload: Data) {
    self.photoId = photoId
    self.feedKey = feedKey
    self.orderIndex = orderIndex
    self.takenAt = takenAt
    self.payload = payload
  }
}

@Model
final class CachedFeed {
  #Unique<CachedFeed>([\.feedKey])

  var feedKey: String
  var etag: String?
  var fetchedAt: Date
  var photoCount: Int

  init(feedKey: String, etag: String?, fetchedAt: Date, photoCount: Int) {
    self.feedKey = feedKey
    self.etag = etag
    self.fetchedAt = fetchedAt
    self.photoCount = photoCount
  }
}

@Model
final class CachedGalleryDirectory {
  var payload: Data
  var fetchedAt: Date

  init(payload: Data, fetchedAt: Date) {
    self.payload = payload
    self.fetchedAt = fetchedAt
  }
}

@Model
final class CachedSession {
  var payload: Data
  var fetchedAt: Date

  init(payload: Data, fetchedAt: Date) {
    self.payload = payload
    self.fetchedAt = fetchedAt
  }
}
