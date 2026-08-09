import Foundation

struct PhotoHeaderStrings: Sendable {
  let fallbackTitle: String
  let today: String
  let yesterday: String
}

struct PhotoHeaderModel: Codable, Equatable, Sendable {
  let subtitle: String
  let title: String

  static func build(
    photo: GalleryPhoto,
    localeIdentifier: String,
    strings: PhotoHeaderStrings,
    now: Date = .now,
    timeZone: TimeZone = .current
  ) -> PhotoHeaderModel {
    let captureDate = photo.dateTaken.flatMap { PhotoDateParser.date($0, timeZone: timeZone) }
    let title: String
    let time: String
    if let captureDate {
      var calendar = Calendar(identifier: .gregorian)
      calendar.timeZone = timeZone
      let difference = calendar.dateComponents(
        [.day],
        from: calendar.startOfDay(for: now),
        to: calendar.startOfDay(for: captureDate)
      ).day
      if difference == 0 {
        title = strings.today
      } else if difference == -1 {
        title = strings.yesterday
      } else {
        title = formatDate(captureDate, localeIdentifier: localeIdentifier, timeZone: timeZone)
      }
      time = formatTime(captureDate, localeIdentifier: localeIdentifier, timeZone: timeZone)
    } else {
      title = photo.title.trimmingToNil ?? strings.fallbackTitle
      time = ""
    }
    let place = photo.location?.city?.trimmingToNil
      ?? photo.city?.trimmingToNil
      ?? photo.location?.country?.trimmingToNil
      ?? ""
    return PhotoHeaderModel(
      subtitle: [time, place].filter { !$0.isEmpty }.joined(separator: " · "),
      title: title
    )
  }

  private static func formatDate(
    _ date: Date,
    localeIdentifier: String,
    timeZone: TimeZone
  ) -> String {
    let language = PhotoDateLanguage.resolve(localeIdentifier)
    let formatter = DateFormatter()
    formatter.locale = language.formattingLocale
    formatter.timeZone = timeZone
    switch language {
    case .english:
      formatter.dateFormat = "MMM d, yyyy"
    case .simplifiedChinese, .hongKongChinese, .traditionalChinese:
      formatter.dateFormat = "yyyy年M月d日"
    case .japanese:
      formatter.dateFormat = "yyyy/MM/dd"
    case .korean:
      formatter.dateFormat = "yyyy. M. d."
    }
    return formatter.string(from: date)
  }

  private static func formatTime(
    _ date: Date,
    localeIdentifier: String,
    timeZone: TimeZone
  ) -> String {
    let language = PhotoDateLanguage.resolve(localeIdentifier)
    let formatter = DateFormatter()
    formatter.locale = language.formattingLocale
    formatter.timeZone = timeZone
    switch language {
    case .english:
      formatter.dateFormat = "h:mm\u{202F}a"
    case .simplifiedChinese, .hongKongChinese, .traditionalChinese:
      formatter.dateFormat = "HH:mm"
    case .japanese:
      formatter.dateFormat = "H:mm"
    case .korean:
      formatter.dateFormat = "a h:mm"
    }
    return formatter.string(from: date)
  }
}

enum PhotoDateParser {
  private nonisolated(unsafe) static let fractional: ISO8601DateFormatter = {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter
  }()

  private nonisolated(unsafe) static let standard: ISO8601DateFormatter = {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime]
    return formatter
  }()

  static func date(_ value: String, timeZone: TimeZone = .current) -> Date? {
    if let date = fractional.date(from: value) ?? standard.date(from: value) {
      return date
    }
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.timeZone = timeZone
    formatter.dateFormat = value.contains(".") ? "yyyy-MM-dd'T'HH:mm:ss.SSS" : "yyyy-MM-dd'T'HH:mm:ss"
    return formatter.date(from: value)
  }
}
