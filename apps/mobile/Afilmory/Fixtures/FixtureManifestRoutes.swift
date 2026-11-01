#if DEBUG
  import Foundation

  enum FixtureManifestRoutes {
    private static let otherGalleryRevision = 7

    static func gallery(for request: FixtureRequest) -> FixtureGallery? {
      FixtureCatalog.shared.gallery(slug: request.tenantSlug ?? FixtureCatalog.ownSlug)
    }

    static func ownerGuard(_ request: FixtureRequest) -> FixtureResponse? {
      guard request.state.read(\.signedIn) else { return FixtureReply.unauthorized }
      guard gallery(for: request)?.isOwn == true else { return FixtureReply.forbidden }
      return nil
    }

    static func respond(_ request: FixtureRequest) -> FixtureResponse? {
      if request.match("GET", "manifest/snapshot") != nil {
        guard let gallery = gallery(for: request) else { return notFound }
        let data = request.state.read { $0 }
        return FixtureReply.json([
          "revision": gallery.isOwn ? data.revision : otherGalleryRevision,
          "manifest": ["version": FixtureCatalog.manifestVersion, "data": FixtureLibrary.photos(in: gallery, data)],
        ])
      }
      if request.match("GET", "manifest/changes") != nil {
        guard let gallery = gallery(for: request) else { return notFound }
        let after = request.int("after", default: 0)
        guard gallery.isOwn else {
          return FixtureReply.json(["revision": otherGalleryRevision, "expired": false, "changes": [Any]()])
        }
        let data = request.state.read { $0 }
        let changes = data.changes.filter { ($0["revision"] as? Int ?? 0) > after }
        return FixtureReply.json(["revision": data.revision, "expired": false, "changes": changes])
      }
      if request.match("GET", "manifest/events") != nil {
        return FixtureReply.idleEventStream
      }
      if request.match("GET", "manifest/photos") != nil {
        guard let gallery = gallery(for: request) else { return notFound }
        let ids = (request.query["ids"] ?? "").split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
        guard !ids.isEmpty else { return FixtureReply.error(400, "ids must contain at least one id", code: "VALIDATION_ERROR") }
        let photos = FixtureLibrary.photos(in: gallery, request.state.read { $0 })
        let byId = Dictionary(photos.compactMap { photo in (photo["id"] as? String).map { ($0, photo) } }) { first, _ in first }
        return FixtureReply.json(ids.compactMap { byId[$0] })
      }
      if request.match("POST", "manifest/photos/search") != nil {
        guard let gallery = gallery(for: request) else { return notFound }
        let limit = request.body["limit"] as? Int ?? 20
        let ascending = request.string("sort") == "asc"
        let photos = FixtureLibrary.photos(in: gallery, request.state.read { $0 }).sorted {
          let left = $0["dateTaken"] as? String ?? ""
          let right = $1["dateTaken"] as? String ?? ""
          return ascending ? left < right : left > right
        }
        return FixtureReply.json(["data": Array(photos.prefix(max(limit, 0)))])
      }
      if request.match("GET", "photos/assets") != nil {
        if let denied = ownerGuard(request) { return denied }
        let photos = FixtureLibrary.ownPhotos(request.state.read { $0 })
        return FixtureReply.json(photos.map(FixtureLibrary.studioAsset))
      }
      if let captures = request.match("PATCH", "photos/assets/:assetId/tags") {
        if let denied = ownerGuard(request) { return denied }
        return updateTags(request, assetId: captures[0])
      }
      if request.match("DELETE", "photos/assets") != nil {
        if let denied = ownerGuard(request) { return denied }
        return deleteAssets(request)
      }
      return FixtureReactionRoutes.respond(request)
    }

    private static var notFound: FixtureResponse {
      FixtureReply.error(404, "Gallery not found", code: "TENANT_NOT_FOUND")
    }

    private static func updateTags(_ request: FixtureRequest, assetId: String) -> FixtureResponse {
      let baseId = assetId.hasPrefix("asset-") ? String(assetId.dropFirst("asset-".count)) : assetId
      let tags = (request.body["tags"] as? [String] ?? []).map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
      let change = request.state.mutate { data -> [String: Any]? in
        guard data.hasLibrary,
              !data.deletedPhotoIds.contains(baseId),
              FixtureCatalog.shared.basePhoto(baseId) != nil
        else { return nil }
        data.tagOverrides[baseId] = tags
        data.revision += 1
        let photo = FixtureLibrary.ownPhotos(data).first { $0.baseId == baseId }
        let change = FixtureLibrary.manifestChange(operation: "upsert", photo: photo, baseId: baseId, revision: data.revision)
        data.changes.append(change)
        return change
      }
      guard let change else { return FixtureReply.error(404, "Photo asset not found", code: "NOT_FOUND") }
      return FixtureReply.json(["change": change])
    }

    private static func deleteAssets(_ request: FixtureRequest) -> FixtureResponse {
      let ids = request.body["ids"] as? [String] ?? []
      let changes = request.state.mutate { data -> [[String: Any]] in
        var changes: [[String: Any]] = []
        for id in ids {
          let baseId = id.hasPrefix("asset-") ? String(id.dropFirst("asset-".count)) : id
          guard data.hasLibrary,
                FixtureCatalog.shared.basePhoto(baseId) != nil,
                data.deletedPhotoIds.insert(baseId).inserted
          else { continue }
          data.revision += 1
          let change = FixtureLibrary.manifestChange(operation: "delete", photo: nil, baseId: baseId, revision: data.revision)
          data.changes.append(change)
          changes.append(change)
        }
        return changes
      }
      return FixtureReply.json(["deleted": changes.count, "changes": changes])
    }
  }

  enum FixtureReactionRoutes {
    static func respond(_ request: FixtureRequest) -> FixtureResponse? {
      if request.match("GET", "reactions") != nil {
        guard let refKey = request.query["refKey"], !refKey.isEmpty else {
          return FixtureReply.error(400, "refKey is required", code: "VALIDATION_ERROR")
        }
        return FixtureReply.json(["data": ["refKey": refKey, "reactions": counts(request, refKey: refKey)]])
      }
      if request.match("GET", "reactions/stats") != nil {
        return FixtureReply.json(counts(request, refKey: request.query["refKey"] ?? ""))
      }
      if request.match("POST", "reactions/add") != nil {
        guard let refKey = request.string("refKey"),
              let reaction = request.string("reaction"),
              PhotoReaction(rawValue: reaction) != nil
        else { return FixtureReply.error(400, "Invalid reaction", code: "VALIDATION_ERROR") }
        let count = max(1, min(request.body["count"] as? Int ?? 1, 99))
        let key = storageKey(request, refKey: refKey)
        let seed = seeded(refKey)
        request.state.mutate { data in
          var current = data.photoReactions[key] ?? seed
          current[reaction, default: 0] += count
          data.photoReactions[key] = current
        }
        return FixtureReply.json(["success": true])
      }
      return nil
    }

    static func counts(_ request: FixtureRequest, refKey: String) -> [String: Int] {
      let key = storageKey(request, refKey: refKey)
      return request.state.read { $0.photoReactions[key] } ?? seeded(refKey)
    }

    private static func storageKey(_ request: FixtureRequest, refKey: String) -> String {
      "\(request.tenantSlug ?? FixtureCatalog.ownSlug):\(refKey)"
    }

    static func seeded(_ refKey: String) -> [String: Int] {
      let reactions = PhotoReaction.allCases.map(\.rawValue)
      var counts: [String: Int] = [:]
      for (offset, reaction) in reactions.enumerated() {
        let value = FixtureClock.stableNumber("\(refKey)#\(offset)", modulo: 14) - 6
        if value > 0 {
          counts[reaction] = value
        }
      }
      return counts
    }
  }
#endif
