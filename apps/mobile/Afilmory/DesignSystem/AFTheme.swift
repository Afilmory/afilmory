import UIKit

enum AFColor {
  static let ground = UIColor(afHex: 0x0E0D0C)
  static let raised = UIColor(afHex: 0x141311)
  static let sheet = UIColor(afHex: 0x161513)
  static let filmBase = UIColor(afHex: 0x1C1A17)
  static let fill = UIColor(afHex: 0x22201D)
  static let hairline = UIColor(afHex: 0x22201D)
  static let divider = UIColor(afHex: 0x2A2825)
  static let tick = UIColor(afHex: 0x3A3733)
  static let textPrimary = UIColor(afHex: 0xEDE9E3)
  static let textSecondary = UIColor(afHex: 0xB5B0A8)
  static let textTertiary = UIColor(afHex: 0x8C877F)
  static let destructive = UIColor(afHex: 0xFF8A7E)
  static let accentFallback = UIColor(afHex: 0xEDE9E3)
  static let onLight = UIColor(afHex: 0x0E0D0C)
}

enum AFRadius {
  static let sheet: CGFloat = 47
  static let card: CGFloat = 28
  static let mosaic: CGFloat = 14
  static let thumb: CGFloat = 12
  static let sheetInset: CGFloat = 8
}

enum AFFont {
  enum CJKRegion: CaseIterable {
    case sc, tc, hk, jp, kr

    var postScriptName: String {
      switch self {
      case .sc: "SourceHanSerifCN-SemiBold"
      case .tc: "SourceHanSerifTW-SemiBold"
      case .hk: "SourceHanSerifHK-SemiBold"
      case .jp: "SourceHanSerifJP-SemiBold"
      case .kr: "SourceHanSerifKR-SemiBold"
      }
    }

    var language: String {
      switch self {
      case .sc: "zh-Hans"
      case .tc: "zh-Hant"
      case .hk: "zh-HK"
      case .jp: "ja"
      case .kr: "ko"
      }
    }
  }

  static let scholaRegular = "TeXGyreSchola-Regular"
  static let scholaItalic = "TeXGyreSchola-Italic"

  static var currentLanguage: String {
    Bundle.main.preferredLocalizations.first ?? "en"
  }

  static func cjkSerifRegion(for language: String) -> CJKRegion? {
    let lower = language.lowercased()
    if lower.hasPrefix("zh-hk") || lower.hasPrefix("zh-mo") { return .hk }
    if lower.hasPrefix("zh-hant") || lower.hasPrefix("zh-tw") { return .tc }
    if lower.hasPrefix("zh") { return .sc }
    if lower.hasPrefix("ja") { return .jp }
    if lower.hasPrefix("ko") { return .kr }
    return nil
  }

  static func schola(size: CGFloat, italic: Bool = false, relativeTo style: UIFont.TextStyle? = nil) -> UIFont {
    let font = UIFont(name: italic ? scholaItalic : scholaRegular, size: size) ?? .systemFont(ofSize: size)
    return scaled(font, style)
  }

  static func exhibit(
    size: CGFloat,
    italic: Bool = false,
    language: String = AFFont.currentLanguage,
    relativeTo style: UIFont.TextStyle? = nil
  ) -> UIFont {
    var descriptor = UIFontDescriptor(name: italic ? scholaItalic : scholaRegular, size: size)
    if let region = cjkSerifRegion(for: language) {
      descriptor = descriptor.addingAttributes([
        .cascadeList: [UIFontDescriptor(name: region.postScriptName, size: size)],
      ])
    }
    return scaled(UIFont(descriptor: descriptor, size: size), style)
  }

  static func exhibitUser(size: CGFloat, italic: Bool = false, relativeTo style: UIFont.TextStyle? = nil) -> UIFont {
    schola(size: size, italic: italic, relativeTo: style)
  }

  static func cjkSerif(size: CGFloat, language: String = AFFont.currentLanguage, relativeTo style: UIFont.TextStyle? = nil) -> UIFont {
    guard let region = cjkSerifRegion(for: language),
          let font = UIFont(name: region.postScriptName, size: size)
    else { return exhibit(size: size, language: language, relativeTo: style) }
    return scaled(font, style)
  }

  static func ui(size: CGFloat, weight: UIFont.Weight = .regular, relativeTo style: UIFont.TextStyle? = nil) -> UIFont {
    scaled(.systemFont(ofSize: size, weight: weight), style)
  }

  static func mono(size: CGFloat, weight: UIFont.Weight = .regular) -> UIFont {
    .monospacedSystemFont(ofSize: size, weight: weight)
  }

  private static func scaled(_ font: UIFont, _ style: UIFont.TextStyle?) -> UIFont {
    guard let style else { return font }
    return UIFontMetrics(forTextStyle: style).scaledFont(for: font)
  }
}

enum AFDisplayStrings {
  enum LoadError: Error {
    case missingKeyList
  }

  static func keys(in bundle: Bundle = .main) throws -> [String] {
    guard let url = bundle.url(forResource: "display-keys", withExtension: "json") else {
      throw LoadError.missingKeyList
    }
    return try JSONDecoder().decode([String].self, from: Data(contentsOf: url))
  }

  static func bundle(for language: String, in bundle: Bundle = .main) -> Bundle? {
    bundle.path(forResource: language, ofType: "lproj").flatMap(Bundle.init(path:))
  }
}

extension UIColor {
  convenience init(afHex hex: UInt32, alpha: CGFloat = 1) {
    self.init(
      red: CGFloat((hex >> 16) & 0xFF) / 255,
      green: CGFloat((hex >> 8) & 0xFF) / 255,
      blue: CGFloat(hex & 0xFF) / 255,
      alpha: alpha
    )
  }

  convenience init?(afHexString string: String) {
    let trimmed = string.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: "#", with: "")
    guard trimmed.count == 6, let value = UInt32(trimmed, radix: 16) else { return nil }
    self.init(afHex: value)
  }

  var hexString: String {
    var red: CGFloat = 0
    var green: CGFloat = 0
    var blue: CGFloat = 0
    var alpha: CGFloat = 0
    getRed(&red, green: &green, blue: &blue, alpha: &alpha)
    let channel = { (value: CGFloat) in Int((min(max(value, 0), 1) * 255).rounded()) }
    return String(format: "#%02X%02X%02X", channel(red), channel(green), channel(blue))
  }
}
