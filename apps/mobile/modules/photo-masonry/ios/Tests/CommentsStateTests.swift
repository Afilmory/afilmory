import XCTest
@testable import Afilmory

final class CommentsStateTests: XCTestCase {
  func testMergePageDeduplicatesExistingComments() {
    let current = CommentCollection(
      comments: [comment(id: "one"), comment(id: "two", content: "old")],
      relations: [:],
      users: [:]
    )
    let page = CommentPage(
      comments: [comment(id: "two", content: "updated"), comment(id: "three")],
      relations: ["parent": comment(id: "parent")],
      users: ["user": user()],
      nextCursor: "three"
    )

    let merged = CommentsState.mergePage(current, page: page)

    XCTAssertEqual(merged.comments.map(\.id), ["one", "two", "three"])
    XCTAssertEqual(merged.comments[1].content, "updated")
    XCTAssertEqual(merged.relations["parent"]?.id, "parent")
    XCTAssertEqual(merged.users["user"]?.name, "Ada")
  }

  func testSettleOptimisticCommentUsesClientIdentity() {
    var optimistic = comment(id: "local", content: "draft")
    optimistic.clientId = "client-1"
    optimistic.deliveryState = .sending
    let current = CommentCollection(comments: [optimistic], relations: [:], users: [:])
    let page = CommentPage(
      comments: [comment(id: "server", content: "saved")],
      relations: [:],
      users: [:],
      nextCursor: nil
    )

    let settled = CommentsState.settleOptimisticComment(current, clientId: "client-1", page: page)

    XCTAssertEqual(settled.comments.map(\.id), ["server"])
    XCTAssertEqual(settled.comments[0].clientId, "client-1")
    XCTAssertEqual(settled.comments[0].deliveryState, .sent)
  }

  func testRemoveFailedOptimisticCommentPreservesServerRows() {
    var optimistic = comment(id: "local")
    optimistic.clientId = "client-1"
    let current = CommentCollection(
      comments: [comment(id: "server"), optimistic],
      relations: [:],
      users: [:]
    )

    let result = CommentsState.removeFailedOptimisticComment(current, clientId: "client-1")

    XCTAssertEqual(result.comments.map(\.id), ["server"])
  }

  func testToggleReactionIsReversible() {
    let original = comment(id: "one")
    let liked = CommentsState.toggleLocalReaction(original)
    let unliked = CommentsState.toggleLocalReaction(liked)

    XCTAssertEqual(liked.reactionCounts["like"], 1)
    XCTAssertEqual(liked.viewerReactions, ["like"])
    XCTAssertEqual(unliked.reactionCounts["like"], 0)
    XCTAssertEqual(unliked.viewerReactions, [])
  }

  func testRemovingBlockedAuthorRemovesAllOfTheirCommentsRelationsAndProfile() {
    let blocked = comment(id: "blocked-one", userId: "blocked")
    let visible = comment(id: "visible", userId: "visible")
    let current = CommentCollection(
      comments: [blocked, visible, comment(id: "blocked-two", userId: "blocked")],
      relations: ["blocked-parent": comment(id: "blocked-parent", userId: "blocked")],
      users: [
        "blocked": CommentUser(id: "blocked", name: "Blocked", image: nil, website: nil),
        "visible": CommentUser(id: "visible", name: "Visible", image: nil, website: nil),
      ]
    )

    let result = CommentsState.removingAuthor(current, userId: "blocked")

    XCTAssertEqual(result.comments.map(\.id), ["visible"])
    XCTAssertNil(result.relations["blocked-parent"])
    XCTAssertNil(result.users["blocked"])
    XCTAssertEqual(result.users["visible"]?.name, "Visible")
  }

  func testCursorAdvancesFromTheIncomingPage() {
    let page = CommentPage(
      comments: [comment(id: "next")],
      relations: [:],
      users: [:],
      nextCursor: "next"
    )

    XCTAssertEqual(CommentsState.advanceCursor(current: "old", page: page, replacing: false), "next")
  }

  func testUnauthorizedClassificationIsDistinctFromHTTPError() {
    guard case .unauthorized = APIError.response(status: 401, body: nil) else {
      return XCTFail("HTTP 401 must map to APIError.unauthorized")
    }
    guard case .http(let status, _) = APIError.response(status: 403, body: nil) else {
      return XCTFail("HTTP 403 must remain a generic HTTP error")
    }
    XCTAssertEqual(status, 403)
  }

  private func comment(id: String, content: String? = nil, userId: String = "user") -> CommentItem {
    CommentItem(
      id: id,
      photoId: "photo",
      parentId: nil,
      userId: userId,
      content: content ?? id,
      status: .approved,
      createdAt: "2026-08-02T00:00:00Z",
      updatedAt: "2026-08-02T00:00:00Z",
      reactionCounts: [:],
      viewerReactions: [],
      clientId: nil,
      deliveryState: nil
    )
  }

  private func user() -> CommentUser {
    CommentUser(id: "user", name: "Ada", image: nil, website: nil)
  }
}
