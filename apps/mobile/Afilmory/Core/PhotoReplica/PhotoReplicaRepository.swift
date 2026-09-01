import Foundation
import GRDB

struct PhotoReplicaApplyResult: Equatable, Sendable {
  var advancedTo: Int?
  var needsReconcile: Bool
}

final class PhotoReplicaRepository: Sendable {
  private let store: PhotoReplicaStore

  init(store: PhotoReplicaStore = PhotoReplicaDatabase.shared) {
    self.store = store
  }

  func state(for slug: String) throws -> PhotoReplicaState? {
    try store.queue.read { db in
      try Row.fetchOne(db, sql: "SELECT * FROM replica_state WHERE tenant_slug = ?", arguments: [slug])
        .map(Self.state(from:))
    }
  }

  func publishedPhotos(for slug: String) throws -> [GalleryPhoto] {
    try store.queue.read { db in
      let rows = try Row.fetchAll(
        db,
        sql: """
          SELECT payload FROM photos
          WHERE tenant_slug = ? AND published = 1
          ORDER BY COALESCE(date_taken, '') DESC, photo_id DESC
          """,
        arguments: [slug]
      )
      return rows.compactMap { row in
        guard let payload = row["payload"] as? Data else { return nil }
        return try? JSONDecoder().decode(GalleryPhoto.self, from: payload)
      }
    }
  }

  func assetId(forPhotoId photoId: String, slug: String) throws -> String? {
    try store.queue.read { db in
      try String.fetchOne(
        db,
        sql: """
          SELECT asset_id FROM studio_assets
          WHERE tenant_slug = ? AND (photo_id = ? OR asset_id = ?)
          LIMIT 1
          """,
        arguments: [slug, photoId, photoId]
      )
    }
  }

  func storageProvider(forAssetId assetId: String, slug: String) throws -> String? {
    try store.queue.read { db in
      try String.fetchOne(
        db,
        sql: "SELECT storage_provider FROM studio_assets WHERE tenant_slug = ? AND asset_id = ?",
        arguments: [slug, assetId]
      )
    }
  }

  func studioPhotos(for slug: String) throws -> [StudioFeedPhoto] {
    try store.queue.read { db in
      let rows = try Row.fetchAll(
        db,
        sql: """
          SELECT photos.payload AS photo_payload, studio_assets.payload AS asset_payload
          FROM studio_assets
          LEFT JOIN photos
            ON photos.tenant_slug = studio_assets.tenant_slug
           AND photos.photo_id = studio_assets.photo_id
          WHERE studio_assets.tenant_slug = ?
          ORDER BY studio_assets.created_at ASC
          """,
        arguments: [slug]
      )
      return rows.compactMap { row in
        guard let assetData = row["asset_payload"] as? Data,
              let asset = try? JSONDecoder().decode(StudioAsset.self, from: assetData)
        else { return nil }
        if let photoData = row["photo_payload"] as? Data,
           let photo = try? JSONDecoder().decode(GalleryPhoto.self, from: photoData)
        {
          let studioPhoto = GalleryPhoto(
            id: asset.id,
            title: photo.title,
            description: photo.description,
            originalUrl: photo.originalUrl,
            thumbnailUrl: photo.thumbnailUrl,
            thumbHash: photo.thumbHash,
            aspectRatio: photo.aspectRatio,
            width: photo.width,
            height: photo.height,
            format: photo.format,
            size: photo.size,
            dateTaken: photo.dateTaken,
            video: photo.video,
            tags: photo.tags,
            exif: photo.exif,
            toneAnalysis: photo.toneAnalysis,
            location: photo.location,
            camera: photo.camera,
            lens: photo.lens,
            rating: photo.rating,
            city: photo.city
          )
          return StudioFeedPhoto(photo: studioPhoto, asset: asset)
        }
        return StudioAssetDecoding.normalize(asset).map { StudioFeedPhoto(photo: $0, asset: asset) }
      }
    }
  }

