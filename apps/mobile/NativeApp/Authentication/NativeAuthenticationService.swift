import Foundation
import OSLog
import UIKit

private struct SocialSignInResponse: Decodable {
  let redirect: Bool?
  let url: String?
}

private struct ServerErrorEnvelope: Decodable {
  let message: String?
  let error: String?
}

private struct EmailSignInBody: Encodable {
  let email: String
  let password: String
}

private struct SocialSignInBody: Encodable {
  let provider: String
  let callbackURL: String
  let errorCallbackURL: String
}

private struct OneTimeTokenVerificationBody: Encodable {
  let token: String
}

private struct AppleSignInBody: Encodable {
  struct IDToken: Encodable {
    struct User: Encodable {
      struct Name: Encodable {
        let firstName: String?
        let lastName: String?
      }

      let email: String?
      let name: Name
    }

    let nonce: String
    let token: String
    let user: User
  }

  let callbackURL: String
  let idToken: IDToken
  let provider: String
  let requestSignUp: Bool
}

private struct AppleExchangeBody: Encodable {
  let authorizationCode: String
  let identityToken: String
  let nonce: String
}

private struct WorkspaceCreationBody: Encodable {
  struct Tenant: Encodable {
    let name: String
    let slug: String
  }

  let tenant: Tenant
  let useSessionAccount: Bool
}

private struct WorkspaceSwitchBody: Encodable {
  let tenantId: String
}

private struct AccountDeletionBody: Encodable {
  let proof: AccountDeletionProof
}

struct NativeAuthHTTPResponse: Sendable {
  let data: Data
  let cookie: String?
}

final class NativeAuthHTTPClient: @unchecked Sendable {
  typealias Transport = @Sendable (URLRequest) async throws -> (Data, URLResponse)

  private let decoder: JSONDecoder
  private let encoder = JSONEncoder()
  private let requestTimeoutInterval: TimeInterval
  private let session: URLSession
  private let transport: Transport?

  init(
    session: URLSession? = nil,
    requestTimeoutInterval: TimeInterval = 15,
    transport: Transport? = nil
  ) {
    self.session = session ?? AfilmoryURLSessionFactory.cookieIsolated()
    self.requestTimeoutInterval = requestTimeoutInterval
    self.transport = transport
    decoder = JSONDecoder()
    decoder.keyDecodingStrategy = .convertFromSnakeCase
  }

  func request<Body: Encodable>(
    path: String,
    method: String,
    body: Body,
    cookie: String?,
    headers: [String: String] = [:]
  ) async throws -> NativeAuthHTTPResponse {
    try await execute(
      path: path,
      method: method,
      body: try encoder.encode(body),
      cookie: cookie,
      headers: headers
    )
  }

  func request(
    path: String,
    method: String = "GET",
    cookie: String?,
    headers: [String: String] = [:]
  ) async throws -> NativeAuthHTTPResponse {
    try await execute(path: path, method: method, body: nil, cookie: cookie, headers: headers)
  }

  func decode<Value: Decodable>(_ type: Value.Type, from data: Data) throws -> Value {
    try decoder.decode(type, from: data)
  }

  private func execute(
    path: String,
    method: String,
    body: Data?,
    cookie: String?,
    headers: [String: String]
  ) async throws -> NativeAuthHTTPResponse {
    let base = ApiEnvironmentStore.shared.platformAPIBaseURL()
    let url = base.appending(path: path.trimmingCharacters(in: CharacterSet(charactersIn: "/")))
    var request = URLRequest(url: url)
    request.httpMethod = method
    request.httpBody = body
    request.timeoutInterval = requestTimeoutInterval
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    if !["GET", "HEAD", "OPTIONS"].contains(method.uppercased()) {
      request.setValue("\(AfilmoryBuildConfiguration.urlScheme)://", forHTTPHeaderField: "Origin")
    }
    if body != nil {
      request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    }
    if let cookie, !cookie.isEmpty {
      request.setValue(cookie, forHTTPHeaderField: "Cookie")
    }
    for (name, value) in headers {
      request.setValue(value, forHTTPHeaderField: name)
    }

    let data: Data
    let response: URLResponse
    do {
      if let transport {
        (data, response) = try await transport(request)
      } else {
        (data, response) = try await session.data(for: request)
      }
    } catch let error as URLError where error.code == .cancelled {
      throw NativeAuthError.cancelled
    } catch {
      throw error
    }

    guard let http = response as? HTTPURLResponse else {
      throw NativeAuthError.invalidResponse
    }
    guard (200..<300).contains(http.statusCode) else {
      let envelope = try? decoder.decode(ServerErrorEnvelope.self, from: data)
      let fallback = String(data: data, encoding: .utf8)
      throw NativeAuthError.server(
        envelope?.message ?? envelope?.error ?? fallback?.trimmingCharacters(in: .whitespacesAndNewlines)
          ?? "HTTP \(http.statusCode)"
      )
    }

    let mergedCookie = Self.merge(
      setCookieHeader: http.value(forHTTPHeaderField: "Set-Cookie"),
      into: cookie
    )
    return NativeAuthHTTPResponse(data: data, cookie: mergedCookie)
  }

