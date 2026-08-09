import XCTest
@testable import Afilmory

final class CommentDecodingTests: XCTestCase {
  func testPublicCommentPageAcceptsDatabaseReactionCountStrings() throws {
    let page = try decode(CommentPage.self)

    XCTAssertEqual(page.comments.first?.reactionCounts, ["like": 1, "heart": 2])
  }

  func testStudioCommentPageAcceptsDatabaseReactionCountStrings() throws {
    let page = try decode(StudioCommentsPage.self)

    XCTAssertEqual(page.comments.first?.reactionCounts, ["like": 1, "heart": 2])
  }

  private func decode<Value: Decodable>(_ type: Value.Type) throws -> Value {
    let data = Data(
      """
      {
        "comments": [{
          "id": "comment-1",
          "photo_id": "photo-1",
          "parent_id": null,
          "user_id": "user-1",
          "content": "A comment",
          "status": "approved",
          "created_at": "2026-08-08 16:23:10.079",
          "updated_at": "2026-08-08 16:23:10.079",
          "reaction_counts": {"like": "1", "heart": 2},
          "viewer_reactions": ["like"]
        }],
        "relations": {},
        "users": {
          "user-1": {"id": "user-1", "name": "User", "image": null}
        },
        "next_cursor": null
      }
      """.utf8
    )
    let decoder = JSONDecoder()
    decoder.keyDecodingStrategy = .convertFromSnakeCase
    return try decoder.decode(type, from: data)
  }
}
