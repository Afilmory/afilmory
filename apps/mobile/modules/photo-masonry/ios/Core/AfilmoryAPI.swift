import Foundation

private enum AfilmoryAPIConfigurationError: LocalizedError {
  case invalidBaseURL
  case invalidRequestURL
  case missingPlatformBaseURL
  case missingTenantBaseURL
  case nonHTTPResponse

  var errorDescription: String? {
    switch self {
    case .invalidBaseURL:
      "The request base URL is invalid."
    case .invalidRequestURL:
      "The request URL is invalid."
    case .missingPlatformBaseURL:
      "The platform API environment has not been registered."
    case .missingTenantBaseURL:
      "The tenant API environment has not been registered."
    case .nonHTTPResponse:
      "The server did not return an HTTP response."
    }
  }
}

enum ManifestFetchOutcome: Sendable {
  case notModified
  case success(Data, etag: String?)
}

final class AfilmoryAPI: @unchecked Sendable {
  static let shared = AfilmoryAPI()

  private let session: URLSession
  private let sessionStore: AfilmorySessionStore
  private let decoder: JSONDecoder

  init(
    session: URLSession = .shared,
    sessionStore: AfilmorySessionStore = .shared
  ) {
    self.session = session
    self.sessionStore = sessionStore
    decoder = JSONDecoder()
    decoder.keyDecodingStrategy = .convertFromSnakeCase
  }

  func request<Response: Decodable>(_ endpoint: APIEndpoint) async throws -> Response {
    try await request(endpoint, sessionSnapshot: nil)
  }

  func request<Response: Decodable>(
    _ endpoint: APIEndpoint,
    using sessionSnapshot: AfilmorySessionSnapshot
  ) async throws -> Response {
    try await request(endpoint, sessionSnapshot: sessionSnapshot)
  }

  private func request<Response: Decodable>(
    _ endpoint: APIEndpoint,
    sessionSnapshot: AfilmorySessionSnapshot?
  ) async throws -> Response {
    let attempts: Int
    let retryDelay: TimeInterval
    switch endpoint.retryPolicy {
    case .none:
      attempts = 1
      retryDelay = 0
    case .transientGET(let maxAttempts, let delay):
      attempts = max(1, maxAttempts)
      retryDelay = max(0, delay)
    }

    var latestError: APIError = .cancelled
    for attempt in 1...attempts {
      do {
        return try await perform(endpoint, sessionSnapshot: sessionSnapshot)
      } catch {
        let apiError = APIError.request(error)
        latestError = apiError
        guard attempt < attempts, shouldRetry(apiError) else {
          throw apiError
        }
        do {
          try await Task.sleep(for: .seconds(retryDelay))
        } catch {
          throw APIError.request(error)
        }
      }
    }
    throw latestError
  }

  private func perform<Response: Decodable>(
    _ endpoint: APIEndpoint,
    sessionSnapshot: AfilmorySessionSnapshot?
  ) async throws -> Response {
    try Task.checkCancellation()
    let sessionSnapshot = sessionSnapshot ?? sessionStore.current()
    let url = try resolveURL(for: endpoint, sessionSnapshot: sessionSnapshot)

    var request = URLRequest(url: url)
    request.httpMethod = endpoint.method.rawValue
    request.httpBody = endpoint.body
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    if endpoint.body != nil {
      request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    }
    if let cookie = sessionSnapshot.cookie, !cookie.isEmpty {
      request.setValue(cookie, forHTTPHeaderField: "Cookie")
    }

    let data: Data
    let response: URLResponse
    do {
      (data, response) = try await session.data(for: request)
    } catch {
      throw APIError.request(error)
    }

    guard let httpResponse = response as? HTTPURLResponse else {
      throw APIError.transport(AfilmoryAPIConfigurationError.nonHTTPResponse)
    }
    if let responseError = APIError.response(status: httpResponse.statusCode, body: data) {
      throw responseError
    }

    do {
      return try decoder.decode(Response.self, from: data)
    } catch {
      throw APIError.decoding(error)
    }
  }

  private func shouldRetry(_ error: APIError) -> Bool {
    switch error {
    case .transport:
      true
    case .http(let status, _):
      status == 408 || status == 429 || status >= 500
    case .unauthorized, .decoding, .cancelled:
      false
    }
  }

  func fetchManifest(_ endpoint: APIEndpoint, etag: String?) async throws -> ManifestFetchOutcome {
    try Task.checkCancellation()
    let sessionSnapshot = sessionStore.current()
    let url = try resolveURL(for: endpoint, sessionSnapshot: sessionSnapshot)

    var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData)
    request.httpMethod = endpoint.method.rawValue
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    if let etag, !etag.isEmpty {
      request.setValue(etag, forHTTPHeaderField: "If-None-Match")
    }
    if let cookie = sessionSnapshot.cookie, !cookie.isEmpty {
      request.setValue(cookie, forHTTPHeaderField: "Cookie")
    }

    let data: Data
    let response: URLResponse
    do {
      (data, response) = try await session.data(for: request)
    } catch {
      throw APIError.request(error)
    }

    guard let httpResponse = response as? HTTPURLResponse else {
      throw APIError.transport(AfilmoryAPIConfigurationError.nonHTTPResponse)
    }
    if httpResponse.statusCode == 304 {
      return .notModified
    }
    if let responseError = APIError.response(status: httpResponse.statusCode, body: data) {
      throw responseError
    }
    return .success(data, etag: httpResponse.value(forHTTPHeaderField: "ETag"))
  }

  private func resolveURL(for endpoint: APIEndpoint, sessionSnapshot: AfilmorySessionSnapshot) throws -> URL {
    let baseURL = switch endpoint.baseURL {
    case .platform:
      sessionSnapshot.platformBaseURL
    case .tenant:
      sessionSnapshot.tenantBaseURL
    case .explicit(let value):
      value
    }

    guard let baseURL else {
      let error: AfilmoryAPIConfigurationError = switch endpoint.baseURL {
      case .platform: .missingPlatformBaseURL
      case .tenant: .missingTenantBaseURL
      case .explicit: .invalidBaseURL
      }
      throw APIError.transport(error)
    }
    guard var components = URLComponents(
      string: baseURL.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        + "/"
        + endpoint.path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
    ) else {
      throw APIError.transport(AfilmoryAPIConfigurationError.invalidRequestURL)
    }
    if !endpoint.queryItems.isEmpty {
      components.queryItems = endpoint.queryItems
    }
    guard let url = components.url else {
      throw APIError.transport(AfilmoryAPIConfigurationError.invalidRequestURL)
    }
    return url
  }
}