  static func merge(setCookieHeader: String?, into cookie: String?) -> String? {
    var values = parseCookieHeader(cookie)
    guard let setCookieHeader, !setCookieHeader.isEmpty else {
      return serialized(values)
    }

    let separatorPattern = ",(?=\\s*(?:(?:__Secure-|__Host-))?afilmory-tenant[^=;,\\s]*=)"
    let normalized = setCookieHeader.replacingOccurrences(
      of: separatorPattern,
      with: "\n",
      options: .regularExpression
    )
    for rawCookie in normalized.split(separator: "\n") {
      let components = rawCookie.split(separator: ";", omittingEmptySubsequences: true)
      guard let pair = components.first,
            let separator = pair.firstIndex(of: "=")
      else { continue }
      let name = pair[..<separator].trimmingCharacters(in: .whitespacesAndNewlines)
      let value = pair[pair.index(after: separator)...].trimmingCharacters(in: .whitespacesAndNewlines)
      let unprefixedName = unprefixedCookieName(name)
      guard unprefixedName.hasPrefix("afilmory-tenant") else { continue }
      let attributes = components.dropFirst().map { $0.lowercased() }
      let expired = attributes.contains { attribute in
        let compact = attribute.replacingOccurrences(of: " ", with: "")
        return compact == "max-age=0" || compact == "max-age=-1"
      }
      if value.isEmpty || expired {
        values.removeValue(forKey: name)
      } else {
        values[name] = value
      }
    }
    return serialized(values)
  }

  static func oauthCallbackValue(named name: String, in callbackURL: URL) -> String? {
    callbackItems(in: callbackURL).first { $0.name == name }?.value
  }

  static func oauthCallbackParameterNames(in callbackURL: URL) -> [String] {
    Array(Set(callbackItems(in: callbackURL).map(\.name))).sorted()
  }

  static func oauthError(in callbackURL: URL) -> String? {
    var values: [String: String] = [:]
    for item in callbackItems(in: callbackURL) {
      guard let value = item.value?.trimmingCharacters(in: .whitespacesAndNewlines),
            !value.isEmpty
      else { continue }
      values[item.name.lowercased()] = value
    }

    let description = values["error_description"]
      ?? values["errordescription"]
      ?? values["message"]
    let code = values["error"]
    switch (description, code) {
    case let (.some(description), .some(code)) where description != code:
      return "\(description) (\(code))"
    case let (.some(description), _):
      return description
    case let (_, .some(code)):
      return code
    default:
      return nil
    }
  }

  private static func callbackItems(in callbackURL: URL) -> [URLQueryItem] {
    guard let components = URLComponents(url: callbackURL, resolvingAgainstBaseURL: false) else {
      return []
    }
    var items = components.queryItems ?? []
    if let fragment = components.fragment,
       let fragmentItems = URLComponents(string: "https://callback.invalid/?\(fragment)")?.queryItems
    {
      items.append(contentsOf: fragmentItems)
    }
    return items
  }

  private static func unprefixedCookieName(_ name: String) -> String {
    if name.hasPrefix("__Secure-") {
      return String(name.dropFirst("__Secure-".count))
    }
    if name.hasPrefix("__Host-") {
      return String(name.dropFirst("__Host-".count))
    }
    return name
  }

