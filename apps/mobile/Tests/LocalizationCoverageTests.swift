import XCTest

final class LocalizationCoverageTests: XCTestCase {
  private static let languages = ["zh-Hans", "zh-Hant", "zh-HK", "ja", "ko"]

  private var mobileRoot: URL {
    URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
  }

  private func catalog() throws -> [String: Any] {
    let url = mobileRoot.appending(path: "Afilmory/Resources/Localizable.xcstrings")
    let object = try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any]
    return try XCTUnwrap(object?["strings"] as? [String: Any])
  }

  private func sourceKeys() throws -> [String: String] {
    let pattern = try NSRegularExpression(pattern: #"String\(localized:\s*"((?:[^"\\]|\\.)*)""#)
    var keys: [String: String] = [:]
    let root = mobileRoot.appending(path: "Afilmory")
    let enumerator = try XCTUnwrap(FileManager.default.enumerator(at: root, includingPropertiesForKeys: nil))
    for case let url as URL in enumerator where url.pathExtension == "swift" && !url.path.contains("/Fixtures/") {
      let text = try String(contentsOf: url, encoding: .utf8)
      for match in pattern.matches(in: text, range: NSRange(text.startIndex..., in: text)) {
        guard let range = Range(match.range(at: 1), in: text) else { continue }
        let raw = String(text[range])
        guard !raw.contains("\\(") else { continue }
        keys[raw.replacingOccurrences(of: #"\""#, with: "\""), default: url.lastPathComponent] = url.lastPathComponent
      }
    }
    return keys
  }

  func testEveryLiteralKeyIsInTheCatalogWithAllLanguages() throws {
    let strings = try catalog()
    var problems: [String] = []
    for (key, file) in try sourceKeys().sorted(by: { $0.key < $1.key }) {
      guard let entry = strings[key] as? [String: Any] else {
        problems.append("missing key \"\(key)\" (\(file))")
        continue
      }
      if entry["shouldTranslate"] as? Bool == false { continue }
      let localizations = entry["localizations"] as? [String: Any] ?? [:]
      let absent = Self.languages.filter { localizations[$0] == nil }
      if !absent.isEmpty {
        problems.append("\"\(key)\" lacks \(absent.joined(separator: ","))")
      }
    }
    XCTAssertTrue(problems.isEmpty, problems.prefix(40).joined(separator: "\n"))
  }

  func testNoCatalogEntryIsBothLeafAndMissingTranslations() throws {
    let strings = try catalog()
    for (key, value) in strings {
      guard let entry = value as? [String: Any], entry["extractionState"] as? String != "stale",
            entry["shouldTranslate"] as? Bool != false
      else { continue }
      let localizations = entry["localizations"] as? [String: Any] ?? [:]
      XCTAssertTrue(Self.languages.allSatisfy { localizations[$0] != nil }, key)
    }
  }
}
