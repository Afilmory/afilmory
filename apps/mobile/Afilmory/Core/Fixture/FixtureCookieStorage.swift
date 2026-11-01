import Foundation

final class FixtureCookieStorage: SessionCookieStorage, @unchecked Sendable {
  private let lock = NSLock()
  private var cookie: String?

  init(signedIn: Bool) {
    cookie = signedIn ? "afilmory.session_token=fixture" : nil
  }

  func read() -> String? {
    lock.withLock { cookie }
  }

  func write(_ cookie: String) {
    lock.withLock { self.cookie = cookie }
  }

  func clear() {
    lock.withLock { cookie = nil }
  }
}