  private static func parseCookieHeader(_ header: String?) -> [String: String] {
    guard let header else { return [:] }
    var result: [String: String] = [:]
    for rawPair in header.split(separator: ";", omittingEmptySubsequences: true) {
      guard let separator = rawPair.firstIndex(of: "=") else { continue }
      let name = rawPair[..<separator].trimmingCharacters(in: .whitespacesAndNewlines)
      let value = rawPair[rawPair.index(after: separator)...].trimmingCharacters(in: .whitespacesAndNewlines)
      guard !name.isEmpty else { continue }
      result[name] = value
    }
    return result
  }

  private static func serialized(_ values: [String: String]) -> String? {
    guard !values.isEmpty else { return nil }
    return values.keys.sorted().map { "\($0)=\(values[$0]!)" }.joined(separator: "; ")
  }
}

@MainActor
final class NativeAuthenticationService {
  static let shared = NativeAuthenticationService()

  private static let logger = Logger(subsystem: "app.afilmory", category: "native-authentication")

  private let authorizations = NativeAuthorizationSessions.shared
  private let client = NativeAuthHTTPClient()
  private let sessionStore = AfilmorySessionStore.shared

  func isAppleAuthenticationAvailable() async -> Bool {
    guard AfilmoryBuildConfiguration.supportsAppleAuthentication else { return false }
    do {
      let response = try await client.request(
        path: "mobile-auth/apple/configuration",
        cookie: nil
      )
      let configuration = try client.decode(AppleAuthenticationConfiguration.self, from: response.data)
      return configuration.enabled
    } catch {
      return false
    }
  }

  func signInWithPassword(email: String, password: String) async throws {
    let response = try await client.request(
      path: "auth/sign-in/email",
      method: "POST",
      body: EmailSignInBody(email: email, password: password),
      cookie: sessionStore.current().cookie
    )
    try await registerValidated(cookie: response.cookie)
  }

  func signIn(with provider: NativeAuthProvider, anchor: UIWindow) async throws {
    let oauthState = try authorizations.makeOAuthState()
    let authBase = ApiEnvironmentStore.shared.platformAPIBaseURL().appending(path: "auth")
    guard let completionURL = Self.nativeOAuthBridgeURL(
      authBase: authBase,
      path: "native/oauth/complete",
      state: oauthState
    ),
    let errorURL = Self.nativeOAuthBridgeURL(
      authBase: authBase,
      path: "native/oauth/error",
      state: oauthState
    )
    else { throw NativeAuthError.invalidResponse }

    let initial = try await client.request(
      path: "auth/sign-in/social",
      method: "POST",
      body: SocialSignInBody(
        provider: provider.rawValue,
        callbackURL: completionURL.absoluteString,
        errorCallbackURL: errorURL.absoluteString
      ),
      cookie: sessionStore.current().cookie
    )
    let signIn = try client.decode(SocialSignInResponse.self, from: initial.data)
    guard signIn.redirect != false,
          let signInURLString = signIn.url,
          let signInURL = URL(string: signInURLString)
    else { throw NativeAuthError.invalidResponse }

    let callback = try await authorizations.openWebAuthentication(
      url: signInURL,
      callbackScheme: AfilmoryBuildConfiguration.urlScheme,
      anchor: anchor
    )
    let callbackParameterNames = NativeAuthHTTPClient.oauthCallbackParameterNames(in: callback)
    Self.logger.notice(
      "OAuth callback received for \(provider.displayName, privacy: .public); parameters=\(callbackParameterNames.joined(separator: ","), privacy: .public)"
    )
    guard NativeAuthHTTPClient.oauthCallbackValue(named: "state", in: callback) == oauthState else {
      throw NativeAuthError.oauthStateMismatch(provider.displayName)
    }
    if let callbackError = NativeAuthHTTPClient.oauthError(in: callback) {
      throw NativeAuthError.server(callbackError)
    }
    guard let code = NativeAuthHTTPClient.oauthCallbackValue(named: "code", in: callback),
          !code.isEmpty
    else { throw NativeAuthError.oauthCallbackMissingCode(provider.displayName) }

    let exchange = try await client.request(
      path: "auth/one-time-token/verify",
      method: "POST",
      body: OneTimeTokenVerificationBody(token: code),
      cookie: nil
    )
    try await registerValidated(
      cookie: exchange.cookie,
      invalidSessionError: .oauthSessionRejected(provider.displayName)
    )
  }

