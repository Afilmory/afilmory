import Foundation

@propertyWrapper
struct FlexibleReactionCounts: Decodable, Equatable, Sendable {
  var wrappedValue: [String: Int]

  init(wrappedValue: [String: Int]) {
    self.wrappedValue = wrappedValue
  }

  init(from decoder: Decoder) throws {
    let values = try decoder.singleValueContainer().decode([String: JSONValue].self)
    wrappedValue = try values.reduce(into: [:]) { result, entry in
      let count: Int?
      switch entry.value {
      case .number(let value):
        count = Int(exactly: value)
      case .string(let value):
        count = Int(value)
      default:
        count = nil
      }
      guard let count else {
        throw DecodingError.dataCorrupted(
          .init(
            codingPath: decoder.codingPath,
            debugDescription: "Reaction count for \(entry.key) is not an integer"
          )
        )
      }
      result[entry.key] = count
    }
  }
}

enum CommentStatus: String, Decodable {
  case approved
  case pending
  case hidden
  case rejected
}

enum CommentDeliveryState: String, Decodable {
  case sending
  case sent
}

struct CommentItem: Decodable, Identifiable {
  var id: String
  var photoId: String
  var parentId: String?
  var userId: String
  var content: String
  var status: CommentStatus
  var createdAt: String
  var updatedAt: String
  @FlexibleReactionCounts var reactionCounts: [String: Int]
  var viewerReactions: [String]
  var clientId: String?
  var deliveryState: CommentDeliveryState?

  var identity: String { clientId ?? id }

  var createdDate: Date? {
    try? Date(createdAt, strategy: .iso8601)
  }
}

struct CommentUser: Decodable {
  var id: String
  var name: String
  var image: String?
  var website: String?
}

struct CommentPage: Decodable {
  var comments: [CommentItem]
  var relations: [String: CommentItem]
  var users: [String: CommentUser]
  var nextCursor: String?
}

struct CommentReactionResponse: Decodable {
  var item: CommentItem
}

struct CommentCollection {
  var comments: [CommentItem]
  var relations: [String: CommentItem]
  var users: [String: CommentUser]

  static let empty = CommentCollection(comments: [], relations: [:], users: [:])
}

struct CreateCommentBody: Encodable {
  let content: String
  let photoId: String
  let parentId: String?
}

struct CommentReactionBody: Encodable {
  let reaction: String
}

struct PhotoCommentsSheetRequest {
  var gallerySlug: String = ""
  var photoId: String = ""
  var photoTitle: String = ""
  var baseURL: String = ""
  var viewerUserId: String?
  var initialCommentCount: Int = -1
}

struct PhotoCommentsSheetResult {
  let commentCount: Int
  let requestedSignIn: Bool

  var dictionary: [String: Any] {
    [
      "commentCount": commentCount,
      "requestedSignIn": requestedSignIn,
    ]
  }
}
