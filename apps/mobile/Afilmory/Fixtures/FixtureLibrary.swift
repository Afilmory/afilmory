#if DEBUG
  import Foundation

  struct FixtureOwnPhoto {
    let index: Int
    let baseId: String
    let photo: [String: Any]
    let uploadedAt: Date

    var assetId: String { "asset-\(baseId)" }
    var size: Double { FixtureLibrary.number(photo["size"]) }
    var tags: [String] { photo["tags"] as? [String] ?? [] }
  }

  enum FixtureLibrary {
    static var catalog: FixtureCatalog { .shared }

    static func ownPhotos(_ data: FixtureStateData) -> [FixtureOwnPhoto] {
      guard data.hasLibrary else { return [] }
      let gallery = catalog.ownGallery
      return catalog.baseOrder.enumerated().compactMap { index, baseId in
        guard !data.deletedPhotoIds.contains(baseId),
              let photo = catalog.photo(baseId, in: gallery, tags: data.tagOverrides[baseId])
        else { return nil }
        return FixtureOwnPhoto(index: index, baseId: baseId, photo: photo, uploadedAt: catalog.uploadedAt(ownIndex: index))
      }
    }

    static func photos(in gallery: FixtureGallery, _ data: FixtureStateData) -> [[String: Any]] {
      if gallery.isOwn {
        return ownPhotos(data).map(\.photo)
      }
      return gallery.photoIds.compactMap { catalog.photo($0, in: gallery) }
    }

    static func photoCount(_ gallery: FixtureGallery, _ data: FixtureStateData) -> Int {
      photos(in: gallery, data).count
    }

    static func lastUpload(_ gallery: FixtureGallery, _ data: FixtureStateData) -> Date? {
      if gallery.isOwn {
        return ownPhotos(data).map(\.uploadedAt).max()
      }
      return gallery.uploads.map { catalog.uploadedAt($0, position: 0) }.max()
    }

    static func preview(_ photo: [String: Any], syncedAt: Date) -> [String: Any] {
      let width = number(photo["width"])
      let height = number(photo["height"])
      return [
        "id": photo["id"] as? String ?? "",
        "aspectRatio": photo["aspectRatio"] ?? (height > 0 ? width / height : 1),
        "width": width,
        "height": height,
        "isLivePhoto": (photo["video"] as? [String: Any])?["type"] as? String == "live-photo",
        "syncedAt": FixtureClock.iso(syncedAt),
        "thumbHash": photo["thumbHash"] ?? NSNull(),
        "thumbnailUrl": photo["thumbnailUrl"] ?? "",
      ]
    }

    static func recentPreviews(_ gallery: FixtureGallery, _ data: FixtureStateData, limit: Int) -> [[String: Any]] {
      if gallery.isOwn {
        return ownPhotos(data)
          .sorted { $0.uploadedAt > $1.uploadedAt }
          .prefix(limit)
          .map { preview($0.photo, syncedAt: $0.uploadedAt) }
      }
      var previews: [(Date, [String: Any])] = []
      for upload in gallery.uploads {
        for (position, baseId) in upload.photoIds.enumerated() {
          guard let photo = catalog.photo(baseId, in: gallery) else { continue }
          let at = catalog.uploadedAt(upload, position: position)
          previews.append((at, preview(photo, syncedAt: at)))
        }
      }
      return previews.sorted { $0.0 > $1.0 }.prefix(limit).map(\.1)
    }

    static func author(_ gallery: FixtureGallery) -> [String: Any] {
      ["name": gallery.author.name, "avatar": orNull(gallery.author.avatarURL)]
    }

    static func number(_ value: Any?) -> Double {
      if let value = value as? Double { return value }
      if let value = value as? Int { return Double(value) }
      if let value = value as? NSNumber { return value.doubleValue }
      return 0
    }

    static func manifestChange(
      operation: String,
      photo: FixtureOwnPhoto?,
      baseId: String,
      revision: Int
    ) -> [String: Any] {
      var change: [String: Any] = [
        "tenantId": FixtureCatalog.ownTenantId,
        "revision": revision,
        "operation": operation,
        "photoId": baseId,
        "assetId": "asset-\(baseId)",
        "published": operation == "upsert",
        "photo": NSNull(),
        "asset": NSNull(),
      ]
      if let photo {
        change["photo"] = photo.photo
        change["asset"] = changeAsset(photo)
      }
      return change
    }

    static func studioAsset(_ photo: FixtureOwnPhoto) -> [String: Any] {
      var asset = changeAsset(photo)
      asset["manifest"] = ["version": FixtureCatalog.manifestVersion, "data": photo.photo]
      return asset
    }

    private static func changeAsset(_ photo: FixtureOwnPhoto) -> [String: Any] {
      let created = FixtureClock.iso(photo.uploadedAt)
      return [
        "id": photo.assetId,
        "photoId": photo.baseId,
        "storageKey": "photos/\(photo.baseId).jpg",
        "storageProvider": "s3",
        "syncStatus": "synced",
        "size": photo.size,
        "createdAt": created,
        "updatedAt": created,
        "syncedAt": created,
        "publicUrl": photo.photo["originalUrl"] ?? NSNull(),
      ]
    }
  }
#endif
