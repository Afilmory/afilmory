import Foundation

enum UploadTagPath {
  static func parse(_ value: String) -> [String] {
    var seen = Set<String>()
    return value.split(separator: ",").compactMap { part in
      let tag = part.trimmingCharacters(in: .whitespacesAndNewlines)
      guard !tag.isEmpty, seen.insert(tag).inserted else { return nil }
      return tag
    }.prefix(32).map { $0 }
  }

  static func directory(from tags: [String]) -> String? {
    let segments = tags.compactMap { tag -> String? in
      var value = tag.precomposedStringWithCompatibilityMapping
        .trimmingCharacters(in: .whitespacesAndNewlines)
      value = value.replacingOccurrences(of: "[\\\\/]+", with: "-", options: .regularExpression)
      value = value.replacingOccurrences(of: "\\s+", with: "-", options: .regularExpression)
      value = value.replacingOccurrences(of: "[^\\p{L}\\p{N}_.-]", with: "-", options: .regularExpression)
      value = value.replacingOccurrences(of: "-+", with: "-", options: .regularExpression)
      value = value.trimmingCharacters(in: CharacterSet(charactersIn: "-"))
      return value.isEmpty ? nil : value
    }
    return segments.isEmpty ? nil : segments.joined(separator: "/")
  }
}
