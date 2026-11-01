import Foundation

struct DetailToneValue: Equatable, Sendable {
  let label: String
  let display: String
  let percent: Int
}

enum DetailSection: Equatable, Sendable {
  case exposure([PhotoInfoRow])
  case file([String])
  case tone(type: String?, values: [DetailToneValue])
  case description(String)
  case rating(Int)
  case location(latitude: Double, longitude: Double, place: String?)
  case fujiRecipe(title: String?, rows: [PhotoInfoRow])
  case attribution([PhotoInfoRow])

  var id: String {
    switch self {
    case .exposure: "exposure"
    case .file: "file"
    case .tone: "tone"
    case .description: "description"
    case .rating: "rating"
    case .location: "location"
    case .fujiRecipe: "fuji-recipe"
    case .attribution: "attribution"
    }
  }
}

struct DetailSheetModel: Equatable, Sendable {
  enum Headline: Equatable, Sendable {
    case date(large: String, italic: String?)
    case title(large: String, italic: String?)

    var large: String {
      switch self {
      case .date(let large, _), .title(let large, _): large
      }
    }

    var italic: String? {
      switch self {
      case .date(_, let italic), .title(_, let italic): italic
      }
    }

    var isUserText: Bool {
      if case .title = self { return true }
      return false
    }
  }

  let number: String
  let headline: Headline
  let gear: String?
  let exifLine: String?
  let tags: [String]
  let sections: [DetailSection]

  static func make(photo: GalleryPhoto, number: Int, localeIdentifier: String) -> DetailSheetModel {
    let info = PhotoInfoModel.build(photo: photo, localeIdentifier: localeIdentifier)
    let gear = ExhibitFormat.gear(for: photo)
    let exifLine = ExhibitFormat.exifLine(for: photo)
    return DetailSheetModel(
      number: ExhibitFormat.frameNumber(number),
      headline: headline(for: photo, number: number),
      gear: gear.isEmpty ? nil : gear,
      exifLine: exifLine.isEmpty ? nil : exifLine,
      tags: photo.tags.filter { !$0.trimmingCharacters(in: .whitespaces).isEmpty },
      sections: sections(photo: photo, info: info)
    )
  }

  private static func headline(for photo: GalleryPhoto, number: Int) -> Headline {
    let stamp = ExhibitFormat.localDateTime(for: photo)
    let moment = stamp.map { "\($0.timeOfDay.localizedName) \($0.time)" }
    switch ExhibitFormat.headline(for: photo) {
    case .title(let title):
      return .title(large: title, italic: stamp.map { "\($0.date) · \($0.timeOfDay.localizedName) \($0.time)" })
    case .date(let date):
      return .date(large: date, italic: moment)
    case nil:
      return .date(large: String(localized: "No. \(ExhibitFormat.frameNumber(number))"), italic: nil)
    }
  }

  private static func sections(photo: GalleryPhoto, info: PhotoInfoSheetModel) -> [DetailSection] {
    let byID = Dictionary(info.sections.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
    var sections: [DetailSection] = []
    let exposureRows = (byID["exposure"]?.rows ?? []).filter {
      ["exposure-program", "metering-mode", "white-balance", "flash"].contains($0.id)
    }
    if !exposureRows.isEmpty {
      sections.append(.exposure(exposureRows))
    }
    let chips = fileChips(photo: photo, info: info, fileRows: byID["file"]?.rows ?? [])
    if !chips.isEmpty {
      sections.append(.file(chips))
    }
    if let tone = photo.toneAnalysis {
      sections.append(.tone(type: PhotoInfoFormatters.formatToneType(tone), values: toneValues(tone)))
    }
    if let description = photo.description.trimmingToNil {
      sections.append(.description(description))
    }
    if let rating = photo.rating ?? ManifestDecoding.rating(from: photo.exif), rating > 0 {
      sections.append(.rating(min(5, rating)))
    }
    if let coordinates = photo.coordinates {
      sections.append(.location(latitude: coordinates.latitude, longitude: coordinates.longitude, place: info.place))
    }
    if let recipe = byID["fuji-recipe"] {
      sections.append(.fujiRecipe(title: recipe.summary, rows: recipe.rows))
    }
    if let attribution = byID["attribution"] {
      sections.append(.attribution(attribution.rows))
    }
    return sections
  }

  private static func fileChips(photo: GalleryPhoto, info: PhotoInfoSheetModel, fileRows: [PhotoInfoRow]) -> [String] {
    var chips: [String] = []
    if let format = info.gear.formatBadge { chips.append(format) }
    chips.append(contentsOf: info.gear.specs)
    if ExhibitFormat.isFilenameLikeTitle(photo.title), let filename = photo.title.trimmingToNil {
      chips.append(filename)
    }
    if let colorSpace = fileRows.first(where: { $0.id == "color-space" })?.value {
      chips.append(colorSpace)
    }
    return chips
  }

  private static func toneValues(_ tone: GalleryToneAnalysis) -> [DetailToneValue] {
    func clamp(_ value: Double) -> Int { Int(min(100, max(0, value)).rounded()) }
    let brightness = clamp(tone.brightness)
    let contrast = clamp(tone.contrast)
    let shadow = clamp(tone.shadowRatio * 100)
    let highlight = clamp(tone.highlightRatio * 100)
    return [
      DetailToneValue(label: String(localized: "Brightness"), display: "\(brightness)", percent: brightness),
      DetailToneValue(label: String(localized: "Contrast"), display: "\(contrast)", percent: contrast),
      DetailToneValue(label: String(localized: "Shadow Ratio"), display: "\(shadow)%", percent: shadow),
      DetailToneValue(label: String(localized: "Highlight Ratio"), display: "\(highlight)%", percent: highlight),
    ]
  }
}
