import Foundation

enum CommentReportReason: String, CaseIterable, Encodable, Identifiable {
  case spam
  case harassment
  case hateOrViolence = "hate_or_violence"
  case sexualContent = "sexual_content"
  case other

  var id: String { rawValue }

  var title: String {
    switch self {
    case .spam: String(localized: "Spam")
    case .harassment: String(localized: "Harassment")
    case .hateOrViolence: String(localized: "Hate or violence")
    case .sexualContent: String(localized: "Sexual content")
    case .other: String(localized: "Other")
    }
  }
}

struct CommentModerationBody: Encodable {
  let reason: String
  let details: String?
}

struct CommentReportResponse: Decodable {
  let reportId: String
  let reported: Bool
  let status: String
}

struct CommentBlockResponse: Decodable {
  let blocked: Bool
  let blockedUserId: String
  let reported: Bool
}