  func replaceSnapshot(
    slug: String,
    tenantId: String?,
    revision: Int,
    photos: [GalleryPhoto],
    assets: [StudioAsset]
  ) throws {
    try store.queue.write { db in
      try db.execute(sql: "DELETE FROM photos WHERE tenant_slug = ?", arguments: [slug])
      try db.execute(sql: "DELETE FROM studio_assets WHERE tenant_slug = ?", arguments: [slug])
      for photo in photos {
        try insertPhoto(db, slug: slug, photo: photo, assetId: nil, published: true, revision: revision)
      }
      for asset in assets {
        try upsertAsset(db, slug: slug, asset: asset)
        if let photo = StudioAssetDecoding.normalize(asset) {
          try insertPhoto(
            db,
            slug: slug,
            photo: photo.replacingId(asset.photoId),
            assetId: asset.id,
            published: asset.syncStatus == "synced" || asset.syncStatus == "conflict",
            revision: revision
          )
        }
      }
      try upsertState(
        db,
        PhotoReplicaState(
          tenantSlug: slug,
          tenantId: tenantId,
          contiguousRevision: revision,
          needsReconcile: false,
          lastSyncedAt: Date()
        )
      )
    }
  }

  func apply(slug: String, tenantId: String?, change: PhotoChange) throws -> PhotoReplicaApplyResult {
    try store.queue.write { db in
      var state = try Row.fetchOne(db, sql: "SELECT * FROM replica_state WHERE tenant_slug = ?", arguments: [slug])
        .map(Self.state(from:))
        ?? PhotoReplicaState(
          tenantSlug: slug,
          tenantId: tenantId,
          contiguousRevision: 0,
          needsReconcile: false,
          lastSyncedAt: nil
        )

      var appliedPayload = true
      switch change.operation {
      case .upsert:
        if let photoPayload = change.photo {
          if let photo = ManifestDecoding.normalize(
            [photoPayload],
            galleryOrigin: URL(string: "https://invalid.local")!
          ).first {
            try insertPhoto(
              db,
              slug: slug,
              photo: photo,
              assetId: change.assetId,
              published: change.published,
              revision: change.revision
            )
          } else {
            appliedPayload = false
          }
        }
        if let asset = change.asset {
          try upsertAsset(db, slug: slug, asset: Self.studioAsset(from: asset, photo: change.photo))
        }
      case .delete:
        try db.execute(
          sql: "DELETE FROM photos WHERE tenant_slug = ? AND photo_id = ?",
          arguments: [slug, change.photoId]
        )
        if let assetId = change.assetId {
          try db.execute(
            sql: "DELETE FROM studio_assets WHERE tenant_slug = ? AND asset_id = ?",
            arguments: [slug, assetId]
          )
        } else {
          try db.execute(
            sql: "DELETE FROM studio_assets WHERE tenant_slug = ? AND photo_id = ?",
            arguments: [slug, change.photoId]
          )
        }
      }

      if change.revision == state.contiguousRevision + 1 {
        if !appliedPayload {
          state.needsReconcile = true
          state.tenantId = tenantId ?? state.tenantId
          try upsertState(db, state)
          return PhotoReplicaApplyResult(advancedTo: nil, needsReconcile: true)
        }
        state.contiguousRevision = change.revision
        state.needsReconcile = false
        state.lastSyncedAt = Date()
        state.tenantId = tenantId ?? state.tenantId
        try upsertState(db, state)
        return PhotoReplicaApplyResult(advancedTo: change.revision, needsReconcile: false)
      }

      if change.revision <= state.contiguousRevision {
        return PhotoReplicaApplyResult(advancedTo: nil, needsReconcile: state.needsReconcile)
      }

      state.needsReconcile = true
      state.tenantId = tenantId ?? state.tenantId
      try upsertState(db, state)
      return PhotoReplicaApplyResult(advancedTo: nil, needsReconcile: true)
    }
  }

  func markReconciled(slug: String, revision: Int) throws {
    try store.queue.write { db in
      try db.execute(
        sql: """
          INSERT INTO replica_state (tenant_slug, contiguous_revision, needs_reconcile, last_synced_at)
          VALUES (?, ?, 0, ?)
          ON CONFLICT(tenant_slug) DO UPDATE SET
            contiguous_revision = excluded.contiguous_revision,
            needs_reconcile = 0,
            last_synced_at = excluded.last_synced_at
          """,
        arguments: [slug, revision, ISO8601DateFormatter().string(from: Date())]
      )
    }
  }

