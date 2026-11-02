import Foundation

enum ExhibitFormat {
  enum TimeOfDay: Equatable, Sendable {
    case lateNight, dawn, morning, noon, afternoon, dusk, night

    var localizedName: String {
      switch self {
      case .lateNight: String(localized: "Late night")
      case .dawn: String(localized: "Dawn")
      case .morning: String(localized: "Morning")
      case .noon: String(localized: "Noon")
      case .afternoon: String(localized: "Afternoon")
      case .dusk: String(localized: "Dusk")
      case .night: String(localized: "Night")
      }
    }
  }

  struct LocalDateTime: Equatable, Sendable {
    let year: Int
    let month: Int
    let dayOfMonth: Int
    let hour: Int
    let minute: Int

    var date: String { String(format: "%04d.%02d.%02d", year, month, dayOfMonth) }
    var day: String { String(format: "%02d.%02d", month, dayOfMonth) }
    var time: String { String(format: "%02d:%02d", hour, minute) }
    var timeOfDay: TimeOfDay { ExhibitFormat.timeOfDay(hour: hour) }
  }

  enum Headline: Equatable, Sendable {
    case title(String)
    case date(String)
  }

  static func timeOfDay(hour: Int) -> TimeOfDay {
    switch hour {
    case ..<5: .lateNight
    case ..<8: .dawn
    case ..<11: .morning
    case ..<13: .noon
    case ..<17: .afternoon
    case ..<19: .dusk
    default: .night
    }
  }

  private static let wallClock = try! NSRegularExpression(
    pattern: "^(\\d{4})-(\\d{2})-(\\d{2})[T ](\\d{2}):(\\d{2})"
  )

  static func localDateTime(from dateTaken: String?) -> LocalDateTime? {
    guard let dateTaken else { return nil }
    let range = NSRange(dateTaken.startIndex..., in: dateTaken)
    guard let match = wallClock.firstMatch(in: dateTaken, range: range) else { return nil }
    let values = (1...5).compactMap { index -> Int? in
      Range(match.range(at: index), in: dateTaken).flatMap { Int(dateTaken[$0]) }
    }
    guard values.count == 5 else { return nil }
    return LocalDateTime(year: values[0], month: values[1], dayOfMonth: values[2], hour: values[3], minute: values[4])
  }