  func signInWithApple(anchor: UIWindow) async throws {
    let authorization = try await authorizations.requestAppleAuthorization(anchor: anchor)
    do {
      let response = try await client.request(
        path: "auth/sign-in/social",
        method: "POST",
        body: AppleSignInBody(
          callbackURL: "/",
          idToken: .init(
            nonce: authorization.nonce,
            token: authorization.identityToken,
            user: .init(
              email: authorization.email,
              name: .init(firstName: authorization.firstName, lastName: authorization.lastName)
            )
          ),
          provider: "apple",
          requestSignUp: true
        ),
        cookie: nil
      )
      guard let cookie = response.cookie else { throw NativeAuthError.missingSession }
      _ = try await client.request(
        path: "mobile-auth/apple/exchange",
        method: "POST",
        body: AppleExchangeBody(
          authorizationCode: authorization.authorizationCode,
          identityToken: authorization.identityToken,
          nonce: authorization.nonce
        ),
        cookie: cookie
      )
      try await registerValidated(cookie: cookie)
    } catch {
      sessionStore.clearSession()
      throw error
    }
  }

  func appleDeletionProof(anchor: UIWindow) async throws -> AccountDeletionProof {
    let authorization = try await authorizations.requestAppleAuthorization(anchor: anchor)
    return .apple(identityToken: authorization.identityToken, nonce: authorization.nonce)
  }

  func signOut() async {
    let cookie = sessionStore.current().cookie
    _ = try? await client.request(
      path: "auth/sign-out",
      method: "POST",
      cookie: cookie
    )
    sessionStore.clearSession()
  }

  func createWorkspace(name: String, slug: String) async throws {
    guard let cookie = sessionStore.current().cookie else { throw NativeAuthError.missingSession }
    _ = try await client.request(
      path: "auth/sign-up/email",
      method: "POST",
      body: WorkspaceCreationBody(
        tenant: .init(name: name, slug: slug),
        useSessionAccount: true
      ),
      cookie: cookie
    )
    try await registerValidated(cookie: cookie, requiresWorkspace: true)
  }

  func switchWorkspace(tenantId: String) async throws {
    guard let cookie = sessionStore.current().cookie else { throw NativeAuthError.missingSession }
    let response = try await client.request(
      path: "auth/workspaces/switch",
      method: "POST",
      body: WorkspaceSwitchBody(tenantId: tenantId),
      cookie: cookie
    )
    try await registerValidated(cookie: response.cookie ?? cookie)
  }

  func loadAccountDeletionImpact() async throws -> AccountDeletionImpact {
    guard let cookie = sessionStore.current().cookie else { throw NativeAuthError.missingSession }
    let response = try await client.request(path: "account-deletion/impact", cookie: cookie)
    return try client.decode(AccountDeletionImpact.self, from: response.data)
  }

  func deleteAccount(proof: AccountDeletionProof) async throws -> AccountDeletionRequestResult {
    guard let cookie = sessionStore.current().cookie else { throw NativeAuthError.missingSession }
    let response = try await client.request(
      path: "account-deletion/request",
      method: "POST",
      body: AccountDeletionBody(proof: proof),
      cookie: cookie
    )
    let result = try client.decode(AccountDeletionRequestResult.self, from: response.data)
    sessionStore.clearSession()
    return result
  }

  private static func nativeOAuthBridgeURL(authBase: URL, path: String, state: String) -> URL? {
    var components = URLComponents(
      url: authBase.appending(path: path),
      resolvingAgainstBaseURL: false
    )
    components?.queryItems = [
      URLQueryItem(name: "scheme", value: AfilmoryBuildConfiguration.urlScheme),
      URLQueryItem(name: "state", value: state),
    ]
    return components?.url
  }

  private func registerValidated(
    cookie: String?,
    requiresWorkspace: Bool = false,
    invalidSessionError: NativeAuthError = .missingSession
  ) async throws {
    guard let cookie, !cookie.isEmpty else { throw NativeAuthError.missingSession }
    let response = try await client.request(path: "auth/session", cookie: cookie)
    let session = try client.decode(AfilmorySessionResponse.self, from: response.data).resolved()
    guard let session, !requiresWorkspace || session.activeWorkspace != nil else {
      throw invalidSessionError
    }
    Self.logger.notice(
      "Validated native session before persistence; cookieBytes=\((response.cookie ?? cookie).utf8.count, privacy: .public)"
    )
    ApiEnvironmentStore.shared.activateTenant(slug: session.activeWorkspace?.slug)
    sessionStore.register(cookie: response.cookie ?? cookie)
  }
}