  func observePublished(
    slug: String,
    onChange: @escaping @Sendable ([GalleryPhoto]) -> Void
  ) -> DatabaseCancellable {
    ValueObservation
      .tracking { db in
        let rows = try Row.fetchAll(
          db,
          sql: """
            SELECT payload FROM photos
            WHERE tenant_slug = ? AND published = 1
            ORDER BY COALESCE(date_taken, '') DESC, photo_id DESC
            """,
          arguments: [slug]
        )
        return rows.compactMap { row -> GalleryPhoto? in
          guard let payload = row["payload"] as? Data else { return nil }
          return try? JSONDecoder().decode(GalleryPhoto.self, from: payload)
        }
      }
      .start(in: store.queue, onError: { _ in }, onChange: onChange)
  }

  func observeStudio(
    slug: String,
    onChange: @escaping @Sendable ([StudioFeedPhoto]) -> Void
  ) -> DatabaseCancellable {
    ValueObservation
      .tracking { [self] db in
        try studioPhotos(in: db, slug: slug)
      }
      .start(in: store.queue, onError: { _ in }, onChange: onChange)
  }

  func wipeAll() throws {
    try store.wipeAll()
  }

  private func studioPhotos(in db: Database, slug: String) throws -> [StudioFeedPhoto] {
    let rows = try Row.fetchAll(
      db,
      sql: """
        SELECT photos.payload AS photo_payload, studio_assets.payload AS asset_payload
        FROM studio_assets
        LEFT JOIN photos
          ON photos.tenant_slug = studio_assets.tenant_slug
         AND photos.photo_id = studio_assets.photo_id
        WHERE studio_assets.tenant_slug = ?
        ORDER BY studio_assets.created_at ASC
        """,
      arguments: [slug]
    )
    return rows.compactMap { row in
      guard let assetData = row["asset_payload"] as? Data,
            let asset = try? JSONDecoder().decode(StudioAsset.self, from: assetData)
      else { return nil }
      if let photoData = row["photo_payload"] as? Data,
         let photo = try? JSONDecoder().decode(GalleryPhoto.self, from: photoData)
      {
        return StudioFeedPhoto(photo: photo.replacingId(asset.id), asset: asset)
      }
      return StudioAssetDecoding.normalize(asset).map { StudioFeedPhoto(photo: $0, asset: asset) }
    }
  }

  private func insertPhoto(
    _ db: Database,
    slug: String,
    photo: GalleryPhoto,
    assetId: String?,
    published: Bool,
    revision: Int
  ) throws {
    let encoder = JSONEncoder()
    let payload = try encoder.encode(photo)
    let tags = try encoder.encode(photo.tags)
    let coordinates = photo.coordinates
    try db.execute(
      sql: """
        INSERT INTO photos (
          tenant_slug, photo_id, asset_id, published, date_taken, latitude, longitude,
          rating, camera, lens, tags_json, payload, applied_revision
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(tenant_slug, photo_id) DO UPDATE SET
          asset_id = excluded.asset_id,
          published = excluded.published,
          date_taken = excluded.date_taken,
          latitude = excluded.latitude,
          longitude = excluded.longitude,
          rating = excluded.rating,
          camera = excluded.camera,
          lens = excluded.lens,
          tags_json = excluded.tags_json,
          payload = excluded.payload,
          applied_revision = excluded.applied_revision
        """,
      arguments: [
        slug,
        photo.id,
        assetId,
        published,
        photo.dateTaken,
        coordinates?.latitude,
        coordinates?.longitude,
        photo.rating,
        photo.camera,
        photo.lens,
        String(data: tags, encoding: .utf8) ?? "[]",
        payload,
        revision,
      ]
    )
  }

