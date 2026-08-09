import Foundation

enum DatePreset: String, Codable, CaseIterable, Sendable {
  case last7
  case last30
  case last90
  case thisMonth
  case thisYear
  case lastYear

  var label: String {
    switch self {
    case .last7: String(localized: "Last 7 days")
    case .last30: String(localized: "Last 30 days")
    case .last90: String(localized: "Last 90 days")
    case .thisMonth: String(localized: "This month")
    case .thisYear: String(localized: "This year")
    case .lastYear: String(localized: "Last year")
    }
  }
}

enum TagMode: String, Codable, Sendable {
  case any
  case all
}

struct PhotoFilters: Codable, Equatable, Sendable {
  var query: String = ""
  var tags: [String] = []
  var tagMode: TagMode = .any
  var datePreset: DatePreset?
  var dateFrom: String?
  var dateTo: String?
  var cameras: [String] = []
  var lenses: [String] = []
  var minRating: Int?

  static let empty = PhotoFilters()

  private enum CodingKeys: String, CodingKey {
    case query
    case tags
    case tagMode
    case datePreset
    case dateFrom
    case dateTo
    case cameras
    case lenses
    case minRating
  }

  init(
    query: String = "",
    tags: [String] = [],
    tagMode: TagMode = .any,
    datePreset: DatePreset? = nil,
    dateFrom: String? = nil,
    dateTo: String? = nil,
    cameras: [String] = [],
    lenses: [String] = [],
    minRating: Int? = nil
  ) {
    self.query = query
    self.tags = tags
    self.tagMode = tagMode
    self.datePreset = datePreset
    self.dateFrom = dateFrom
    self.dateTo = dateTo
    self.cameras = cameras
    self.lenses = lenses
    self.minRating = minRating
  }

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    query = try container.decodeIfPresent(String.self, forKey: .query) ?? ""
    tags = try container.decodeIfPresent([String].self, forKey: .tags) ?? []
    tagMode = try container.decodeIfPresent(TagMode.self, forKey: .tagMode) ?? .any
    datePreset = try container.decodeIfPresent(DatePreset.self, forKey: .datePreset)
    dateFrom = try container.decodeIfPresent(String.self, forKey: .dateFrom)
    dateTo = try container.decodeIfPresent(String.self, forKey: .dateTo)
    cameras = try container.decodeIfPresent([String].self, forKey: .cameras) ?? []
    lenses = try container.decodeIfPresent([String].self, forKey: .lenses) ?? []
    minRating = try container.decodeIfPresent(Int.self, forKey: .minRating)
  }
}

struct PhotoFilterOption: Codable, Equatable, Identifiable, Sendable {
  let value: String
  let count: Int
  var id: String { value }
}

struct PhotoFilterOptions: Codable, Equatable, Sendable {
  let tags: [PhotoFilterOption]
  let cameras: [PhotoFilterOption]
  let lenses: [PhotoFilterOption]
  let ratedCount: Int
}

enum PhotoFilterEngine {
  static func apply(_ filters: PhotoFilters, to photos: [GalleryPhoto]) -> [GalleryPhoto] {
    let queryTerms = normalized(filters.query)
      .split(whereSeparator: \.isWhitespace)
      .map(String.init)
    let tags = Set(filters.tags)
    let cameras = Set(filters.cameras)
    let lenses = Set(filters.lenses)
    return photos.filter { photo in
      if !queryTerms.isEmpty {
        let corpus = searchCorpus(photo)
        if !queryTerms.allSatisfy(corpus.contains) { return false }
      }
      if !filters.tags.isEmpty {
        let matches = filters.tagMode == .all
          ? filters.tags.allSatisfy(photo.tags.contains)
          : photo.tags.contains { tags.contains($0) }
        if !matches { return false }
      }
      if filters.dateFrom != nil || filters.dateTo != nil {
        guard let date = photo.dateTaken.map({ String($0.prefix(10)) }) else { return false }
        if let from = filters.dateFrom, date < from { return false }
        if let to = filters.dateTo, date > to { return false }
      }
      if !filters.cameras.isEmpty {
        guard let camera = photo.camera, cameras.contains(camera) else { return false }
      }
      if !filters.lenses.isEmpty {
        guard let lens = photo.lens, lenses.contains(lens) else { return false }
      }
      if let minRating = filters.minRating {
        guard let rating = photo.rating, rating >= minRating else { return false }
      }
      return true
    }
  }

  static func buildOptions(_ photos: [GalleryPhoto]) -> PhotoFilterOptions {
    var tags: [String: Int] = [:]
    var cameras: [String: Int] = [:]
    var lenses: [String: Int] = [:]
    var ratedCount = 0
    for photo in photos {
      for tag in photo.tags {
        tags[tag, default: 0] += 1
      }
      if let camera = photo.camera {
        cameras[camera, default: 0] += 1
      }
      if let lens = photo.lens {
        lenses[lens, default: 0] += 1
      }
      if photo.rating != nil {
        ratedCount += 1
      }
    }
    return PhotoFilterOptions(
      tags: sortedOptions(tags),
      cameras: sortedOptions(cameras),
      lenses: sortedOptions(lenses),
      ratedCount: ratedCount
    )
  }

