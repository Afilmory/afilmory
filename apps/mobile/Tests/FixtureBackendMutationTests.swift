#if DEBUG
  @testable import Afilmory
  import XCTest

  final class FixtureBackendMutationTests: XCTestCase {
    private let timelinePath = FixtureHost.platform + "/gallery-subscriptions/timeline?timeZone=UTC&limit=20"

    override func setUp() {
      super.setUp()
      FixtureBackend.resetState()
    }

    override func tearDown() {
      FixtureBackend.resetState()
      super.tearDown()
    }

    func testFollowAndUnfollowUpdateSubscriptionsTimelineAndDirectory() throws {
      let unfollow = try fixtureDecode(
        GallerySubscriptionMutationResponse.self, "DELETE", FixtureHost.platform + "/gallery-subscriptions/tenant-birdline", scenario: .owner
      )
      XCTAssertFalse(unfollow.subscribed)
      let list = try fixtureDecode(GallerySubscriptionListResponse.self, FixtureHost.platform + "/gallery-subscriptions", scenario: .owner)
      XCTAssertEqual(list.subscriptions.count, 2)
      let timeline = try fixtureDecode(GalleryTimelineResponse.self, timelinePath, scenario: .owner)
      XCTAssertFalse(timeline.events.contains { $0.tenantId == "tenant-birdline" })

      let follow = try fixtureDecode(
        GallerySubscriptionMutationResponse.self, "PUT", FixtureHost.platform + "/gallery-subscriptions/tenant-harbor", scenario: .newcomer
      )
      XCTAssertTrue(follow.subscribed)
      XCTAssertEqual(follow.tenantId, "tenant-harbor")
      let newcomerTimeline = try fixtureDecode(GalleryTimelineResponse.self, timelinePath, scenario: .newcomer)
      XCTAssertEqual(Set(newcomerTimeline.events.map(\.tenantId)), ["tenant-harbor"])
      let directory = try fixtureDecode(FeaturedGalleriesEnvelope.self, FixtureHost.platform + "/gallery-directory?limit=24", scenario: .newcomer)
      XCTAssertEqual(directory.galleries.filter(\.isSubscribed).map(\.slug), ["harbor"])

      XCTAssertEqual(fixtureSend("PUT", FixtureHost.platform + "/gallery-subscriptions/tenant-innei", scenario: .owner).status, 400)
      XCTAssertEqual(fixtureSend("PUT", FixtureHost.platform + "/gallery-subscriptions/tenant-harbor", scenario: .visitor).status, 401)
    }

    func testReactionsAccumulate() throws {
      let path = FixtureHost.tenant("birdline") + "/reactions?refKey=birdline-DSC_7132"
      let before = PhotoReactionState.normalize(try fixtureDecode(FixtureReactionAnalysisMirror.self, path, scenario: .owner).data?.reactions)
      fixtureSend(
        "POST", FixtureHost.tenant("birdline") + "/reactions/add",
        body: ["refKey": "birdline-DSC_7132", "reaction": "😍", "count": 4], scenario: .owner
      )
      let after = PhotoReactionState.normalize(try fixtureDecode(FixtureReactionAnalysisMirror.self, path, scenario: .owner).data?.reactions)
      XCTAssertEqual(after["😍"], (before["😍"] ?? 0) + 4)
    }

    func testCommentLifecycle() throws {
      let created = try fixtureDecode(
        CommentPage.self, "POST", FixtureHost.tenant() + "/comments",
        body: ["content": "清晨的光 ☀️", "photoId": "DSC_7132", "parentId": "comment-robin-noah"], scenario: .owner
      )
      XCTAssertEqual(created.comments.first?.content, "清晨的光 ☀️")
      XCTAssertNotNil(created.relations["comment-robin-noah"])
      let count = try fixtureDecode(FixtureCountMirror.self, FixtureHost.tenant() + "/comments/count?photoId=DSC_7132", scenario: .owner)
      XCTAssertEqual(count.count, 4)

      let toggled = try fixtureDecode(
        CommentReactionResponse.self, "POST", FixtureHost.tenant() + "/comments/comment-robin-lin/reactions",
        body: ["reaction": "like"], scenario: .owner
      )
      XCTAssertEqual(toggled.item.viewerReactions, ["like"])
      XCTAssertEqual(toggled.item.reactionCounts["like"], 5)

      let report = try fixtureDecode(
        CommentReportResponse.self, "POST", FixtureHost.tenant() + "/comments/comment-robin-noah/reports",
        body: ["reason": "spam"], scenario: .owner
      )
      XCTAssertTrue(report.reported)
      let block = try fixtureDecode(
        CommentBlockResponse.self, "POST", FixtureHost.tenant("nightwalker") + "/comments/comment-night-noah/block-author",
        body: ["reason": "abusive_behavior"], scenario: .owner
      )
      XCTAssertEqual(block.blockedUserId, "user-noah")

      let pendingPath = FixtureHost.tenant() + "/comments/all?limit=20&status=pending"
      let pending = try fixtureDecode(StudioCommentsPage.self, pendingPath, scenario: .owner)
      let target = try XCTUnwrap(pending.comments.first)
      XCTAssertTrue(try fixtureDecode(FixtureDeletedMirror.self, "DELETE", FixtureHost.tenant() + "/comments/\(target.id)", scenario: .owner).deleted)
      XCTAssertEqual(try fixtureDecode(StudioCommentsPage.self, pendingPath, scenario: .owner).comments.count, pending.comments.count - 1)

      XCTAssertEqual(
        fixtureSend("POST", FixtureHost.tenant() + "/comments", body: ["content": "hi", "photoId": "DSC_7132"], scenario: .visitor).status,
        401
      )
    }

    func testTagEditAndDeleteFlowThroughManifestChanges() throws {
      let snapshot = try fixtureDecode(ManifestSnapshotResponse.self, FixtureHost.tenant() + "/manifest/snapshot", scenario: .owner)
      let tagged = try fixtureDecode(
        FixtureTagChangeMirror.self, "PATCH", FixtureHost.tenant() + "/photos/assets/asset-DSCF2850/tags",
        body: ["tags": ["花", "spring"]], scenario: .owner
      )
      let change = try XCTUnwrap(tagged.change)
      XCTAssertEqual(change.revision, snapshot.revision + 1)
      XCTAssertEqual(change.photo?.tags ?? [], ["花", "spring"])
      XCTAssertEqual(change.assetId, "asset-DSCF2850")

      let repository = PhotoReplicaRepository(store: PhotoReplicaDatabase.makeInMemory())
      let photos = ManifestDecoding.normalize(snapshot.manifest.data, galleryOrigin: URL(string: "http://innei.localhost:1841")!)
      try repository.replaceSnapshot(slug: "innei", tenantId: nil, revision: snapshot.revision, photos: photos, assets: [])
      let applied = try repository.apply(slug: "innei", tenantId: change.tenantId, change: change)
      XCTAssertEqual(applied.advancedTo, snapshot.revision + 1)

      let deleted = try fixtureDecode(
        FixtureDeleteChangesMirror.self, "DELETE", FixtureHost.tenant() + "/photos/assets",
        body: ["ids": ["asset-IMG_0030"], "deleteFromStorage": true], scenario: .owner
      )
      XCTAssertEqual(deleted.changes?.map(\.operation), [.delete])
      let changes = try fixtureDecode(
        ManifestChangesResponse.self, FixtureHost.tenant() + "/manifest/changes?after=\(snapshot.revision)", scenario: .owner
      )
      XCTAssertEqual(changes.changes.map(\.revision), [snapshot.revision + 1, snapshot.revision + 2])
      XCTAssertEqual(changes.revision, snapshot.revision + 2)
      let updated = try fixtureDecode(ManifestSnapshotResponse.self, FixtureHost.tenant() + "/manifest/snapshot", scenario: .owner)
      XCTAssertEqual(updated.manifest.data.count, 17)
      XCTAssertEqual(updated.manifest.data.first { $0.id == "DSCF2850" }?.tags ?? [], ["花", "spring"])
      let overview = try fixtureDecode(StudioDashboardOverview.self, FixtureHost.tenant() + "/dashboard/overview", scenario: .owner)
      XCTAssertEqual(overview.stats.totalPhotos, 17)
    }

    func testSignOutAndSignInRoundTrip() throws {
      fixtureSend("POST", FixtureHost.platform + "/auth/sign-out", scenario: .owner)
      let signedOut = try fixtureDecode(AfilmorySessionResponse.self, FixtureHost.platform + "/auth/session", scenario: .owner)
      XCTAssertNil(signedOut.resolved())

      XCTAssertEqual(
        fixtureSend("POST", FixtureHost.platform + "/auth/sign-in/email", body: ["email": "innei@example.com", "password": "wrong"], scenario: .visitor).status,
        401
      )
      let signIn = fixtureSend(
        "POST", FixtureHost.platform + "/auth/sign-in/email",
        body: ["email": "innei@example.com", "password": "fixture"], scenario: .visitor
      )
      XCTAssertEqual(signIn.status, 200)
      let cookie = NativeAuthHTTPClient.merge(setCookieHeader: signIn.headers["Set-Cookie"], into: nil)
      XCTAssertNotNil(cookie)
      let session = try fixtureDecode(AfilmorySessionResponse.self, FixtureHost.platform + "/auth/session", scenario: .visitor)
      XCTAssertEqual(session.resolved()?.activeWorkspace?.slug, "innei")
    }

    func testAccountDeletionSignsOut() throws {
      let result = try NativeAuthHTTPClient().decode(
        AccountDeletionRequestResult.self,
        from: fixtureSend("POST", FixtureHost.platform + "/account-deletion/request", body: ["proof": ["type": "recent-session"]], scenario: .owner).body
      )
      XCTAssertEqual(result.status, "pending")
      XCTAssertNil(try fixtureDecode(AfilmorySessionResponse.self, FixtureHost.platform + "/auth/session", scenario: .owner).resolved())
    }

    func testDomainsSiteSettingsAndConflicts() throws {
      XCTAssertEqual(fixtureSend("POST", FixtureHost.tenant() + "/tenant/domains", body: ["domain": "photos.example.org"], scenario: .owner).status, 403)
      let listing = try fixtureDecode(StudioDomainListing.self, FixtureHost.tenant() + "/tenant/domains", scenario: .owner)
      let existing = try XCTUnwrap(listing.domains.first)
      XCTAssertEqual(existing.status, .verified)
      _ = try fixtureDecode(FixtureDeletedMirror.self, "DELETE", FixtureHost.tenant() + "/tenant/domains/\(existing.id)", scenario: .owner)
      let requested = try fixtureDecode(
        StudioDomainMutationResponse.self, "POST", FixtureHost.tenant() + "/tenant/domains", body: ["domain": "photos.example.org"], scenario: .owner
      )
      XCTAssertEqual(requested.domain.status, .pending)
      let verified = try fixtureDecode(
        StudioDomainMutationResponse.self, "POST", FixtureHost.tenant() + "/tenant/domains/\(requested.domain.id)/verify", scenario: .owner
      )
      XCTAssertEqual(verified.domain.status, .verified)

      fixtureSend("POST", FixtureHost.tenant() + "/site/settings", body: ["entries": [["key": "site.title", "value": "Morning Birds"]]], scenario: .owner)
      let site = try fixtureDecode(StudioSiteSchemaResponse.self, FixtureHost.tenant() + "/site/settings/ui-schema", scenario: .owner)
      XCTAssertEqual(site.values["site.title"] ?? nil, "Morning Birds")

      let conflicts = try fixtureDecode([StudioDataSyncConflictRecord].self, FixtureHost.tenant() + "/data-sync/conflicts", scenario: .owner)
      let conflict = try XCTUnwrap(conflicts.first)
      XCTAssertEqual(
        fixtureSend("POST", FixtureHost.tenant() + "/data-sync/conflicts/\(conflict.id)/resolve", body: ["dryRun": false, "strategy": "prefer-storage"], scenario: .owner).status,
        200
      )
      XCTAssertTrue(try fixtureDecode([StudioDataSyncConflictRecord].self, FixtureHost.tenant() + "/data-sync/conflicts", scenario: .owner).isEmpty)
    }

    func testEveryReferencedMediaFileIsBundledAndServed() throws {
      var urls = Set<String>()
      let platformPaths = ["/auth/session", "/gallery-directory?limit=24", "/gallery-subscriptions", "/gallery-subscriptions/timeline?timeZone=UTC&limit=50"]
      for scenario in [FixtureScenario.owner, .visitor] {
        for path in platformPaths {
          urls.formUnion(fixtureMediaURLs(in: fixtureJSON(fixtureSend("GET", FixtureHost.platform + path, scenario: scenario))))
        }
        for gallery in FixtureCatalog.shared.galleries {
          urls.formUnion(fixtureMediaURLs(in: fixtureJSON(fixtureSend("GET", FixtureHost.tenant(gallery.slug) + "/manifest/snapshot", scenario: scenario))))
        }
      }
      for path in ["/photos/assets", "/comments/all?limit=50", "/comments?photoId=DSC_7132"] {
        urls.formUnion(fixtureMediaURLs(in: fixtureJSON(fixtureSend("GET", FixtureHost.tenant() + path, scenario: .owner))))
      }
      XCTAssertGreaterThanOrEqual(urls.count, 18 * 2 + 7)
      for url in urls {
        let name = try XCTUnwrap(URL(string: url)?.lastPathComponent)
        XCTAssertNotNil(FixtureCatalog.mediaFile(named: name), "missing bundled media \(name)")
        for scenario in [FixtureScenario.owner, .offline] {
          let response = fixtureSend("GET", url, scenario: scenario)
          XCTAssertEqual(response.status, 200, url)
          XCTAssertFalse(response.body.isEmpty, url)
        }
      }
    }
  }
#endif
