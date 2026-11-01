#if DEBUG
  import Foundation

  enum FixtureStudioRoutes {
    static func respond(_ request: FixtureRequest) -> FixtureResponse? {
      let isStudioRoute = ["dashboard", "data-sync", "site", "tenant"].contains(request.segments.first ?? "")
      guard isStudioRoute else { return nil }
      if let denied = FixtureManifestRoutes.ownerGuard(request) { return denied }
      let state = request.state
      if request.match("GET", "dashboard/overview") != nil {
        return FixtureReply.json(overview(state.read { $0 }))
      }
      if request.match("GET", "dashboard/analytics") != nil {
        return FixtureReply.json(analytics(state.read { $0 }))
      }
      if request.match("GET", "data-sync/status") != nil {
        return FixtureReply.json(["lastRun": orNull(state.read(\.lastSyncRun).map(syncRun))])
      }
      if request.match("GET", "data-sync/conflicts") != nil {
        return FixtureReply.json(state.read(\.conflicts).map(conflict))
      }
      if let captures = request.match("POST", "data-sync/conflicts/:id/resolve") {
        let resolved = state.mutate { data -> Bool in
          let before = data.conflicts.count
          data.conflicts.removeAll { $0.id == captures[0] }
          return before != data.conflicts.count
        }
        return resolved
          ? FixtureReply.json(["resolved": true, "strategy": request.string("strategy") ?? "prefer-storage"])
          : FixtureReply.error(404, "Conflict not found", code: "NOT_FOUND")
      }
      if request.match("POST", "data-sync/run") != nil {
        return runSync(request)
      }
      if request.match("GET", "site/settings/ui-schema") != nil {
        return FixtureReply.json(["schema": FixtureSiteSchema.schema, "values": state.read(\.siteValues)])
      }
      if request.match("POST", "site/settings") != nil {
        let entries = request.body["entries"] as? [[String: Any]] ?? []
        state.mutate { data in
          for entry in entries {
            guard let key = entry["key"] as? String, let value = entry["value"] as? String else { continue }
            data.siteValues[key] = value
          }
        }
        return FixtureReply.json(["updated": entries.count])
      }
      return FixtureDomainRoutes.respond(request)
    }

    static func overview(_ data: FixtureStateData) -> [String: Any] {
      let photos = FixtureLibrary.ownPhotos(data)
      let calendar = Calendar.current
      let now = Date()
      let thisMonth = photos.filter { calendar.isDate($0.uploadedAt, equalTo: now, toGranularity: .month) }.count
      return [
        "stats": [
          "totalPhotos": photos.count,
          "totalStorageBytes": Int64(photos.reduce(0) { $0 + $1.size }),
          "thisMonthUploads": thisMonth,
          "sync": ["pending": 0, "conflicts": data.conflicts.count],
        ] as [String: Any],
        "recentActivity": photos.sorted { $0.uploadedAt > $1.uploadedAt }.prefix(5).map { photo in
          [
            "id": photo.assetId,
            "title": photo.photo["title"] ?? photo.baseId,
            "createdAt": FixtureClock.iso(photo.uploadedAt),
            "storageProvider": "s3",
            "syncStatus": data.conflicts.contains { $0.photoId == photo.baseId } ? "conflict" : "synced",
          ] as [String: Any]
        },
      ]
    }

    static func analytics(_ data: FixtureStateData) -> [String: Any] {
      let photos = FixtureLibrary.ownPhotos(data)
      let calendar = Calendar.current
      let now = Date()
      let months = (0..<6).reversed().compactMap { calendar.date(byAdding: .month, value: -$0, to: now) }
      let trends = months.map { month in
        [
          "month": FixtureClock.month(month),
          "uploads": photos.filter { calendar.isDate($0.uploadedAt, equalTo: month, toGranularity: .month) }.count,
        ] as [String: Any]
      }
      let previous = calendar.date(byAdding: .month, value: -1, to: now) ?? now
      func bytes(in month: Date) -> Double {
        photos.filter { calendar.isDate($0.uploadedAt, equalTo: month, toGranularity: .month) }.reduce(0) { $0 + $1.size }
      }
      let totalBytes = photos.reduce(0) { $0 + $1.size }
      var tagCounts: [String: Int] = [:]
      var deviceCounts: [String: Int] = [:]
      for photo in photos {
        photo.tags.forEach { tagCounts[$0, default: 0] += 1 }
        let exif = photo.photo["exif"] as? [String: Any]
        let make = exif?["Make"] as? String ?? ""
        let model = exif?["Model"] as? String ?? ""
        let device = model.lowercased().hasPrefix(make.lowercased()) ? model : "\(make) \(model)"
        if !device.trimmingCharacters(in: .whitespaces).isEmpty {
          deviceCounts[device, default: 0] += 1
        }
      }
      return [
        "uploadTrends": trends,
        "storageUsage": [
          "totalBytes": totalBytes,
          "totalPhotos": photos.count,
          "currentMonthBytes": bytes(in: now),
          "previousMonthBytes": bytes(in: previous),
          "providers": photos.isEmpty ? [[String: Any]]() : [["provider": "s3", "bytes": totalBytes, "photoCount": photos.count]],
        ] as [String: Any],
        "popularTags": ranked(tagCounts, key: "tag"),
        "topDevices": ranked(deviceCounts, key: "device"),
      ]
    }

    private static func ranked(_ counts: [String: Int], key: String) -> [[String: Any]] {
      counts.sorted { $0.value == $1.value ? $0.key < $1.key : $0.value > $1.value }
        .prefix(8)
        .map { [key: $0.key, "count": $0.value] }
    }

    static func syncRun(_ run: FixtureSyncRun) -> [String: Any] {
      [
        "id": run.id,
        "dryRun": run.dryRun,
        "summary": summary(updated: run.updated, conflicts: run.conflicts),
        "actionsCount": run.updated + run.conflicts,
        "startedAt": FixtureClock.iso(run.startedAt),
        "completedAt": FixtureClock.iso(run.completedAt),
      ]
    }

    private static func summary(updated: Int, conflicts: Int, total: Int = 18) -> [String: Any] {
      [
        "storageObjects": total,
        "databaseRecords": total,
        "inserted": 0,
        "updated": updated,
        "deleted": 0,
        "conflicts": conflicts,
        "skipped": max(total - updated - conflicts, 0),
        "errors": 0,
      ]
    }

    private static func conflict(_ conflict: FixtureConflict) -> [String: Any] {
      [
        "id": conflict.id,
        "storageKey": conflict.storageKey,
        "photoId": orNull(conflict.photoId),
        "reason": conflict.reason,
        "storageProvider": "s3",
        "updatedAt": FixtureClock.iso(conflict.updatedAt),
      ]
    }

    private static func runSync(_ request: FixtureRequest) -> FixtureResponse {
      let dryRun = request.body["dryRun"] as? Bool ?? false
      let data = request.state.read { $0 }
      let total = FixtureLibrary.ownPhotos(data).count
      let conflicts = data.conflicts.count
      let finalSummary = summary(updated: 0, conflicts: conflicts, total: total)
      if !dryRun {
        let now = Date()
        request.state.mutate {
          $0.lastSyncRun = FixtureSyncRun(id: "sync-run-\(Int(now.timeIntervalSince1970))", dryRun: false, startedAt: now, completedAt: now, updated: 0, conflicts: conflicts)
        }
      }
      var frames: [(event: String, data: Any)] = [
        ("progress", ["type": "stage", "payload": ["processed": 0, "total": max(total, 1)]]),
        ("progress", ["type": "log", "payload": ["message": "Scanning storage…"]]),
      ]
      for index in stride(from: 0, to: total, by: 6) {
        frames.append(("progress", ["type": "action", "payload": ["index": index + 1, "total": total]]))
      }
      frames.append(("progress", ["type": "stage", "payload": ["processed": total, "total": max(total, 1)]]))
      frames.append(("progress", ["type": "complete", "payload": ["summary": finalSummary]]))
      return FixtureReply.eventStream(frames)
    }
  }
#endif
