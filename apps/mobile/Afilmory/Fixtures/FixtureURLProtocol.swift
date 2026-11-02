#if DEBUG
  import Foundation
  import OSLog
  import SDWebImage

  struct FixtureResponse: Sendable {
    static let holdOpenHeader = "X-Fixture-Hold-Open"

    var status: Int
    var headers: [String: String]
    var body: Data

    static func json(_ data: Data, status: Int = 200) -> FixtureResponse {
      FixtureResponse(status: status, headers: ["Content-Type": "application/json"], body: data)
    }

    static func notFound(_ path: String) -> FixtureResponse {
      .json(Data(#"{"message":"No fixture for \#(path)","code":"FIXTURE_NOT_FOUND"}"#.utf8), status: 404)
    }
  }

  final class FixtureURLProtocol: URLProtocol, @unchecked Sendable {
    private static let logger = Logger(subsystem: "app.afilmory", category: "fixture")
    private var cancelled = false

    override class func canInit(with request: URLRequest) -> Bool {
      guard FixtureMode.isOn, let scheme = request.url?.scheme?.lowercased() else { return false }
      return scheme == "http" || scheme == "https"
    }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest {
      request
    }

    override func startLoading() {
      let request = self.request
      let body = request.httpBody ?? request.httpBodyStream.flatMap(Self.read)
      let response = FixtureBackend.respond(to: request, body: body, scenario: FixtureMode.scenario)
      if response.status == 404 {
        Self.logger.error("Fixture miss: \(request.httpMethod ?? "GET", privacy: .public) \(request.url?.absoluteString ?? "", privacy: .public)")
      }
      let isMedia = request.url?.path.hasPrefix("/media/") == true
      if isMedia, response.status == 200 {
        streamMedia(response)
        return
      }
      DispatchQueue.global(qos: .userInitiated).asyncAfter(deadline: .now() + FixtureMode.latency) { [weak self] in
        guard let self, !self.cancelled, let url = request.url else { return }
        let isSession = url.path.hasSuffix("/auth/session")
        guard FixtureMode.scenario != .offline || isMedia || isSession else {
          self.client?.urlProtocol(self, didFailWithError: URLError(.notConnectedToInternet))
          return
        }
        let http = HTTPURLResponse(url: url, statusCode: response.status, httpVersion: "HTTP/1.1", headerFields: response.headers)!
        self.client?.urlProtocol(self, didReceive: http, cacheStoragePolicy: .notAllowed)
        self.client?.urlProtocol(self, didLoad: response.body)
        guard response.headers[FixtureResponse.holdOpenHeader] == nil else { return }
        self.client?.urlProtocolDidFinishLoading(self)
      }
    }

    private func streamMedia(_ response: FixtureResponse) {
      guard let url = request.url else { return }
      let chunks = 20
      let body = response.body
      let step = FixtureMode.mediaStreamDuration(bytes: body.count) / Double(chunks)
      var headers = response.headers
      headers["Content-Length"] = String(body.count)
      let queue = DispatchQueue.global(qos: .userInitiated)
      let size = max(1, (body.count + chunks - 1) / chunks)
      queue.asyncAfter(deadline: .now() + step) { [weak self] in
        guard let self, !self.cancelled else { return }
        let http = HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: headers)!
        self.client?.urlProtocol(self, didReceive: http, cacheStoragePolicy: .notAllowed)
        self.deliver(chunk: 0, of: chunks, size: size, body: body, step: step, queue: queue)
      }
    }

    private func deliver(chunk index: Int, of chunks: Int, size: Int, body: Data, step: TimeInterval, queue: DispatchQueue) {
      queue.asyncAfter(deadline: .now() + step) { [weak self] in
        guard let self, !self.cancelled else { return }
        if FixtureMode.mediaFails, index == chunks / 2 {
          self.cancelled = true
          self.client?.urlProtocol(self, didFailWithError: URLError(.networkConnectionLost))
          return
        }
        let start = index * size
        if start < body.count {
          self.client?.urlProtocol(self, didLoad: body.subdata(in: start ..< min(body.count, start + size)))
        }
        if index == chunks - 1 {
          self.client?.urlProtocolDidFinishLoading(self)
        } else {
          self.deliver(chunk: index + 1, of: chunks, size: size, body: body, step: step, queue: queue)
        }
      }
    }

    override func stopLoading() {
      cancelled = true
    }

    private static func read(_ stream: InputStream) -> Data {
      stream.open()
      defer { stream.close() }
      var data = Data()
      var buffer = [UInt8](repeating: 0, count: 16 * 1024)
      while stream.hasBytesAvailable {
        let count = stream.read(&buffer, maxLength: buffer.count)
        guard count > 0 else { break }
        data.append(buffer, count: count)
      }
      return data
    }
  }

  @MainActor
  enum FixtureRuntime {
    static func activate() {
      guard FixtureMode.isOn else { return }
      SDImageCache.defaultDiskCacheDirectory = FixtureMode.imageCacheDirectory()
      URLProtocol.registerClass(FixtureURLProtocol.self)
      let imageConfiguration = SDWebImageDownloaderConfig.default.sessionConfiguration ?? .default
      imageConfiguration.protocolClasses = [FixtureURLProtocol.self] + (imageConfiguration.protocolClasses ?? [])
      SDWebImageDownloaderConfig.default.sessionConfiguration = imageConfiguration
      if UserDefaults.standard.object(forKey: "fixture.reduceMotion") != nil {
        AFMotion.reduceMotionOverride = UserDefaults.standard.bool(forKey: "fixture.reduceMotion")
      }
    }

    nonisolated static func sessionConfiguration(_ configuration: URLSessionConfiguration) -> URLSessionConfiguration {
      guard FixtureMode.isOn else { return configuration }
      configuration.protocolClasses = [FixtureURLProtocol.self] + (configuration.protocolClasses ?? [])
      return configuration
    }
  }
#endif
