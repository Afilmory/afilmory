#if DEBUG
  @testable import Afilmory
  import XCTest

  final class FixtureBackendTests: XCTestCase {
    private let signedInScenarios: [FixtureScenario] = [.owner, .newcomer, .empty, .offline]

    override func setUp() {
      super.setUp()
      FixtureBackend.resetState()
    }

    func testSessionResolvesPerScenario() throws {
      for scenario in signedInScenarios {
        let response = try fixtureDecode(AfilmorySessionResponse.self, FixtureHost.platform + "/auth/session", scenario: scenario)
        let session = try XCTUnwrap(response.resolved(), scenario.rawValue)
        XCTAssertEqual(session.user.name, "Innei")
        XCTAssertEqual(session.activeWorkspace?.slug, "innei")
        XCTAssertEqual(session.activeMembership?.role, "owner")
        XCTAssertTrue(session.hasUsableWorkspace)
      }
      let visitor = try fixtureDecode(AfilmorySessionResponse.self, FixtureHost.platform + "/auth/session", scenario: .visitor)
      XCTAssertNil(visitor.resolved())
      let optional = try APIResponseDecoding.decode(
        AfilmorySessionResponse?.self,
        from: fixtureSend("GET", FixtureHost.platform + "/auth/session", scenario: .visitor).body
      )
      XCTAssertNil(optional?.resolved())
    }

    func testRoutesIgnoreHostForPlatformEndpoints() throws {
      let response = try fixtureDecode(AfilmorySessionResponse.self, FixtureHost.production + "/auth/session", scenario: .owner)
      XCTAssertNotNil(response.resolved())
    }

    func testGalleryDirectoryIsPopulatedForEveryScenario() throws {
      for scenario in FixtureScenario.allCases {
        let envelope = try fixtureDecode(
          FeaturedGalleriesEnvelope.self, FixtureHost.platform + "/gallery-directory?limit=24", scenario: scenario
        )
        XCTAssertGreaterThanOrEqual(envelope.galleries.count, 6, scenario.rawValue)
        XCTAssertTrue(envelope.galleries.allSatisfy { $0.author?.avatar != nil && $0.photoCount > 0 })
      }
      let owner = try fixtureDecode(FeaturedGalleriesEnvelope.self, FixtureHost.platform + "/gallery-directory?limit=24", scenario: .owner)
      XCTAssertEqual(owner.galleries.filter(\.isSubscribed).count, 3)
      XCTAssertEqual(owner.galleries.filter(\.isOwnGallery).map(\.slug), ["innei"])
      let search = try fixtureDecode(
        FeaturedGalleriesEnvelope.self, FixtureHost.platform + "/gallery-directory?q=%E5%A4%9C&limit=24", scenario: .owner
      )
      XCTAssertEqual(search.galleries.map(\.slug), ["nightwalker"])
    }

    func testSubscriptionsAndTimelinePerScenario() throws {
      let timelinePath = FixtureHost.platform + "/gallery-subscriptions/timeline?timeZone=Asia/Shanghai&limit=20"
      let owner = try fixtureDecode(GallerySubscriptionListResponse.self, FixtureHost.platform + "/gallery-subscriptions", scenario: .owner)
      XCTAssertEqual(owner.subscriptions.count, 3)
      XCTAssertTrue(owner.subscriptions.allSatisfy { !$0.recentPhotos.isEmpty && $0.gallery.author?.avatar != nil })
      let timeline = try fixtureDecode(GalleryTimelineResponse.self, timelinePath, scenario: .owner)
      XCTAssertGreaterThanOrEqual(timeline.events.count, 5)
      XCTAssertGreaterThanOrEqual(Set(timeline.events.map(\.day)).count, 4)
      XCTAssertEqual(timeline.events.map(\.latestAt), timeline.events.map(\.latestAt).sorted(by: >))
      XCTAssertEqual(Set(timeline.events.map(\.tenantId)), Set(owner.subscriptions.map(\.tenantId)))

      let paged = try fixtureDecode(GalleryTimelineResponse.self, timelinePath.replacingOccurrences(of: "limit=20", with: "limit=2"), scenario: .owner)
      XCTAssertEqual(paged.events.count, 2)
      let cursor = try XCTUnwrap(paged.nextCursor)
      let next = try fixtureDecode(GalleryTimelineResponse.self, timelinePath + "&cursor=\(cursor)", scenario: .owner)
      XCTAssertEqual(next.events.first?.id, timeline.events[2].id)

      let firstPage = try XCTUnwrap(timeline.nextCursor)
      let secondPage = try fixtureDecode(GalleryTimelineResponse.self, timelinePath + "&cursor=\(firstPage)", scenario: .owner)
      XCTAssertFalse(secondPage.events.isEmpty)
      XCTAssertTrue(Set(secondPage.events.map(\.id)).isDisjoint(with: timeline.events.map(\.id)))
      let allEvents = timeline.events + secondPage.events
      XCTAssertEqual(Set(allEvents.map(\.id)).count, allEvents.count)
      let previewIds = allEvents.flatMap { $0.photos.map(\.id) }
      XCTAssertEqual(Set(previewIds).count, previewIds.count)

      for scenario in [FixtureScenario.newcomer, .empty] {
        let list = try fixtureDecode(GallerySubscriptionListResponse.self, FixtureHost.platform + "/gallery-subscriptions", scenario: scenario)
        XCTAssertTrue(list.subscriptions.isEmpty)
        let events = try fixtureDecode(GalleryTimelineResponse.self, timelinePath, scenario: scenario)
        XCTAssertTrue(events.events.isEmpty)
        XCTAssertNil(events.nextCursor)
      }
      XCTAssertEqual(fixtureSend("GET", FixtureHost.platform + "/gallery-subscriptions", scenario: .visitor).status, 401)
    }

    func testPreviewIdsResolveThroughManifestPhotos() throws {
      let timeline = try fixtureDecode(
        GalleryTimelineResponse.self, FixtureHost.platform + "/gallery-subscriptions/timeline?timeZone=UTC&limit=50", scenario: .owner
      )
      let subscriptions = try fixtureDecode(GallerySubscriptionListResponse.self, FixtureHost.platform + "/gallery-subscriptions", scenario: .owner)
      var requests = timeline.events.map { ($0.gallery.slug, $0.photos.map(\.id)) }
      requests += subscriptions.subscriptions.map { ($0.gallery.slug, $0.recentPhotos.map(\.id)) }
      for (slug, ids) in requests {
        let joined = ids.joined(separator: ",").addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed)!
        let photos = try fixtureDecode([ManifestPhoto].self, FixtureHost.tenant(slug) + "/manifest/photos?ids=\(joined)", scenario: .owner)
        XCTAssertEqual(photos.map(\.id), ids, slug)
      }
      let own = try fixtureDecode([ManifestPhoto].self, FixtureHost.tenant() + "/manifest/photos?ids=DSC_7132,missing", scenario: .visitor)
      XCTAssertEqual(own.map(\.id), ["DSC_7132"])
      XCTAssertEqual(fixtureSend("GET", FixtureHost.tenant() + "/manifest/photos?ids=", scenario: .owner).status, 400)
    }

    func testOwnManifestSnapshotPerScenario() throws {
      let expected: [FixtureScenario: Int] = [.owner: 18, .newcomer: 18, .empty: 0, .visitor: 18, .offline: 18]
      for (scenario, count) in expected {
        let snapshot = try fixtureDecode(ManifestSnapshotResponse.self, FixtureHost.tenant() + "/manifest/snapshot", scenario: scenario)
        let photos = ManifestDecoding.normalize(snapshot.manifest.data, galleryOrigin: URL(string: "http://innei.localhost:1841")!)
        XCTAssertEqual(photos.count, count, scenario.rawValue)
        XCTAssertTrue(photos.allSatisfy { $0.thumbnailUrl.contains(FixtureMode.host) && $0.thumbHash != nil })
        let changes = try fixtureDecode(
          ManifestChangesResponse.self, FixtureHost.tenant() + "/manifest/changes?after=\(snapshot.revision)", scenario: scenario
        )
        XCTAssertEqual(changes.revision, snapshot.revision)
        XCTAssertTrue(changes.changes.isEmpty)
      }
      let snapshot = try fixtureDecode(ManifestSnapshotResponse.self, FixtureHost.tenant() + "/manifest/snapshot", scenario: .owner)
      let robin = try XCTUnwrap(snapshot.manifest.data.first { $0.id == "DSC_7132" })
      XCTAssertEqual(robin.tags ?? [], ["旅鸫", "bird"])
      XCTAssertEqual(robin.exif?.value["Model"]?.string, "NIKON Z f")
      XCTAssertEqual(robin.originalUrl, FixtureMode.mediaURL("DSC_7132.jpg").absoluteString)
      XCTAssertEqual(robin.thumbnailUrl, FixtureMode.mediaURL("thumb-DSC_7132.jpg").absoluteString)
    }

    func testEveryDirectoryGalleryServesADistinctManifest() throws {
      let envelope = try fixtureDecode(FeaturedGalleriesEnvelope.self, FixtureHost.platform + "/gallery-directory?limit=24", scenario: .visitor)
      var seenIds = Set<String>()
      for gallery in envelope.galleries {
        let snapshot = try fixtureDecode(ManifestSnapshotResponse.self, FixtureHost.tenant(gallery.slug) + "/manifest/snapshot", scenario: .visitor)
        XCTAssertEqual(snapshot.manifest.data.count, gallery.photoCount, gallery.slug)
        for photo in snapshot.manifest.data {
          XCTAssertTrue(seenIds.insert(photo.id).inserted, "duplicate id \(photo.id)")
        }
        let covers = try fixtureDecode(
          ManifestEnvelope.self, "POST", FixtureHost.tenant(gallery.slug) + "/manifest/photos/search",
          body: ["limit": 5, "sort": "desc"], scenario: .visitor
        )
        XCTAssertEqual(covers.data.count, min(5, gallery.photoCount))
        _ = try fixtureDecode(ManifestChangesResponse.self, FixtureHost.tenant(gallery.slug) + "/manifest/changes?after=0", scenario: .visitor)
      }
      XCTAssertEqual(fixtureSend("GET", FixtureHost.tenant("nobody") + "/manifest/snapshot", scenario: .owner).status, 404)
    }

    func testStudioLibraryAssetsPerScenario() throws {
      for (scenario, count) in [(FixtureScenario.owner, 18), (.newcomer, 18), (.empty, 0)] {
        let response = fixtureSend("GET", FixtureHost.tenant() + "/photos/assets", scenario: scenario)
        XCTAssertEqual(response.status, 200)
        let assets = try StudioAssetDecoding.decode(response.body)
        XCTAssertEqual(StudioAssetDecoding.normalize(assets).count, count, scenario.rawValue)
      }
      XCTAssertEqual(fixtureSend("GET", FixtureHost.tenant() + "/photos/assets", scenario: .visitor).status, 401)
      XCTAssertEqual(fixtureSend("GET", FixtureHost.tenant("birdline") + "/photos/assets", scenario: .owner).status, 403)
    }

    func testCommentsPerScenario() throws {
      let list = try fixtureDecode(CommentPage.self, FixtureHost.tenant() + "/comments?photoId=DSC_7132&limit=20", scenario: .visitor)
      XCTAssertEqual(list.comments.count, 3)
      XCTAssertNotNil(list.relations["comment-robin-lin"])
      XCTAssertTrue(list.comments.allSatisfy { list.users[$0.userId] != nil })
      let count = try fixtureDecode(FixtureCountMirror.self, FixtureHost.tenant() + "/comments/count?photoId=DSC_7132", scenario: .owner)
      XCTAssertEqual(count.count, 3)

      let pendingPath = FixtureHost.tenant() + "/comments/all?limit=20&status=pending"
      let pending = try fixtureDecode(StudioCommentsPage.self, pendingPath, scenario: .owner)
      XCTAssertEqual(pending.comments.count, 3)
      XCTAssertTrue(pending.comments.allSatisfy { $0.status == "pending" })
      XCTAssertEqual(try fixtureDecode(StudioPendingCommentsPage.self, pendingPath, scenario: .owner).comments.count, 3)
      let all = try fixtureDecode(StudioCommentsPage.self, FixtureHost.tenant() + "/comments/all?limit=20", scenario: .owner)
      XCTAssertGreaterThan(all.comments.count, pending.comments.count)
      XCTAssertTrue(try fixtureDecode(StudioCommentsPage.self, pendingPath, scenario: .empty).comments.isEmpty)
    }

    func testStudioHomeDataPerScenario() throws {
      for scenario in signedInScenarios {
        let overview = try fixtureDecode(StudioDashboardOverview.self, FixtureHost.tenant() + "/dashboard/overview", scenario: scenario)
        let isEmpty = scenario == .empty
        XCTAssertEqual(overview.stats.totalPhotos, isEmpty ? 0 : 18)
        XCTAssertEqual(overview.stats.totalStorageBytes > 0, !isEmpty)
        XCTAssertEqual(overview.recentActivity.count, isEmpty ? 0 : 5)
        if isEmpty {
          XCTAssertEqual(overview.stats.thisMonthUploads, 0)
        }
        let sync = try fixtureDecode(StudioDataSyncStatus.self, FixtureHost.tenant() + "/data-sync/status", scenario: scenario)
        XCTAssertEqual(sync.lastRun == nil, isEmpty)
        let status = try fixtureDecode(StudioDataSyncStatusResponse.self, FixtureHost.tenant() + "/data-sync/status", scenario: scenario)
        XCTAssertEqual(status.lastRun?.summary.conflicts, isEmpty ? nil : 1)
        let conflicts = try fixtureDecode([StudioDataSyncConflictRecord].self, FixtureHost.tenant() + "/data-sync/conflicts", scenario: scenario)
        XCTAssertEqual(conflicts.count, isEmpty ? 0 : 1)
        let analytics = try fixtureDecode(StudioAnalyticsResponse.self, FixtureHost.tenant() + "/dashboard/analytics", scenario: scenario)
        XCTAssertEqual(analytics.uploadTrends.count, 6)
        XCTAssertEqual(analytics.storageUsage.totalPhotos, isEmpty ? 0 : 18)
        XCTAssertEqual(analytics.topDevices.isEmpty, isEmpty)
        XCTAssertEqual(analytics.popularTags.isEmpty, isEmpty)
        let site = try fixtureDecode(StudioSiteSchemaResponse.self, FixtureHost.tenant() + "/site/settings/ui-schema", scenario: scenario)
        XCTAssertEqual(site.schema.sections.count, 4)
        XCTAssertNotNil(site.values["site.accentColor"] ?? nil)
        let domains = try fixtureDecode(StudioDomainListing.self, FixtureHost.tenant() + "/tenant/domains", scenario: scenario)
        XCTAssertEqual(domains.domains.count, isEmpty ? 0 : 1)
        XCTAssertEqual(domains.customDomainLimit, 1)
      }
      XCTAssertEqual(fixtureSend("GET", FixtureHost.tenant() + "/dashboard/overview", scenario: .visitor).status, 401)
    }

    func testBillingPerScenario() throws {
      let owner = try fixtureDecode(BillingOverview.self, FixtureHost.tenant() + "/billing/overview", scenario: .owner)
      XCTAssertEqual(owner.dimensions.filter(\.nearingLimit).map(\.reason), ["library_items"])
      let empty = try fixtureDecode(BillingOverview.self, FixtureHost.tenant() + "/billing/overview", scenario: .empty)
      XCTAssertTrue(empty.dimensions.allSatisfy { !$0.nearingLimit && $0.used == 0 })

      let offers = try fixtureDecode(AppStoreOffersResponse.self, FixtureHost.tenant() + "/billing/app-store/offers", scenario: .owner)
      XCTAssertTrue(offers.configured)
      let offer = try XCTUnwrap(offers.offers.first)
      let context = try fixtureDecode(
        AppStorePurchaseContext.self, "POST", FixtureHost.tenant() + "/billing/app-store/purchase-context",
        body: ["offerId": offer.id], scenario: .owner
      )
      XCTAssertEqual(context.productId, offer.externalProductId)
      _ = try fixtureDecode(
        AppStoreTransactionAcknowledgement.self, "POST", FixtureHost.tenant() + "/billing/app-store/transactions",
        body: ["signedTransactionInfo": "jws"], scenario: .owner
      )
      _ = try fixtureDecode(
        AppStoreRestoreResponse.self, "POST", FixtureHost.tenant() + "/billing/app-store/restore",
        body: ["signedTransactions": [String]()], scenario: .owner
      )
    }

    func testAccountPushAndAuthEndpointsDecode() throws {
      let client = NativeAuthHTTPClient()
      let impact = try client.decode(
        AccountDeletionImpact.self,
        from: fixtureSend("GET", FixtureHost.platform + "/account-deletion/impact", scenario: .owner).body
      )
      XCTAssertEqual(impact.workspaces.map(\.slug), ["innei"])
      let apple = try client.decode(
        AppleAuthenticationConfiguration.self,
        from: fixtureSend("GET", FixtureHost.platform + "/mobile-auth/apple/configuration", scenario: .visitor).body
      )
      XCTAssertFalse(apple.enabled)
      let slug = try fixtureDecode(FixtureSlugMirror.self, "POST", FixtureHost.platform + "/tenant/check-slug", body: ["slug": "lumen"], scenario: .owner)
      XCTAssertEqual(slug.slug, "lumen")
      XCTAssertEqual(fixtureSend("POST", FixtureHost.platform + "/tenant/check-slug", body: ["slug": "innei"], scenario: .owner).status, 409)
      let switched = try fixtureDecode(
        FixtureWorkspaceSwitchMirror.self, "POST", FixtureHost.platform + "/auth/workspaces/switch",
        body: ["tenantId": FixtureCatalog.ownTenantId], scenario: .owner
      )
      XCTAssertEqual(switched.activeWorkspace.slug, "innei")
      XCTAssertTrue(try fixtureDecode(FixtureRegisteredMirror.self, "PUT", FixtureHost.platform + "/push-devices", body: ["token": "abc"], scenario: .owner).registered)
      XCTAssertFalse(try fixtureDecode(FixtureRegisteredMirror.self, "DELETE", FixtureHost.platform + "/push-devices", body: ["token": "abc"], scenario: .owner).registered)
      XCTAssertEqual(fixtureSend("POST", FixtureHost.platform + "/auth/sign-in/social", body: ["provider": "github"], scenario: .visitor).status, 400)
    }

    func testReactionsDecodeLikeTheViewer() throws {
      let response = try fixtureDecode(FixtureReactionAnalysisMirror.self, FixtureHost.tenant() + "/reactions?refKey=DSC_7132", scenario: .visitor)
      let counts = PhotoReactionState.normalize(response.data?.reactions)
      XCTAssertTrue(counts.keys.allSatisfy { PhotoReaction(rawValue: $0) != nil })
      let ack = try fixtureDecode(
        JSONValue?.self, "POST", FixtureHost.tenant() + "/reactions/add",
        body: ["refKey": "DSC_7132", "reaction": "🔥", "count": 3], scenario: .visitor
      )
      XCTAssertNotNil(ack)
    }

    func testEventStreamsAndSyncRun() throws {
      let events = fixtureSend("GET", FixtureHost.tenant() + "/manifest/events", scenario: .owner)
      XCTAssertEqual(events.status, 200)
      XCTAssertEqual(events.headers[FixtureResponse.holdOpenHeader], "1")
      XCTAssertEqual(events.headers["Content-Type"], "text/event-stream")

      let run = fixtureSend("POST", FixtureHost.tenant() + "/data-sync/run", body: ["dryRun": false], scenario: .owner)
      XCTAssertEqual(run.status, 200)
      var framer = StudioSSEFramer()
      var decoded: [StudioDataSyncProgressEvent] = []
      let decoder = JSONDecoder()
      decoder.keyDecodingStrategy = .convertFromSnakeCase
      for line in String(decoding: run.body, as: UTF8.self).components(separatedBy: "\n") {
        if let frame = framer.consume(line), frame.event == "progress" {
          decoded.append(try decoder.decode(StudioDataSyncProgressEvent.self, from: Data(frame.data.utf8)))
        }
      }
      if let frame = framer.finish() {
        decoded.append(try decoder.decode(StudioDataSyncProgressEvent.self, from: Data(frame.data.utf8)))
      }
      XCTAssertEqual(decoded.last?.type, "complete")
      XCTAssertNotNil(decoded.last?.payload.summary)
      XCTAssertTrue(decoded.contains { $0.type == "action" })
    }

    func testUnknownRouteReturnsNotFound() {
      let response = fixtureSend("GET", FixtureHost.platform + "/definitely/not/a/route", scenario: .owner)
      XCTAssertEqual(response.status, 404)
      XCTAssertEqual(fixtureSend("GET", "https://\(FixtureMode.host)/media/missing.jpg", scenario: .owner).status, 404)
    }
  }
#endif
