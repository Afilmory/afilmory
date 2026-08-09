import Foundation
import Security

struct ApiEnvironment: Codable, Equatable, Sendable {
  let id: String
  let label: String
  let scheme: String
  let platformHost: String
  let baseDomain: String
  let port: Int?

  static let production = ApiEnvironment(
    id: "production",
    label: "Production",
    scheme: "https",
    platformHost: "api.afilmory.art",
    baseDomain: "afilmory.art",
    port: nil
  )

  static let local = ApiEnvironment(
    id: "local",
    label: "Local",
    scheme: "http",
    platformHost: "localhost:1841",
    baseDomain: "localhost",
    port: 1841
  )
}

final class ApiEnvironmentStore: @unchecked Sendable {
  static let shared = ApiEnvironmentStore()

  private static var service: String {
    "\(Bundle.main.bundleIdentifier ?? "app.afilmory").api.environment"
  }
  private static let account = "active-environment"
  private let lock = NSLock()
  private var environment: ApiEnvironment

  private init() {
    environment = Self.storedOrBuildDefault()
  }

  func current() -> ApiEnvironment {
    lock.lock()
    defer { lock.unlock() }
    return environment
  }

  func set(_ environment: ApiEnvironment) throws {
    guard AfilmoryBuildConfiguration.allowsApiEnvironmentOverride else {
      throw NSError(
        domain: "app.afilmory.api-environment",
        code: 1,
        userInfo: [NSLocalizedDescriptionKey: "API environment overrides are unavailable in release builds."]
      )
    }
    guard environment.scheme == "http" || environment.scheme == "https",
          URL(string: "\(environment.scheme)://\(environment.platformHost)")?.host != nil,
          URL(string: "\(environment.scheme)://\(environment.baseDomain)")?.host != nil
    else { throw URLError(.badURL) }
    let data = try JSONEncoder().encode(environment)
    SecItemDelete(Self.query as CFDictionary)
    var attributes = Self.query
    attributes[kSecValueData as String] = data
    attributes[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
    let status = SecItemAdd(attributes as CFDictionary, nil)
    guard status == errSecSuccess else {
      throw NSError(domain: NSOSStatusErrorDomain, code: Int(status))
    }
    lock.lock()
    self.environment = environment
    lock.unlock()
    apply(slug: nil)
  }

  func resetToBuildDefault() {
    let status = SecItemDelete(Self.query as CFDictionary)
    if status != errSecSuccess, status != errSecItemNotFound {
      NSLog("[ApiEnvironmentStore] Unable to reset the API environment: %d", status)
    }
    let fallback = AfilmoryBuildConfiguration.defaultApiEnvironment
    lock.lock()
    environment = fallback
    lock.unlock()
    apply(slug: nil)
  }

  func platformOrigin() -> URL {
    let environment = current()
    return URL(string: "\(environment.scheme)://\(environment.platformHost)")!
  }

  func platformAPIBaseURL() -> URL {
    current().platformAPIBaseURL()
  }

  func galleryOrigin(slug: String) throws -> URL {
    let normalized = slug.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    guard normalized.range(of: "^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$", options: .regularExpression) != nil
    else { throw URLError(.badURL) }
    let environment = current()
    let port = environment.port.map { ":\($0)" } ?? ""
    guard let url = URL(string: "\(environment.scheme)://\(normalized).\(environment.baseDomain)\(port)")
    else { throw URLError(.badURL) }
    return url
  }

  func galleryAPIBaseURL(slug: String) throws -> URL {
    try galleryOrigin(slug: slug).appending(path: "api")
  }

  func activateTenant(slug: String?) {
    apply(slug: slug)
  }

  private func apply(slug: String?) {
    let tenant = slug.flatMap { try? galleryAPIBaseURL(slug: $0).absoluteString }
    AfilmorySessionStore.shared.registerEnvironment(
      platformBaseURL: platformAPIBaseURL().absoluteString,
      tenantBaseURL: tenant
    )
  }

  private static func load() -> ApiEnvironment? {
    var query = query
    query[kSecReturnData as String] = true
    query[kSecMatchLimit as String] = kSecMatchLimitOne
    var result: CFTypeRef?
    guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
          let data = result as? Data
    else { return nil }
    return try? JSONDecoder().decode(ApiEnvironment.self, from: data)
  }

  static func storedOrBuildDefault() -> ApiEnvironment {
    guard AfilmoryBuildConfiguration.allowsApiEnvironmentOverride else {
      return AfilmoryBuildConfiguration.defaultApiEnvironment
    }
    return load() ?? AfilmoryBuildConfiguration.defaultApiEnvironment
  }

  private static var query: [String: Any] {
    [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
    ]
  }
}

extension ApiEnvironment {
  func platformAPIBaseURL() -> URL {
    URL(string: "\(scheme)://\(platformHost)")!.appending(path: "api")
  }
}
