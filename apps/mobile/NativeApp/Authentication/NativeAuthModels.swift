import Foundation

enum NativeAuthProvider: String, Sendable {
  case github
  case google

  var displayName: String {
    switch self {
    case .github:
      "GitHub"
    case .google:
      "Google"
    }
  }
}

struct AppleAuthenticationConfiguration: Decodable, Sendable {
  let appBundleIdentifier: String
  let enabled: Bool
  let webEnabled: Bool
}

struct AppleAuthorizationResult: Sendable {
  let authorizationCode: String
  let email: String?
  let identityToken: String
  let firstName: String?
  let lastName: String?
  let nonce: String
}

enum AccountDeletionProof: Encodable, Sendable {
  case apple(identityToken: String, nonce: String)
  case password(String)
  case recentSession

  private enum CodingKeys: String, CodingKey {
    case identityToken
    case nonce
    case password
    case type
  }

  func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    switch self {
    case .apple(let identityToken, let nonce):
      try container.encode("apple", forKey: .type)
      try container.encode(identityToken, forKey: .identityToken)
      try container.encode(nonce, forKey: .nonce)
    case .password(let password):
      try container.encode("password", forKey: .type)
      try container.encode(password, forKey: .password)
    case .recentSession:
      try container.encode("recent-session", forKey: .type)
    }
  }
}

struct AccountDeletionImpact: Decodable, Sendable {
  struct TransferTarget: Decodable, Sendable {
    let email: String
    let name: String
    let role: String
    let userId: String
  }

  struct JoinedWorkspace: Decodable, Identifiable, Sendable {
    let name: String
    let slug: String
    let tenantId: String

    var id: String { tenantId }
  }

  struct Subscription: Decodable, Identifiable, Sendable {
    let id: String
    let status: String
    let subscriptionId: String?
    let tenantId: String?
  }

  struct Workspace: Decodable, Identifiable, Sendable {
    let action: String
    let name: String
    let slug: String
    let tenantId: String
    let transferTo: TransferTarget?

    var id: String { tenantId }
  }

  let joinedWorkspaces: [JoinedWorkspace]
  let proofMethods: [String]
  let subscriptions: [Subscription]
  let workspaces: [Workspace]
}

struct AccountDeletionRequestResult: Decodable, Sendable {
  let requestId: String
  let status: String
  let statusToken: String
}

enum NativeAuthError: LocalizedError, Equatable {
  case cancelled
  case invalidResponse
  case missingSession
  case oauthCallbackMissingCode(String)
  case oauthSessionRejected(String)
  case oauthStateMismatch(String)
  case server(String)
  case unavailable

  var errorDescription: String? {
    switch self {
    case .cancelled:
      "The authentication request was cancelled."
    case .invalidResponse:
      "The authentication server returned an invalid response."
    case .missingSession:
      "Authentication completed without creating a session."
    case .oauthCallbackMissingCode(let provider):
      "\(provider) completed authorization, but the authentication server did not return a one-time sign-in code."
    case .oauthSessionRejected(let provider):
      "\(provider) completed authorization, but the returned session could not be validated."
    case .oauthStateMismatch(let provider):
      "\(provider) returned an authentication response that did not match this sign-in request."
    case .server(let message):
      message
    case .unavailable:
      "This authentication method is unavailable."
    }
  }
}