  private func upsertAsset(_ db: Database, slug: String, asset: StudioAsset) throws {
    let payload = try JSONEncoder().encode(asset)
    try db.execute(
      sql: """
        INSERT INTO studio_assets (
          tenant_slug, asset_id, photo_id, sync_status, storage_provider, storage_key,
          size, created_at, updated_at, synced_at, public_url, payload
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(tenant_slug, asset_id) DO UPDATE SET
          photo_id = excluded.photo_id,
          sync_status = excluded.sync_status,
          storage_provider = excluded.storage_provider,
          storage_key = excluded.storage_key,
          size = excluded.size,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at,
          synced_at = excluded.synced_at,
          public_url = excluded.public_url,
          payload = excluded.payload
        """,
      arguments: [
        slug,
        asset.id,
        asset.photoId,
        asset.syncStatus,
        asset.storageProvider,
        asset.storageKey,
        asset.size,
        asset.createdAt,
        asset.updatedAt,
        asset.syncedAt,
        asset.publicUrl,
        payload,
      ]
    )
  }

  private func upsertState(_ db: Database, _ state: PhotoReplicaState) throws {
    try db.execute(
      sql: """
        INSERT INTO replica_state (tenant_slug, tenant_id, contiguous_revision, needs_reconcile, last_synced_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(tenant_slug) DO UPDATE SET
          tenant_id = excluded.tenant_id,
          contiguous_revision = excluded.contiguous_revision,
          needs_reconcile = excluded.needs_reconcile,
          last_synced_at = excluded.last_synced_at
        """,
      arguments: [
        state.tenantSlug,
        state.tenantId,
        state.contiguousRevision,
        state.needsReconcile,
        state.lastSyncedAt.map { ISO8601DateFormatter().string(from: $0) },
      ]
    )
  }

  private static func state(from row: Row) -> PhotoReplicaState {
    PhotoReplicaState(
      tenantSlug: row["tenant_slug"],
      tenantId: row["tenant_id"],
      contiguousRevision: row["contiguous_revision"],
      needsReconcile: (row["needs_reconcile"] as Int) != 0,
      lastSyncedAt: (row["last_synced_at"] as String?).flatMap { ISO8601DateFormatter().date(from: $0) }
    )
  }

  private static func studioAsset(from change: PhotoChangeAsset, photo: ManifestPhoto?) -> StudioAsset {
    StudioAsset(
      id: change.id,
      photoId: change.photoId,
      storageKey: change.storageKey,
      storageProvider: change.storageProvider,
      manifest: StudioAssetManifest(
        version: "v1",
        data: photo.map(Self.manifestData) ?? [:]
      ),
      syncedAt: change.syncedAt,
      updatedAt: change.updatedAt,
      createdAt: change.createdAt,
      publicUrl: change.publicUrl,
      size: change.size,
      syncStatus: change.syncStatus
    )
  }

  private static func manifestData(_ photo: ManifestPhoto) -> [String: JSONValue] {
    var data: [String: JSONValue] = [
      "id": .string(photo.id),
      "title": .string(photo.title ?? ""),
      "description": .string(photo.description ?? ""),
    ]
    if let originalUrl = photo.originalUrl { data["originalUrl"] = .string(originalUrl) }
    if let thumbnailUrl = photo.thumbnailUrl { data["thumbnailUrl"] = .string(thumbnailUrl) }
    if let thumbHash = photo.thumbHash { data["thumbHash"] = .string(thumbHash) }
    if let width = photo.width { data["width"] = .number(width) }
    if let height = photo.height { data["height"] = .number(height) }
    if let aspectRatio = photo.aspectRatio { data["aspectRatio"] = .number(aspectRatio) }
    if let tags = photo.tags { data["tags"] = .array(tags.map(JSONValue.string)) }
    return data
  }
}

private extension GalleryPhoto {
  func replacingId(_ id: String) -> GalleryPhoto {
    GalleryPhoto(
      id: id,
      title: title,
      description: description,
      originalUrl: originalUrl,
      thumbnailUrl: thumbnailUrl,
      thumbHash: thumbHash,
      aspectRatio: aspectRatio,
      width: width,
      height: height,
      format: format,
      size: size,
      dateTaken: dateTaken,
      video: video,
      tags: tags,
      exif: exif,
      toneAnalysis: toneAnalysis,
      location: location,
      camera: camera,
      lens: lens,
      rating: rating,
      city: city
    )
  }
}
