import Foundation

struct DarkroomReviewSelection: Equatable, Sendable {
  let ids: [String]
  private(set) var selected: [String]

  init(ids: [String]) {
    self.ids = ids
    selected = ids
  }

  var count: Int {
    selected.count
  }

  func number(for id: String) -> Int? {
    selected.firstIndex(of: id).map { $0 + 1 }
  }

  mutating func toggle(_ id: String) {
    guard ids.contains(id) else { return }
    if let index = selected.firstIndex(of: id) {
      selected.remove(at: index)
    } else {
      selected.append(id)
    }
  }
}

struct DarkroomTagSelection: Equatable, Sendable {
  let available: [String]
  private var on: Set<String> = []

  init(available: [String]) {
    self.available = available
  }

  var chosen: [String] {
    available.filter { on.contains($0) }
  }

  func isOn(_ tag: String) -> Bool {
    on.contains(tag)
  }

  mutating func toggle(_ tag: String) {
    guard available.contains(tag) else { return }
    if on.contains(tag) {
      on.remove(tag)
    } else {
      on.insert(tag)
    }
  }

  static func libraryTags(_ photoTags: [[String]]) -> [String] {
    var seen = Set<String>()
    var result: [String] = []
    for tags in photoTags {
      for raw in tags {
        let tag = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if !tag.isEmpty, seen.insert(tag).inserted {
          result.append(tag)
        }
      }
    }
    return result
  }
}

struct StudioLibrarySelection: Equatable, Sendable {
  enum DeleteChoice: Equatable, Sendable {
    case removeRecord
    case deleteFiles
  }

  private(set) var isActive = false
  private(set) var ids: [String] = []

  func contains(_ id: String) -> Bool {
    ids.contains(id)
  }

  mutating func begin() {
    isActive = true
  }

  mutating func end() {
    isActive = false
    ids = []
  }

  mutating func toggle(_ id: String) {
    guard isActive else { return }
    if let index = ids.firstIndex(of: id) {
      ids.remove(at: index)
    } else {
      ids.append(id)
    }
  }

  mutating func prune(keeping available: Set<String>) {
    ids.removeAll { !available.contains($0) }
  }

  static func deleteChoices(storageProviders: [String]) -> [DeleteChoice] {
    StudioLibraryDeletePolicy.requiresStorageDeletion(storageProviders: storageProviders)
      ? [.deleteFiles]
      : [.removeRecord, .deleteFiles]
  }

  static func meta(frames: Int, selected: Int?) -> String {
    if let selected {
      return String(localized: "\(selected) selected")
    }
    return String(localized: "\(frames) frames · by capture time")
  }
}
