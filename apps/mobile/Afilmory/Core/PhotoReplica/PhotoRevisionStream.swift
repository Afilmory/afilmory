import Foundation
import UIKit

@MainActor
final class PhotoRevisionStream {
  static let shared = PhotoRevisionStream()

  private var task: Task<Void, Never>?
  private var foregroundObserver: NSObjectProtocol?
  private var sessionObservation: AfilmorySessionObservationToken?

  func start() {
    if foregroundObserver == nil {
      foregroundObserver = NotificationCenter.default.addObserver(
        forName: UIApplication.didBecomeActiveNotification,
        object: nil,
        queue: .main
      ) { [weak self] _ in
        Task { @MainActor in
          self?.catchUpActiveWorkspace()
          self?.restart()
        }
      }
    }
    if sessionObservation == nil {
      sessionObservation = AfilmorySessionStore.shared.observe { [weak self] _ in
        Task { @MainActor in
          self?.catchUpActiveWorkspace()
          self?.restart()
        }
      }
    }
    catchUpActiveWorkspace()
    restart()
  }

  func stop() {
    task?.cancel()
    task = nil
  }

  private func catchUpActiveWorkspace() {
    guard case .signedIn(let session) = AfilmorySessionStore.shared.current().state,
          let slug = session.activeWorkspace?.slug
    else { return }
    PhotoSyncEngine.shared.ensureSynced(slug: slug, includeStudio: false)
  }

  private func restart() {
    task?.cancel()
    guard case .signedIn(let session) = AfilmorySessionStore.shared.current().state,
          session.activeWorkspace?.slug != nil
    else { return }

    task = Task.detached {
      var policy = RevisionStreamReconnectPolicy()
      while !Task.isCancelled {
        let started = Date()
        var failed = false
        do {
          try await Self.listen()
        } catch {
          failed = true
        }
        if Task.isCancelled { return }
        let delay = policy.nextDelay(connectedFor: Date().timeIntervalSince(started), failed: failed)
        try? await Task.sleep(for: .seconds(delay))
      }
    }
  }

  private static func listen() async throws {
    let snapshot = AfilmorySessionStore.shared.current()
    guard let tenantBaseURL = snapshot.tenantBaseURL,
          let url = URL(string: tenantBaseURL.trimmingCharacters(in: CharacterSet(charactersIn: "/")) + "/manifest/events")
    else { return }

    var request = URLRequest(url: url)
    request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
    if let cookie = snapshot.cookie {
      request.setValue(cookie, forHTTPHeaderField: "Cookie")
    }

    let (bytes, response) = try await URLSession.shared.bytes(for: request)
    if let http = response as? HTTPURLResponse {
      if http.statusCode == 401 {
        throw APIError.unauthorized
      }
      guard (200..<300).contains(http.statusCode) else {
        throw URLError(.badServerResponse)
      }
    }

    var dataLines: [String] = []
    for try await line in bytes.lines {
      try Task.checkCancellation()
      if line.isEmpty {
        if let payload = dataLines.joined(separator: "\n").data(using: .utf8),
           (try? JSONDecoder().decode(RevisionWakeup.self, from: payload)) != nil
        {
          await MainActor.run {
            guard case .signedIn(let session) = AfilmorySessionStore.shared.current().state,
                  let slug = session.activeWorkspace?.slug
            else { return }
            PhotoSyncEngine.shared.ensureSynced(slug: slug)
          }
        }
        dataLines = []
        continue
      }
      if line.hasPrefix("data:") {
        dataLines.append(String(line.dropFirst(5)).trimmingCharacters(in: .whitespaces))
      }
    }
  }
}

struct RevisionStreamReconnectPolicy {
  private static let stableConnection: TimeInterval = 30
  private static let maximumDelay: TimeInterval = 30
  private var consecutiveShortLived = 0

  mutating func nextDelay(connectedFor duration: TimeInterval, failed: Bool) -> TimeInterval {
    if !failed, duration >= Self.stableConnection {
      consecutiveShortLived = 0
      return 1
    }
    let delay = min(Self.maximumDelay, 3 * pow(2, Double(consecutiveShortLived)))
    consecutiveShortLived += 1
    return delay
  }
}

private struct RevisionWakeup: Decodable {
  let type: String
  let revision: Int
}
