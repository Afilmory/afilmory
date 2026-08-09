import Foundation

enum PhotoInfoFormatters {
  static func text(_ value: JSONValue?) -> String? {
    guard let value else { return nil }
    switch value {
    case .string(let string):
      return string.trimmingToNil
    case .number(let number):
      guard number.isFinite else { return nil }
      return number.rounded(.towardZero) == number ? String(Int64(number)) : String(number)
    default:
      return nil
    }
  }

  static func text(_ value: String?) -> String? {
    value?.trimmingToNil
  }

  static func number(_ value: JSONValue?) -> Double? {
    guard let value else { return nil }
    switch value {
    case .number(let number):
      return number.isFinite ? number : nil
    case .string(let string):
      return Double(string.trimmingCharacters(in: .whitespacesAndNewlines))
    default:
      return nil
    }
  }

  static func translatedExifValue(
    prefix: String,
    value: JSONValue?
  ) -> String? {
    guard let text = text(value) else { return nil }
    let suffix = text.lowercased()
      .replacingOccurrences(of: "&", with: "and")
      .replacingOccurrences(of: "[^a-z0-9]+", with: "-", options: .regularExpression)
      .replacingOccurrences(of: "^-|-$", with: "", options: .regularExpression)
    return Bundle.main.localizedString(
      forKey: "\(prefix).\(suffix)",
      value: text,
      table: "ExifValues"
    )
  }

  static func formatNumber(_ value: Double, localeIdentifier: String, maximumFractionDigits: Int = 1) -> String {
    let formatter = NumberFormatter()
    formatter.locale = Locale(identifier: localeIdentifier)
    formatter.numberStyle = .decimal
    formatter.minimumFractionDigits = 0
    formatter.maximumFractionDigits = maximumFractionDigits
    return formatter.string(from: NSNumber(value: value)) ?? String(value)
  }

  static func formatDate(
    _ value: String?,
    localeIdentifier: String,
    timeZone: TimeZone
  ) -> String? {
    guard let value else { return nil }
    guard let date = PhotoDateParser.date(value, timeZone: timeZone) else { return value }
    let language = PhotoDateLanguage.resolve(localeIdentifier)
    let formatter = DateFormatter()
    formatter.locale = language.formattingLocale
    formatter.timeZone = timeZone
    switch language {
    case .english:
      formatter.dateFormat = "MMMM d, yyyy 'at' h:mm:ss\u{202F}a"
    case .simplifiedChinese, .hongKongChinese, .traditionalChinese:
      formatter.dateFormat = "yyyy年M月d日 HH:mm:ss"
    case .japanese:
      formatter.dateFormat = "yyyy年M月d日 H:mm:ss"
    case .korean:
      formatter.dateFormat = "yyyy년 M월 d일 a h:mm:ss"
    }
    return formatter.string(from: date)
  }

  static func formatFileSize(_ value: Double?, localeIdentifier: String) -> String? {
    guard var size = value, size.isFinite, size > 0 else { return nil }
    let units = ["B", "KB", "MB", "GB"]
    var index = 0
    while size >= 1024, index < units.count - 1 {
      size /= 1024
      index += 1
    }
    return "\(formatNumber(size, localeIdentifier: localeIdentifier)) \(units[index])"
  }

  static func formatMegapixels(_ width: Double, _ height: Double, localeIdentifier: String) -> String? {
    guard width > 0, height > 0 else { return nil }
    return "\(formatNumber(width * height / 1_000_000, localeIdentifier: localeIdentifier)) MP"
  }

  static func formatDimensions(_ width: Double, _ height: Double) -> String? {
    guard width > 0, height > 0 else { return nil }
    return "\(integerString(width)) × \(integerString(height))"
  }

  static func formatFocalLength(_ value: JSONValue?) -> String? {
    if let number = focalLengthNumber(value) {
      return "\(number) mm"
    }
    guard let text = text(value) else { return nil }
    return text.range(of: "\\bmm\\b", options: [.regularExpression, .caseInsensitive]) == nil
      ? "\(text) mm"
      : text
  }

  static func formatFocalPair(_ actual: JSONValue?, _ equivalent: JSONValue?) -> String? {
    let actualNumber = focalLengthNumber(actual)
    let equivalentNumber = focalLengthNumber(equivalent)
    if let actualNumber, let equivalentNumber, actualNumber != equivalentNumber {
      return "\(actualNumber)→\(equivalentNumber) mm"
    }
    return formatFocalLength(equivalent) ?? formatFocalLength(actual)
  }

  static func formatApertureGlyph(_ value: JSONValue?) -> String? {
    if let number = number(value) {
      return "ƒ\(trimTrailingZero(number))"
    }
    guard let text = text(value) else { return nil }
    return "ƒ\(text.replacingOccurrences(of: "^f/", with: "", options: [.regularExpression, .caseInsensitive]))"
  }

  static func formatExposureTime(_ value: JSONValue?, localeIdentifier: String) -> String? {
    if let number = number(value), number > 0 {
      if number < 1 {
        return "1/\(Int((1 / number).rounded())) s"
      }
      return "\(formatNumber(number, localeIdentifier: localeIdentifier, maximumFractionDigits: 2)) s"
    }
    guard let text = text(value) else { return nil }
    return text.range(of: "\\b(?:s|sec|seconds?)$", options: [.regularExpression, .caseInsensitive]) == nil
      ? "\(text) s"
      : text
  }

  static func formatEV(_ value: JSONValue?) -> String? {
    guard let text = text(value) else { return nil }
    return text.range(of: "\\bEV$", options: [.regularExpression, .caseInsensitive]) == nil ? "\(text) EV" : text
  }

