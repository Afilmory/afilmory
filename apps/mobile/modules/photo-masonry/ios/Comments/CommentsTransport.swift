import Foundation

protocol CommentsTransport: Sendable {
  func list(photoId: String, cursor: String?) async throws -> CommentPage
  func create(content: String, photoId: String, parentId: String?) async throws -> CommentPage
  func toggleReaction(commentId: String) async throws -> CommentReactionResponse
  func report(commentId: String, reason: CommentReportReason) async throws -> CommentReportResponse
  func blockAuthor(commentId: String) async throws -> CommentBlockResponse
}

struct LiveCommentsTransport: CommentsTransport {
  let baseURL: String
  private let api: AfilmoryAPI

  init(baseURL: String, api: AfilmoryAPI = .shared) {
    self.baseURL = baseURL
    self.api = api
  }

  func list(photoId: String, cursor: String?) async throws -> CommentPage {
    try await api.request(CommentsAPI.list(baseURL: baseURL, photoId: photoId, cursor: cursor))
  }

  func create(content: String, photoId: String, parentId: String?) async throws -> CommentPage {
    try await api.request(
      CommentsAPI.create(baseURL: baseURL, content: content, photoId: photoId, parentId: parentId)
    )
  }

  func toggleReaction(commentId: String) async throws -> CommentReactionResponse {
    try await api.request(CommentsAPI.toggleReaction(baseURL: baseURL, commentId: commentId))
  }

  func report(commentId: String, reason: CommentReportReason) async throws -> CommentReportResponse {
    try await api.request(CommentsAPI.report(baseURL: baseURL, commentId: commentId, reason: reason))
  }

  func blockAuthor(commentId: String) async throws -> CommentBlockResponse {
    try await api.request(CommentsAPI.blockAuthor(baseURL: baseURL, commentId: commentId))
  }
}

actor DemoCommentsTransport: CommentsTransport {
  enum Outcome: String, Sendable {
    case success
    case failure
  }

  static let viewerUserId = "demo-viewer"

  private let outcome: Outcome
  private let latency: Duration
  private var order: [String]
  private var items: [String: CommentItem]
  private var users: [String: CommentUser]
  private var createdCount = 0

  init(outcome: Outcome, latencyMs: Int) {
    self.outcome = outcome
    latency = .milliseconds(max(0, latencyMs))

    let mira = DemoCommentsTransport.item(
      id: "demo-mira",
      userId: "demo-mira-user",
      content: "The light across the foreground is excellent.",
      minutesAgo: 30,
      reactionCounts: ["like": 2]
    )
    let own = DemoCommentsTransport.item(
      id: "demo-own",
      userId: DemoCommentsTransport.viewerUserId,
      content: "Shot this at golden hour on the coast road.",
      minutesAgo: 12
    )
    let noah = DemoCommentsTransport.item(
      id: "demo-noah",
      userId: "demo-noah-user",
      content: "This frame feels unusually calm.",
      minutesAgo: 2,
      parentId: "demo-mira"
    )
    order = [mira.id, own.id, noah.id]
    items = [mira.id: mira, own.id: own, noah.id: noah]
    users = [
      "demo-mira-user": CommentUser(id: "demo-mira-user", name: "Mira", image: nil, website: nil),
      "demo-noah-user": CommentUser(id: "demo-noah-user", name: "Noah", image: nil, website: nil),
      DemoCommentsTransport.viewerUserId: CommentUser(
        id: DemoCommentsTransport.viewerUserId,
        name: "You",
        image: nil,
        website: nil
      ),
    ]
  }

  func list(photoId: String, cursor: String?) async throws -> CommentPage {
    page(for: order.compactMap { items[$0] })
  }

  func create(content: String, photoId: String, parentId: String?) async throws -> CommentPage {
    try await Task.sleep(for: latency)
    if outcome == .failure {
      throw APIError.http(status: 500, body: "Simulated request failed.")
    }
    createdCount += 1
    let created = DemoCommentsTransport.item(
      id: "demo-created-\(createdCount)",
      userId: DemoCommentsTransport.viewerUserId,
      content: content,
      minutesAgo: 0,
      parentId: parentId
    )
    order.append(created.id)
    items[created.id] = created
    return page(for: [created])
  }

  func toggleReaction(commentId: String) async throws -> CommentReactionResponse {
    try await Task.sleep(for: .milliseconds(150))
    guard let existing = items[commentId] else {
      throw APIError.http(status: 404, body: nil)
    }
    var toggled = CommentsState.toggleLocalReaction(existing)
    toggled.clientId = nil
    toggled.deliveryState = nil
    items[commentId] = toggled
    return CommentReactionResponse(item: toggled)
  }

  func report(commentId: String, reason _: CommentReportReason) async throws -> CommentReportResponse {
    try await Task.sleep(for: .milliseconds(250))
    if outcome == .failure {
      throw APIError.http(status: 500, body: "Simulated report failure.")
    }
    guard items[commentId] != nil else {
      throw APIError.http(status: 404, body: nil)
    }
    return CommentReportResponse(reportId: "demo-report-\(commentId)", reported: true, status: "pending")
  }

  func blockAuthor(commentId: String) async throws -> CommentBlockResponse {
    try await Task.sleep(for: .milliseconds(250))
    if outcome == .failure {
      throw APIError.http(status: 500, body: "Simulated block failure.")
    }
    guard let item = items[commentId] else {
      throw APIError.http(status: 404, body: nil)
    }
    let blockedUserId = item.userId
    order.removeAll { items[$0]?.userId == blockedUserId }
    items = items.filter { $0.value.userId != blockedUserId }
    users.removeValue(forKey: blockedUserId)
    return CommentBlockResponse(blocked: true, blockedUserId: blockedUserId, reported: true)
  }

  private func page(for comments: [CommentItem]) -> CommentPage {
    var relations: [String: CommentItem] = [:]
    for comment in comments {
      if let parentId = comment.parentId, let parent = items[parentId] {
        relations[parentId] = parent
      }
    }
    return CommentPage(comments: comments, relations: relations, users: users, nextCursor: nil)
  }

  private static func item(
    id: String,
    userId: String,
    content: String,
    minutesAgo: Double,
    reactionCounts: [String: Int] = [:],
    parentId: String? = nil
  ) -> CommentItem {
    let timestamp = Date(timeIntervalSinceNow: -minutesAgo * 60).formatted(.iso8601)
    return CommentItem(
      id: id,
      photoId: "lab-photo",
      parentId: parentId,
      userId: userId,
      content: content,
      status: .approved,
      createdAt: timestamp,
      updatedAt: timestamp,
      reactionCounts: reactionCounts,
      viewerReactions: [],
      clientId: nil,
      deliveryState: nil
    )
  }
}
