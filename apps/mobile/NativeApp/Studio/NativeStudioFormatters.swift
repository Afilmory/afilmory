import Foundation

enum NativeStudioFormatters {
  static func bytes(_ value: Double?) -> String {
    guard let value, value > 0 else { return "0 B" }
    let units = ["B", "KB", "MB", "GB", "TB"]
    let rawIndex = Int(floor(log(value) / log(1024)))
    let index = min(max(rawIndex, 0), units.count - 1)
    let amount = value / pow(1024, Double(index))
    let formatter = NumberFormatter()
    formatter.locale = .current
    formatter.maximumFractionDigits = amount >= 10 ? 1 : 2
    return "\(formatter.string(from: NSNumber(value: amount)) ?? String(amount)) \(units[index])"
  }

  static func count(_ value: Int) -> String {
    value.formatted(.number.locale(.current))
  }

  static func dateTime(_ value: String?) -> String? {
    guard let date = date(value) else { return nil }
    return date.formatted(
      Date.FormatStyle(date: .abbreviated, time: .shortened).locale(.current)
    )
  }

  static func date(_ value: String?) -> Date? {
    guard var value else { return nil }
    if value.count >= 19, value[value.index(value.startIndex, offsetBy: 10)] == " " {
      let separator = value.index(value.startIndex, offsetBy: 10)
      value.replaceSubrange(separator...separator, with: "T")
      value.append("Z")
    }
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let fractional = formatter.date(from: value) {
      return fractional
    }
    formatter.formatOptions = [.withInternetDateTime]
    return formatter.date(from: value)
  }

  static func trendMonth(_ value: String) -> String {
    let components = value.split(separator: "-")
    guard components.count == 2,
          let year = Int(components[0]),
          let month = Int(components[1]),
          (1...12).contains(month),
          let date = Calendar(identifier: .gregorian).date(from: DateComponents(year: year, month: month, day: 1))
    else { return value }
    return date.formatted(Date.FormatStyle().month(.abbreviated).locale(.current))
  }
}