  static func formatExposureBias(_ value: JSONValue?, localeIdentifier: String) -> String? {
    guard let number = number(value) else { return nil }
    let formatter = NumberFormatter()
    formatter.locale = Locale(identifier: localeIdentifier)
    formatter.numberStyle = .decimal
    formatter.maximumFractionDigits = 1
    let formatted = formatter.string(from: NSNumber(value: number)) ?? String(number)
    return "\(formatted) ev"
  }

  static func formatISO(_ value: JSONValue?) -> String? {
    text(value).map { "ISO \($0)" }
  }

  static func formatMired(_ value: JSONValue?) -> String? {
    guard let text = text(value) else { return nil }
    return text.range(of: "\\bmired$", options: [.regularExpression, .caseInsensitive]) == nil
      ? "\(text) Mired"
      : text
  }

  static func joinMakeAndModel(_ makeValue: JSONValue?, _ modelValue: JSONValue?) -> String? {
    let make = text(makeValue)
    let model = text(modelValue)
    if let make, let model {
      return model.lowercased().hasPrefix(make.lowercased()) ? model : "\(make) \(model)"
    }
    return make ?? model
  }

  static func formatCoordinate(_ value: JSONValue?, reference: JSONValue?) -> String? {
    guard let coordinate = text(value) else { return nil }
    let suffix = text(reference)
    let formatted = coordinate.contains("°") ? coordinate : "\(coordinate)°"
    return suffix.map { "\(formatted) \($0)" } ?? formatted
  }

  static func decimalCoordinate(_ value: JSONValue?, reference: JSONValue?, limit: Double) -> Double? {
    guard let coordinate = number(value) else { return nil }
    let direction = text(reference)?.uppercased()
    let signed = ["S", "SOUTH", "W", "WEST"].contains(direction) ? -abs(coordinate) : coordinate
    return abs(signed) <= limit ? signed : nil
  }

  static func formatAltitude(_ exif: GalleryExif?) -> String? {
    guard let exif, let altitude = text(exif["GPSAltitude"]) else { return nil }
    let reference = text(exif["GPSAltitudeRef"])
    let below = exif["GPSAltitudeRef"]?.number == 1 || reference?.lowercased().contains("below") == true
    let signed = below && !altitude.hasPrefix("-") ? "-\(altitude)" : altitude
    return signed.range(of: "\\bm$", options: [.regularExpression, .caseInsensitive]) == nil ? "\(signed) m" : signed
  }

  static func cleanRecipeValue(_ value: JSONValue?) -> String? {
    text(value)?.replacingOccurrences(of: "\\s*\\([^)]*\\)$", with: "", options: .regularExpression).trimmingToNil
  }

  static func formatFilmMode(_ value: JSONValue?) -> String? {
    switch text(value) {
    case "F0/Standard (Provia)": "Provia"
    case "F1b/Studio Portrait Smooth Skin Tone (Astia)": "Astia"
    case "F2/Fujichrome (Velvia)", "F4/Velvia": "Velvia"
    case let value?: value
    case nil: nil
    }
  }

  static func formatFujiDynamicRange(_ recipe: [String: JSONValue]) -> String? {
    if text(recipe["DynamicRangeSetting"]) == "Manual",
       let range = number(recipe["DevelopmentDynamicRange"]),
       range != 0
    {
      return "DR\(integerString(range))"
    }
    if text(recipe["DynamicRangeSetting"]) == "Auto" {
      return String(localized: "Auto")
    }
    return text(recipe["DynamicRange"])
  }

  static func formatFujiWhiteBalance(_ recipe: [String: JSONValue]) -> String? {
    if text(recipe["WhiteBalance"]) == "Kelvin", let temperature = text(recipe["ColorTemperature"]) {
      return "\(temperature) K"
    }
    return translatedExifValue(
      prefix: "exif.fujirecipe-whitebalance",
      value: recipe["WhiteBalance"]
    )
  }

  static func formatPercentage(_ value: Double, scale: Double) -> String? {
    value.isFinite ? "\(Int((value * scale).rounded()))%" : nil
  }

  static func formatToneType(_ tone: GalleryToneAnalysis?) -> String? {
    guard let tone else { return nil }
    switch tone.toneType {
    case "low-key": return String(localized: "Low Key")
    case "high-key": return String(localized: "High Key")
    case "normal": return String(localized: "Normal")
    case "high-contrast": return String(localized: "High Contrast")
    default: return tone.toneType
    }
  }

  private static func focalLengthNumber(_ value: JSONValue?) -> String? {
    if let number = number(value) {
      return trimTrailingZero(number)
    }
    guard let text = text(value),
          let match = text.firstMatch(pattern: "^(-?\\d+(?:\\.\\d+)?)\\s*mm$"),
          let number = Double(match)
    else { return nil }
    return trimTrailingZero(number)
  }

  private static func trimTrailingZero(_ value: Double) -> String {
    let rounded = (value * 100).rounded() / 100
    return rounded.rounded(.towardZero) == rounded ? integerString(rounded) : String(rounded)
  }

  private static func integerString(_ value: Double) -> String {
    String(Int64(value))
  }
}

private extension String {
  func firstMatch(pattern: String) -> String? {
    guard let expression = try? NSRegularExpression(pattern: pattern),
          let match = expression.firstMatch(in: self, range: NSRange(startIndex..., in: self)),
          match.numberOfRanges > 1,
          let range = Range(match.range(at: 1), in: self)
    else { return nil }
    return String(self[range])
  }
}
