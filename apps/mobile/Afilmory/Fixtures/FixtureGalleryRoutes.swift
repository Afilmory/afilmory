#if DEBUG
  import Foundation

  enum FixtureGalleryRoutes {
    private static let timelinePhotoCap = 12

    static func respond(_ request: FixtureRequest) -> FixtureResponse? {
      let state = request.state
      if request.match("GET", "gallery-directory") != nil {
        let data = state.read { $0 }
        return FixtureReply.json(["galleries": directory(data, query: request.query["q"] ?? "", limit: request.int("limit", default: 20))])
      }
      if request.match("GET", "gallery-subscriptions") != nil {
        let data = state.read { $0 }
        guard data.signedIn else { return FixtureReply.unauthorized }
        return FixtureReply.json(["subscriptions": subscriptions(data)])
      }
      if request.match("GET", "gallery-subscriptions/timeline") != nil {
        let data = state.read { $0 }
        guard data.signedIn else { return FixtureReply.unauthorized }
        let timeZone = request.query["timeZone"].flatMap(TimeZone.init(identifier:)) ?? .current
        return FixtureReply.json(timeline(
          data,
          timeZone: timeZone,
          limit: request.int("limit", default: 20),
          cursor: request.query["cursor"]
        ))
      }
      if let captures = request.match("PUT", "gallery-subscriptions/:tenantId") {
        return subscribe(request, tenantId: captures[0])
      }
      if let captures = request.match("DELETE", "gallery-subscriptions/:tenantId") {
        guard state.read(\.signedIn) else { return FixtureReply.unauthorized }
        state.mutate { $0.subscriptions.removeAll { $0.tenantId == captures[0] } }
        return FixtureReply.json(["tenantId": captures[0], "subscribed": false])
      }
      return nil
    }

    private static func subscribe(_ request: FixtureRequest, tenantId: String) -> FixtureResponse {
      guard request.state.read(\.signedIn) else { return FixtureReply.unauthorized }
      guard let gallery = FixtureCatalog.shared.gallery(tenantId: tenantId) else {
        return FixtureReply.error(404, "Gallery not found", code: "NOT_FOUND")
      }
      guard !gallery.isOwn else {
        return FixtureReply.error(400, "You cannot follow your own gallery", code: "SELF_SUBSCRIPTION")
      }
      let createdAt = request.state.mutate { data -> Date in
        if let existing = data.subscriptions.first(where: { $0.tenantId == tenantId }) {
          return existing.createdAt
        }
        let now = Date()
        data.subscriptions.insert((tenantId, now), at: 0)
        return now
      }
      return FixtureReply.json([
        "id": "subscription-\(gallery.slug)",
        "userId": FixtureCatalog.shared.owner.id,
        "tenantId": tenantId,
        "createdAt": FixtureClock.iso(createdAt),
        "subscribed": true,
      ])
    }

    static func directory(_ data: FixtureStateData, query: String, limit: Int) -> [[String: Any]] {
      let needle = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
      let subscribed = Set(data.subscriptions.map(\.tenantId))
      let galleries = FixtureCatalog.shared.galleries.filter { gallery in
        guard FixtureLibrary.photoCount(gallery, data) > 0 else { return false }
        guard !needle.isEmpty else { return true }
        let haystack = ([gallery.name, gallery.slug, gallery.author.name, gallery.description] + gallery.tags)
          .joined(separator: " ")
          .lowercased()
        return haystack.contains(needle)
      }
      return galleries
        .sorted { (FixtureLibrary.lastUpload($0, data) ?? .distantPast) > (FixtureLibrary.lastUpload($1, data) ?? .distantPast) }
        .prefix(max(limit, 0))
        .map { gallery in
          [
            "id": gallery.tenantId,
            "name": gallery.name,
            "slug": gallery.slug,
            "domain": orNull(gallery.isOwn ? data.domains.first?.domain : nil),
            "description": gallery.description,
            "author": FixtureLibrary.author(gallery),
            "photoCount": FixtureLibrary.photoCount(gallery, data),
            "isSubscribed": data.signedIn && subscribed.contains(gallery.tenantId),
            "isOwnGallery": data.signedIn && gallery.isOwn,
            "tags": gallery.tags,
            "createdAt": gallery.createdAt,
            "lastUpload": orNull(FixtureLibrary.lastUpload(gallery, data).map(FixtureClock.iso)),
          ] as [String: Any]
        }
    }

    static func subscriptions(_ data: FixtureStateData) -> [[String: Any]] {
      data.subscriptions.compactMap { entry in
        guard let gallery = FixtureCatalog.shared.gallery(tenantId: entry.tenantId) else { return nil }
        let lastUpload = FixtureLibrary.lastUpload(gallery, data) ?? entry.createdAt
        return [
          "createdAt": FixtureClock.iso(entry.createdAt),
          "tenantId": gallery.tenantId,
          "gallery": [
            "id": gallery.tenantId,
            "name": gallery.name,
            "slug": gallery.slug,
            "domain": NSNull(),
            "author": FixtureLibrary.author(gallery),
            "lastUpload": FixtureClock.iso(lastUpload),
            "photoCount": FixtureLibrary.photoCount(gallery, data),
          ] as [String: Any],
          "recentPhotos": FixtureLibrary.recentPreviews(gallery, data, limit: 6),
        ]
      }
    }

    static func timeline(_ data: FixtureStateData, timeZone: TimeZone, limit: Int, cursor: String?) -> [String: Any] {
      let catalog = FixtureCatalog.shared
      var events: [(latestAt: Date, event: [String: Any])] = []
      for entry in data.subscriptions {
        guard let gallery = catalog.gallery(tenantId: entry.tenantId) else { continue }
        for upload in gallery.uploads {
          let photos = upload.photoIds.enumerated().compactMap { position, baseId -> [String: Any]? in
            catalog.photo(baseId, in: gallery).map {
              FixtureLibrary.preview($0, syncedAt: catalog.uploadedAt(upload, position: position))
            }
          }
          guard !photos.isEmpty else { continue }
          let latestAt = catalog.uploadedAt(upload, position: 0)
          let day = FixtureClock.day(latestAt, timeZone: timeZone)
          events.append((latestAt, [
            "id": "\(gallery.tenantId):\(day)",
            "tenantId": gallery.tenantId,
            "day": day,
            "latestAt": FixtureClock.iso(latestAt),
            "totalCount": photos.count,
            "photos": Array(photos.prefix(timelinePhotoCap)),
            "gallery": [
              "id": gallery.tenantId,
              "name": gallery.name,
              "slug": gallery.slug,
              "author": FixtureLibrary.author(gallery),
            ] as [String: Any],
          ]))
        }
      }
      let sorted = events.sorted { $0.latestAt > $1.latestAt }.map(\.event)
      let offset = cursor.flatMap { Int($0.replacingOccurrences(of: "offset:", with: "")) } ?? 0
      let pageSize = max(limit, 1)
      let page = Array(sorted.dropFirst(offset).prefix(pageSize))
      let next = offset + page.count < sorted.count ? "offset:\(offset + page.count)" : nil
      return ["events": page, "nextCursor": orNull(next)]
    }
  }
#endif
