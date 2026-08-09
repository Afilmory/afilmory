import XCTest

@testable import Afilmory

final class StudioHomeDataTests: XCTestCase {
  private let decoder: JSONDecoder = {
    let decoder = JSONDecoder()
    decoder.keyDecodingStrategy = .convertFromSnakeCase
    return decoder
  }()

  func testDecodesStudioHomeProductionResponseShapes() throws {
    let overview = try decoder.decode(
      StudioDashboardOverview.self,
      from: Data(
        #"""
        {
          "stats": {
            "total_photos": 128,
            "total_storage_bytes": 1536,
            "this_month_uploads": 12,
            "sync": { "pending": 3, "conflicts": 1, "synced": 124 }
          },
          "recent_activity": [
            {
              "id": "activity-1",
              "title": "DSCF0001.jpg",
              "created_at": "2026-08-03T08:30:00.000Z",
              "storage_provider": "s3",
              "sync_status": "pending",
              "ignored_backend_field": true
            }
          ]
        }
        """#.utf8
      )
    )
    let comments = try decoder.decode(
      StudioPendingCommentsPage.self,
      from: Data(
        #"""
        {
          "comments": [{ "id": "comment-1", "content": "ignored" }],
          "next_cursor": "cursor-2",
          "relations": {},
          "users": {}
        }
        """#.utf8
      )
    )
    let syncStatus = try decoder.decode(
      StudioDataSyncStatus.self,
      from: Data(
        #"""
        {
          "last_run": {
            "completed_at": "2026-08-03T08:45:00.000Z",
            "actions_count": 4
          }
        }
        """#.utf8
      )
    )

    XCTAssertEqual(overview.stats.totalPhotos, 128)
    XCTAssertEqual(overview.stats.totalStorageBytes, 1536)
    XCTAssertEqual(overview.stats.sync.conflicts, 1)
    XCTAssertEqual(overview.recentActivity.first?.syncStatus, .pending)
    XCTAssertEqual(comments.comments.map(\.id), ["comment-1"])
    XCTAssertEqual(comments.nextCursor, "cursor-2")
    XCTAssertEqual(syncStatus.lastRun?.completedAt, "2026-08-03T08:45:00.000Z")
  }
}
