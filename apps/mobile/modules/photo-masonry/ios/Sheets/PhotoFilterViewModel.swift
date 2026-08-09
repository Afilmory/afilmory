import Combine
import Foundation

@MainActor
final class PhotoFilterViewModel: ObservableObject {
  static let noDate = "none"
  static let customDate = "custom"

  @Published var query: String
  @Published var tags: Set<String>
  @Published var tagMode: String
  @Published var dateSelection: String
  @Published var dateFrom: Date
  @Published var dateTo: Date
  @Published var cameras: Set<String>
  @Published var lenses: Set<String>
  @Published var minRating: Int?

  let options: PhotoFilterOptionsRecord

  init(request: PhotoFilterSheetRequest) {
    let filters = request.filters
    query = filters.query
    tags = Set(filters.tags)
    tagMode = filters.tagMode
    if let datePreset = filters.datePreset {
      dateSelection = datePreset
    } else if filters.dateFrom != nil || filters.dateTo != nil {
      dateSelection = Self.customDate
    } else {
      dateSelection = Self.noDate
    }
    dateFrom = Self.date(from: filters.dateFrom) ?? Date()
    dateTo = Self.date(from: filters.dateTo) ?? Date()
    cameras = Set(filters.cameras)
    lenses = Set(filters.lenses)
    minRating = filters.minRating
    options = request.options
  }

  var hasActiveFilters: Bool {
    !query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
      || !tags.isEmpty
      || dateSelection != Self.noDate
      || !cameras.isEmpty
      || !lenses.isEmpty
      || minRating != nil
  }

  func toggleTag(_ value: String) {
    toggle(value, in: &tags)
  }

  func toggleCamera(_ value: String) {
    toggle(value, in: &cameras)
  }

  func toggleLens(_ value: String) {
    toggle(value, in: &lenses)
  }

  func reset() {
    query = ""
    tags = []
    tagMode = "any"
    dateSelection = Self.noDate
    dateFrom = Date()
    dateTo = Date()
    cameras = []
    lenses = []
    minRating = nil
  }

  func makeRecord() -> PhotoFiltersRecord {
    var record = PhotoFiltersRecord()
    record.query = query.trimmingCharacters(in: .whitespacesAndNewlines)
    record.tags = tags.sorted()
    record.tagMode = tagMode
    record.cameras = cameras.sorted()
    record.lenses = lenses.sorted()
    record.minRating = minRating

    switch dateSelection {
    case Self.noDate:
      break
    case Self.customDate:
      record.dateFrom = Self.dateFormatter.string(from: dateFrom)
      record.dateTo = Self.dateFormatter.string(from: dateTo)
    default:
      record.datePreset = dateSelection
    }
    return record
  }

  private func toggle(_ value: String, in values: inout Set<String>) {
    if values.contains(value) {
      values.remove(value)
    } else {
      values.insert(value)
    }
  }

  private static func date(from value: String?) -> Date? {
    guard let value else { return nil }
    return dateFormatter.date(from: value)
  }

  private static let dateFormatter: DateFormatter = {
    let formatter = DateFormatter()
    formatter.calendar = Calendar(identifier: .gregorian)
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.dateFormat = "yyyy-MM-dd"
    return formatter
  }()
}
