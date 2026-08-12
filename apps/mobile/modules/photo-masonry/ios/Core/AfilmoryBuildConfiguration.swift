import Foundation

enum AfilmoryBuildVariant: String, Sendable {
  case local
  case production
}

enum AfilmoryBuildConfiguration {
  static var variant: AfilmoryBuildVariant {
    guard let rawValue = Bundle.main.object(forInfoDictionaryKey: "AfilmoryAppVariant") as? String,
          let variant = AfilmoryBuildVariant(rawValue: rawValue)
    else { return .production }
    return variant
  }

  static var defaultApiEnvironment: ApiEnvironment {
    switch variant {
    case .local: .local
    case .production: .production
    }
  }

  static var urlScheme: String {
    if let configured = Bundle.main.object(forInfoDictionaryKey: "AfilmoryURLScheme") as? String,
       !configured.isEmpty {
      return configured
    }
    return variant == .local ? "afilmory-local" : "afilmory"
  }

  static var appGroupIdentifier: String? {
    guard variant == .production else { return nil }
    return (Bundle.main.object(forInfoDictionaryKey: "AfilmoryAppGroupIdentifier") as? String)
      ?? "group.app.afilmory"
  }

  static var supportsAppleAuthentication: Bool { variant == .production }
  static var supportsPushNotifications: Bool { variant == .production }
  static var supportsShareExtension: Bool { variant == .production }
  static var supportsStoreKitSponsorship: Bool { variant == .production }
  static var supportsStoreKitBilling: Bool { variant == .production }

  static var allowsApiEnvironmentOverride: Bool {
    #if DEBUG
      true
    #else
      false
    #endif
  }
}
