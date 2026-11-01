#if DEBUG
  import Foundation

  struct FixtureRequest {
    let method: String
    let segments: [String]
    let query: [String: String]
    let host: String
    let body: [String: Any]
    let scenario: FixtureScenario
    let state: FixtureState

    init(request: URLRequest, body: Data?, scenario: FixtureScenario, state: FixtureState) {
      let url = request.url
      method = (request.httpMethod ?? "GET").uppercased()
      host = url?.host?.lowercased() ?? ""
      var parts = (url?.path ?? "").split(separator: "/").map(String.init)
      if parts.first == "api" {
        parts.removeFirst()
      }
      segments = parts
      var query: [String: String] = [:]
      for item in URLComponents(url: url ?? URL(string: "about:blank")!, resolvingAgainstBaseURL: false)?.queryItems ?? [] {
        query[item.name] = item.value ?? ""
      }
      self.query = query
      self.body = body.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] } ?? [:]
      self.scenario = scenario
      self.state = state
    }

    var isMedia: Bool {
      host == FixtureMode.host && segments.first == "media"
    }

    var tenantSlug: String? {
      let labels = host.split(separator: ".").map(String.init)
      guard labels.count > 1,
            let first = labels.first,
            first != "api", first != "www",
            !labels.allSatisfy({ Int($0) != nil })
      else { return nil }
      return first
    }

    func match(_ method: String, _ pattern: String) -> [String]? {
      guard self.method == method else { return nil }
      let parts = pattern.split(separator: "/").map(String.init)
      guard parts.count == segments.count else { return nil }
      var captures: [String] = []
      for (part, segment) in zip(parts, segments) {
        if part.hasPrefix(":") {
          captures.append(segment.removingPercentEncoding ?? segment)
        } else if part != segment {
          return nil
        }
      }
      return captures
    }

    func string(_ key: String) -> String? {
      body[key] as? String
    }

    func int(_ key: String, default fallback: Int) -> Int {
      query[key].flatMap(Int.init) ?? fallback
    }
  }

  func orNull(_ value: Any?) -> Any {
    value ?? NSNull()
  }

  enum FixtureReply {
    static func json(_ object: Any, status: Int = 200, headers: [String: String] = [:]) -> FixtureResponse {
      let data = (try? JSONSerialization.data(withJSONObject: object, options: [.fragmentsAllowed])) ?? Data("null".utf8)
      var response = FixtureResponse.json(data, status: status)
      response.headers.merge(headers) { _, new in new }
      return response
    }

    static func error(_ status: Int, _ message: String, code: String? = nil, details: [String: Any]? = nil) -> FixtureResponse {
      var payload: [String: Any] = ["message": message]
      if let code { payload["code"] = code }
      if let details { payload["details"] = details }
      return json(payload, status: status)
    }

    static var unauthorized: FixtureResponse {
      error(401, "Authentication required", code: "UNAUTHORIZED")
    }

    static var forbidden: FixtureResponse {
      error(403, "You do not have access to this workspace", code: "FORBIDDEN")
    }

    static func sessionCookie(_ scenario: FixtureScenario) -> [String: String] {
      ["Set-Cookie": "afilmory-tenant-session=fixture-\(scenario.rawValue); Path=/; HttpOnly"]
    }

    static func eventStream(_ frames: [(event: String, data: Any)]) -> FixtureResponse {
      var text = ""
      for frame in frames {
        let data = (try? JSONSerialization.data(withJSONObject: frame.data)) ?? Data("{}".utf8)
        text += "event: \(frame.event)\ndata: \(String(decoding: data, as: UTF8.self))\n\n"
      }
      return FixtureResponse(status: 200, headers: ["Content-Type": "text/event-stream"], body: Data(text.utf8))
    }

    static var idleEventStream: FixtureResponse {
      FixtureResponse(
        status: 200,
        headers: ["Content-Type": "text/event-stream", FixtureResponse.holdOpenHeader: "1"],
        body: Data(": connected\n\n".utf8)
      )
    }
  }

  enum FixtureClock {
    static func iso(_ date: Date) -> String {
      date.formatted(Date.ISO8601FormatStyle(includingFractionalSeconds: true))
    }

    static func ago(days: Double = 0, hours: Double = 0, minutes: Double = 0, from now: Date = Date()) -> Date {
      now.addingTimeInterval(-(days * 86400 + hours * 3600 + minutes * 60))
    }

    static func day(_ date: Date, timeZone: TimeZone) -> String {
      var calendar = Calendar(identifier: .gregorian)
      calendar.timeZone = timeZone
      let parts = calendar.dateComponents([.year, .month, .day], from: date)
      return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
    }

    static func month(_ date: Date) -> String {
      String(day(date, timeZone: .current).prefix(7))
    }

    static func stableNumber(_ seed: String, modulo: Int) -> Int {
      let sum = seed.unicodeScalars.reduce(0) { ($0 &* 31 &+ Int($1.value)) & 0x7FFF_FFFF }
      return sum % max(modulo, 1)
    }
  }
#endif