  static func countActiveDimensions(_ filters: PhotoFilters) -> Int {
    var count = 0
    if !filters.query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { count += 1 }
    if !filters.tags.isEmpty { count += 1 }
    if filters.dateFrom != nil || filters.dateTo != nil { count += 1 }
    if !filters.cameras.isEmpty { count += 1 }
    if !filters.lenses.isEmpty { count += 1 }
    if filters.minRating != nil { count += 1 }
    return count
  }

  static func hasActiveFilters(_ filters: PhotoFilters) -> Bool {
    countActiveDimensions(filters) > 0
  }

  static func presetRange(
    _ preset: DatePreset,
    now: Date,
    calendar sourceCalendar: Calendar = .current
  ) -> (from: String, to: String) {
    let calendar = sourceCalendar
    let today = dateString(now, calendar: calendar)
    switch preset {
    case .last7:
      return (dateString(calendar.date(byAdding: .day, value: -6, to: now)!, calendar: calendar), today)
    case .last30:
      return (dateString(calendar.date(byAdding: .day, value: -29, to: now)!, calendar: calendar), today)
    case .last90:
      return (dateString(calendar.date(byAdding: .day, value: -89, to: now)!, calendar: calendar), today)
    case .thisMonth:
      let components = calendar.dateComponents([.year, .month], from: now)
      return (dateString(calendar.date(from: components)!, calendar: calendar), today)
    case .thisYear:
      let year = calendar.component(.year, from: now)
      return (String(format: "%04d-01-01", year), today)
    case .lastYear:
      let year = calendar.component(.year, from: now) - 1
      return (String(format: "%04d-01-01", year), String(format: "%04d-12-31", year))
    }
  }

  static func cityForRange(_ photos: [GalleryPhoto], startIndex: Int, endIndex: Int) -> String? {
    guard !photos.isEmpty else { return nil }
    let start = max(0, min(startIndex, photos.count - 1))
    let end = max(start, min(endIndex, photos.count - 1))
    for index in start...end {
      if let city = photos[index].city {
        return city
      }
    }
    let markers = ["省", "市", "区", "县", "镇", "村", "街道", "路", "北京", "上海", "广州", "深圳", "杭州", "南京", "成都"]
    for index in start...end {
      if let tag = photos[index].tags.first(where: { tag in markers.contains(where: tag.contains) }) {
        return tag
      }
    }
    return nil
  }

  static func summarize(_ filters: PhotoFilters) -> String {
    var parts: [String] = []
    let query = filters.query.trimmingCharacters(in: .whitespacesAndNewlines)
    if !query.isEmpty {
      let shortened = query.count > 32 ? "\(query.prefix(32))…" : query
      parts.append("“\(shortened)”")
    }
    if filters.tags.count == 1 {
      parts.append(filters.tags[0])
    } else if filters.tags.count > 1 {
      parts.append(String(localized: "\(filters.tags.count) tags"))
    }
    if filters.cameras.count == 1 {
      parts.append(filters.cameras[0])
    } else if filters.cameras.count > 1 {
      parts.append(String(localized: "\(filters.cameras.count) cameras"))
    }
    if filters.lenses.count == 1 {
      parts.append(filters.lenses[0])
    } else if filters.lenses.count > 1 {
      parts.append(String(localized: "\(filters.lenses.count) lenses"))
    }
    if let minRating = filters.minRating {
      parts.append("≥\(minRating)★")
    }
    if filters.dateFrom != nil || filters.dateTo != nil {
      parts.append(filters.datePreset?.label ?? String(localized: "Dates"))
    }
    return parts.joined(separator: " · ")
  }

  private static func sortedOptions(_ values: [String: Int]) -> [PhotoFilterOption] {
    values.map { PhotoFilterOption(value: $0.key, count: $0.value) }
      .sorted { lhs, rhs in
        lhs.count == rhs.count
          ? lhs.value.compare(rhs.value, options: [], range: nil, locale: Locale(identifier: "en_US")) == .orderedAscending
          : lhs.count > rhs.count
      }
  }

  private static func searchCorpus(_ photo: GalleryPhoto) -> String {
    normalized(
      [
        photo.id,
        photo.title,
        photo.description,
        photo.tags.joined(separator: " "),
        photo.camera,
        photo.lens,
        photo.city,
        photo.location?.city,
        photo.location?.country,
        photo.location?.locationName,
      ]
      .compactMap { $0 }
      .joined(separator: " ")
    )
  }

  private static func normalized(_ value: String) -> String {
    value
      .folding(options: [.diacriticInsensitive, .widthInsensitive], locale: .current)
      .lowercased()
  }

  private static func dateString(_ date: Date, calendar: Calendar) -> String {
    let components = calendar.dateComponents([.year, .month, .day], from: date)
    return String(format: "%04d-%02d-%02d", components.year!, components.month!, components.day!)
  }
}