  static func localDateTime(for photo: GalleryPhoto) -> LocalDateTime? {
    if let original = PhotoInfoFormatters.text(photo.exif?["DateTimeOriginal"]),
       let parsed = localDateTime(from: original.replacingOccurrences(of: ":", with: "-", options: [], range: original.startIndex..<original.index(original.startIndex, offsetBy: min(10, original.count))))
    {
      return parsed
    }
    guard let dateTaken = photo.dateTaken else { return nil }
    let hasZone = dateTaken.hasSuffix("Z") || dateTaken.range(of: "[+-]\\d{2}:?\\d{2}$", options: .regularExpression) != nil
    guard hasZone, let date = PhotoDateParser.date(dateTaken) else { return localDateTime(from: dateTaken) }
    let parts = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute], from: date)
    guard let year = parts.year, let month = parts.month, let day = parts.day, let hour = parts.hour, let minute = parts.minute
    else { return nil }
    return LocalDateTime(year: year, month: month, dayOfMonth: day, hour: hour, minute: minute)
  }

  static func frameNumber(_ index: Int) -> String {
    String(format: "%02d", index)
  }

  private static let filenamePattern = try! NSRegularExpression(
    pattern: "^(?:_?[A-Z]{1,5}[ _-]?\\d{3,}(?:[ _-]\\d+)*|P\\d{6,}|\\d{6,}(?:[ _-]\\d+)*)(?:\\.[A-Za-z0-9]{2,5})?$"
  )

  static func isFilenameLikeTitle(_ title: String) -> Bool {
    let trimmed = title.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return true }
    return filenamePattern.firstMatch(in: trimmed, range: NSRange(trimmed.startIndex..., in: trimmed)) != nil
  }

  static func headline(for photo: GalleryPhoto) -> Headline? {
    if !isFilenameLikeTitle(photo.title) {
      return .title(photo.title.trimmingCharacters(in: .whitespacesAndNewlines))
    }
    return localDateTime(for: photo).map { .date($0.date) }
  }

  static func camera(for photo: GalleryPhoto) -> String? {
    let exif = photo.exif
    let make = PhotoInfoFormatters.text(exif?["Make"]).map(normalizedMake)
    if var model = PhotoInfoFormatters.text(exif?["Model"]) {
      guard let make else { return model }
      if model.lowercased().hasPrefix(make.lowercased()) {
        model = String(model.dropFirst(make.count)).trimmingCharacters(in: .whitespaces)
      }
      return model.isEmpty ? make : "\(make) \(model)"
    }
    return PhotoInfoFormatters.text(photo.camera)
  }

  static func lens(for photo: GalleryPhoto) -> String? {
    PhotoInfoFormatters.text(photo.exif?["LensModel"]) ?? PhotoInfoFormatters.text(photo.lens)
  }

  static func gear(for photo: GalleryPhoto) -> String {
    [camera(for: photo), lens(for: photo)].compactMap { $0 }.joined(separator: " · ")
  }

  enum ExposureKind: Equatable, Sendable {
    case focalLength, aperture, shutter, iso, bias
  }

  struct ExposurePart: Equatable, Sendable {
    let kind: ExposureKind
    let value: String
  }

  static func exifLine(for photo: GalleryPhoto) -> String {
    exposureParts(for: photo).map(\.value).joined(separator: "  ")
  }

  static func exposureParts(for photo: GalleryPhoto) -> [ExposurePart] {
    guard let exif = photo.exif else { return [] }
    var parts: [ExposurePart] = []
    if let focal = numeric(exif["FocalLength"]), focal > 0 {
      parts.append(ExposurePart(kind: .focalLength, value: "\(trim(focal))mm"))
    }
    if let aperture = numeric(exif["FNumber"]), aperture > 0 {
      parts.append(ExposurePart(kind: .aperture, value: "f/\(trim(aperture))"))
    }
    if let shutter = numeric(exif["ExposureTime"]), shutter > 0 {
      parts.append(ExposurePart(kind: .shutter, value: shutter < 1 ? "1/\(Int((1 / shutter).rounded()))s" : "\(trim(shutter))s"))
    }
    if let iso = numeric(exif["ISO"]), iso > 0 {
      parts.append(ExposurePart(kind: .iso, value: "ISO \(Int(iso))"))
    }
    if let bias = numeric(exif["ExposureCompensation"]) {
      let value = abs(bias) < 0.05 ? "±0 EV" : "\(bias > 0 ? "+" : "−")\(trim(abs(bias))) EV"
      parts.append(ExposurePart(kind: .bias, value: value))
    }
    return parts
  }

  private static func numeric(_ value: JSONValue?) -> Double? {
    if let number = PhotoInfoFormatters.number(value) { return number }
    guard let text = PhotoInfoFormatters.text(value) else { return nil }
    let cleaned = text.replacingOccurrences(of: "mm", with: "").replacingOccurrences(of: "s", with: "")
      .trimmingCharacters(in: .whitespaces)
    let fraction = cleaned.split(separator: "/")
    if fraction.count == 2, let top = Double(fraction[0]), let bottom = Double(fraction[1]), bottom != 0 {
      return top / bottom
    }
    return Double(cleaned)
  }

  private static func trim(_ value: Double) -> String {
    let rounded = (value * 10).rounded() / 10
    return rounded == rounded.rounded() ? String(Int(rounded)) : String(rounded)
  }

  private static func normalizedMake(_ make: String) -> String {
    let first = make.split(separator: " ").first.map(String.init) ?? make
    let lower = first.lowercased()
    let known = ["nikon": "Nikon", "fujifilm": "Fujifilm", "canon": "Canon", "sony": "Sony", "apple": "Apple", "leica": "Leica", "olympus": "Olympus", "panasonic": "Panasonic", "ricoh": "Ricoh", "hasselblad": "Hasselblad"]
    return known[lower] ?? first
  }
}
