import Foundation

enum CommentsAPI {
  static func list(
    baseURL: String,
    photoId: String,
    cursor: String?,
    limit: Int = 20
  ) -> APIEndpoint {
    var queryItems = [
      URLQueryItem(name: "photoId", value: photoId),
      URLQueryItem(name: "limit", value: String(limit)),
    ]
    if let cursor {
      queryItems.append(URLQueryItem(name: "cursor", value: cursor))
    }
    return APIEndpoint(
      baseURL: .explicit(baseURL),
      path: "/comments",
      queryItems: queryItems
    )
  }

  static func create(
    baseURL: String,
    content: String,
    photoId: String,
    parentId: String?
  ) throws -> APIEndpoint {
    APIEndpoint(
      baseURL: .explicit(baseURL),
      path: "/comments",
      method: .post,
      body: try APIEndpoint.jsonBody(
        CreateCommentBody(content: content, photoId: photoId, parentId: parentId)
      )
    )
  }

  static func toggleReaction(
    baseURL: String,
    commentId: String,
    reaction: String = "like"
  ) throws -> APIEndpoint {
    APIEndpoint(
      baseURL: .explicit(baseURL),
      path: "/comments/\(commentId)/reactions",
      method: .post,
      body: try APIEndpoint.jsonBody(CommentReactionBody(reaction: reaction))
    )
  }

  static func report(
    baseURL: String,
    commentId: String,
    reason: CommentReportReason
  ) throws -> APIEndpoint {
    APIEndpoint(
      baseURL: .explicit(baseURL),
      path: "/comments/\(commentId)/reports",
      method: .post,
      body: try APIEndpoint.jsonBody(
        CommentModerationBody(reason: reason.rawValue, details: nil)
      )
    )
  }

  static func blockAuthor(
    baseURL: String,
    commentId: String
  ) throws -> APIEndpoint {
    APIEndpoint(
      baseURL: .explicit(baseURL),
      path: "/comments/\(commentId)/block-author",
      method: .post,
      body: try APIEndpoint.jsonBody(
        CommentModerationBody(reason: "abusive_behavior", details: nil)
      )
    )
  }
}
