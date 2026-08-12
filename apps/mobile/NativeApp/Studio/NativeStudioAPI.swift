import Foundation
import OSLog

private struct StudioConflictResolutionBody: Encodable {
  let dryRun: Bool
  let strategy: String
}

private struct StudioSyncRunBody: Encodable {
  let dryRun: Bool
}

struct StudioSSEFrame: Equatable, Sendable {
  let event: String?
  let data: String
}

struct StudioSSEFramer: Sendable {
  private var eventName: String?
  private var dataLines: [String] = []

  mutating func consume(_ rawLine: String) -> StudioSSEFrame? {
    let line = rawLine.hasSuffix("\r") ? String(rawLine.dropLast()) : rawLine
    if line.isEmpty {
      return takeFrame()
    }
    if line.hasPrefix("event:") {
      let pending = takeFrame()
      eventName = line.dropFirst(6).trimmingCharacters(in: .whitespaces)
      return pending
    }
    if line.hasPrefix("data:") {
      dataLines.append(line.dropFirst(5).trimmingCharacters(in: .whitespaces))
    }
    return nil
  }

  mutating func finish() -> StudioSSEFrame? {
    takeFrame()
  }

  private mutating func takeFrame() -> StudioSSEFrame? {
    defer {
      eventName = nil
      dataLines.removeAll(keepingCapacity: true)
    }
    guard !dataLines.isEmpty else { return nil }
    return StudioSSEFrame(event: eventName, data: dataLines.joined(separator: "\n"))
  }
}

enum NativeStudioAPI {
  private static let logger = Logger(subsystem: "app.afilmory", category: "studio-data-sync")
  private static let session = AfilmoryURLSessionFactory.cookieIsolated()

  static func analytics() async throws -> StudioAnalyticsResponse {
    try await AfilmoryAPI.shared.request(
      APIEndpoint(baseURL: .tenant, path: "dashboard/analytics")
    )
  }

  static func comments(
    cursor: String? = nil,
    limit: Int = 20,
    status: String? = nil
  ) async throws -> StudioCommentsPage {
    try await AfilmoryAPI.shared.request(
      APIEndpoint(
        baseURL: .tenant,
        path: "comments/all",
        queryItems: [
          cursor.map { URLQueryItem(name: "cursor", value: $0) },
          URLQueryItem(name: "limit", value: String(limit)),
          status.map { URLQueryItem(name: "status", value: $0) },
        ].compactMap { $0 }
      )
    )
  }

  static func deleteComment(id: String) async throws {
    try await mutate(path: "comments/\(id)", method: "DELETE")
  }

  static func dataSyncStatus() async throws -> StudioDataSyncStatusResponse {
    try await AfilmoryAPI.shared.request(
      APIEndpoint(baseURL: .tenant, path: "data-sync/status")
    )
  }

  static func dataSyncConflicts() async throws -> [StudioDataSyncConflictRecord] {
    try await AfilmoryAPI.shared.request(
      APIEndpoint(baseURL: .tenant, path: "data-sync/conflicts")
    )
  }

  static func resolveConflict(id: String, strategy: String) async throws {
    try await mutate(
      path: "data-sync/conflicts/\(id)/resolve",
      method: "POST",
      body: StudioConflictResolutionBody(dryRun: false, strategy: strategy)
    )
  }

  static func siteSettings() async throws -> StudioSiteSchemaResponse {
    try await AfilmoryAPI.shared.request(
      APIEndpoint(baseURL: .tenant, path: "site/settings/ui-schema")
    )
  }

  static func updateSiteSettings(_ entries: [StudioSiteSettingsUpdateBody.Entry]) async throws {
    try await mutate(
      path: "site/settings",
      method: "POST",
      body: StudioSiteSettingsUpdateBody(entries: entries)
    )
  }

  static func runDataSync(
    dryRun: Bool,
    onEvent: @MainActor @escaping (StudioDataSyncProgressEvent) -> Void
  ) async throws {
    let snapshot = AfilmorySessionStore.shared.current()
    guard let baseURL = snapshot.tenantBaseURL,
          let url = URL(string: baseURL)?.appending(path: "data-sync/run")
    else { throw NativeAuthError.missingSession }

    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.httpBody = try JSONEncoder().encode(StudioSyncRunBody(dryRun: dryRun))
    request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    if let cookie = snapshot.cookie {
      request.setValue(cookie, forHTTPHeaderField: "Cookie")
    }

    let (bytes, response) = try await session.bytes(for: request)
    guard let http = response as? HTTPURLResponse else { throw NativeAuthError.invalidResponse }
    guard (200..<300).contains(http.statusCode) else {
      throw NativeAuthError.server("HTTP \(http.statusCode)")
    }

    let decoder = JSONDecoder()
    decoder.keyDecodingStrategy = .convertFromSnakeCase
    var framer = StudioSSEFramer()
    var completed = false

    func emit(_ frame: StudioSSEFrame) async throws {
      guard frame.event == "progress" else { return }
      let data = Data(frame.data.utf8)
      let event: StudioDataSyncProgressEvent
      do {
        event = try decoder.decode(StudioDataSyncProgressEvent.self, from: data)
      } catch {
        logger.error("Could not decode data-sync progress event: \(String(describing: error), privacy: .public)")
        throw error
      }
      if event.type == "error" {
        let message = event.payload.message ?? String(localized: "The server could not complete the operation.")
        if let reason = QuotaWallReason.parse(details: event.payload.details?.dictionary) {
          throw StudioQuotaRejection(message: message, reason: reason)
        }
        throw NativeAuthError.server(
          message
        )
      }
      if event.type == "complete" { completed = true }
      await onEvent(event)
    }

    for try await rawLine in bytes.lines {
      try Task.checkCancellation()
      if let frame = framer.consume(rawLine) {
        try await emit(frame)
      }
    }
    if let frame = framer.finish() {
      try await emit(frame)
    }
    guard completed else {
      throw NativeAuthError.server("The server response was incomplete.")
    }
  }

  private static func mutate<Body: Encodable>(
    path: String,
    method: String,
    body: Body
  ) async throws {
    try await mutate(path: path, method: method, encodedBody: JSONEncoder().encode(body))
  }

  private static func mutate(path: String, method: String) async throws {
    try await mutate(path: path, method: method, encodedBody: nil)
  }

  private static func mutate(path: String, method: String, encodedBody: Data?) async throws {
    let snapshot = AfilmorySessionStore.shared.current()
    guard let baseURL = snapshot.tenantBaseURL,
          let url = URL(string: baseURL)?.appending(path: path)
    else { throw NativeAuthError.missingSession }
    var request = URLRequest(url: url)
    request.httpMethod = method
    request.httpBody = encodedBody
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    if encodedBody != nil {
      request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    }
    if let cookie = snapshot.cookie {
      request.setValue(cookie, forHTTPHeaderField: "Cookie")
    }
    let (data, response) = try await session.data(for: request)
    guard let http = response as? HTTPURLResponse else { throw NativeAuthError.invalidResponse }
    guard (200..<300).contains(http.statusCode) else {
      throw APIError.response(status: http.statusCode, body: data) ?? NativeAuthError.invalidResponse
    }
  }
}
