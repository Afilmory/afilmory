import Foundation

/// Date and time in the photo header/info are hand-formatted per language to match
/// the layout each locale expects, so an arbitrary locale identifier has to collapse
/// onto one of the six the app ships.
enum PhotoDateLanguage {
  case english
  case simplifiedChinese
  case hongKongChinese
  case traditionalChinese
  case japanese
  case korean

  static func resolve(_ localeIdentifier: String) -> PhotoDateLanguage {
    let language = localeIdentifier.replacingOccurrences(of: "_", with: "-").lowercased()
    if language.hasPrefix("zh") {
      if language.contains("hk") || language.contains("mo") {
        return .hongKongChinese
      }
      if language.contains("tw") || language.contains("hant") {
        return .traditionalChinese
      }
      return .simplifiedChinese
    }
    if language.hasPrefix("ja") {
      return .japanese
    }
    if language.hasPrefix("ko") {
      return .korean
    }
    return .english
  }

  /// Keep formatter output aligned with the language selected for this app.
  /// `Locale.current` can retain the device region locale when an app-specific
  /// language (or Xcode's `-testLanguage`) selects another bundle localization.
  static var activeLocaleIdentifier: String {
    let localization = Bundle.main.preferredLocalizations.first
      ?? Locale.preferredLanguages.first
      ?? Locale.current.identifier
    return resolve(localization).formattingLocale.identifier
  }

  var formattingLocale: Locale {
    switch self {
    case .english: Locale(identifier: "en_US")
    case .simplifiedChinese: Locale(identifier: "zh-CN")
    case .hongKongChinese: Locale(identifier: "zh-HK")
    case .traditionalChinese: Locale(identifier: "zh-TW")
    case .japanese: Locale(identifier: "ja-JP")
    case .korean: Locale(identifier: "ko-KR")
    }
  }
}
