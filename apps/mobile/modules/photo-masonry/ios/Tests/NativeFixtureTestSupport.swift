import Foundation
import XCTest
@testable import Afilmory

final class NativeFixtureBundleToken {}

enum NativeFixtureTestSupport {
  static func data(_ name: String) throws -> Data {
    let bundle = Bundle(for: NativeFixtureBundleToken.self)
    if let url = bundle.url(forResource: name, withExtension: "json", subdirectory: "Fixtures")
      ?? bundle.url(forResource: name, withExtension: "json")
    {
      return try Data(contentsOf: url)
    }
    let sourceDirectory = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
    return try Data(contentsOf: sourceDirectory.appending(path: "Fixtures/\(name).json"))
  }

  static func decode<Value: Decodable>(_ type: Value.Type, name: String) throws -> Value {
    try JSONDecoder().decode(type, from: data(name))
  }

  static let singapore = TimeZone(identifier: "Asia/Singapore")!
  static let fixedNow = ISO8601DateFormatter().date(from: "2026-08-02T16:00:00Z")!

  static func photo(
    id: String = UUID().uuidString,
    title: String? = nil,
    description: String = "",
    dateTaken: String? = nil,
    camera: String? = nil,
    lens: String? = nil,
    rating: Int? = nil,
    tags: [String] = [],
    city: String? = nil,
    country: String? = nil,
    locationName: String? = nil
  ) -> GalleryPhoto {
    GalleryPhoto(
      id: id,
      title: title ?? id,
      description: description,
      originalUrl: "",
      thumbnailUrl: "",
      thumbHash: nil,
      aspectRatio: 1,
      width: 1,
      height: 1,
      format: nil,
      size: nil,
      dateTaken: dateTaken,
      video: nil,
      tags: tags,
      exif: nil,
      toneAnalysis: nil,
      location: city == nil && country == nil && locationName == nil
        ? nil
        : GalleryLocation(
          latitude: nil,
          longitude: nil,
          country: country,
          city: city,
          locationName: locationName
        ),
      camera: camera,
      lens: lens,
      rating: rating,
      city: city
    )
  }

  static func firstDifference<Actual: Encodable, Expected: Encodable>(
    _ actual: Actual,
    _ expected: Expected
  ) throws -> String {
    let actualObject = try JSONSerialization.jsonObject(with: JSONEncoder().encode(actual))
    let expectedObject = try JSONSerialization.jsonObject(with: JSONEncoder().encode(expected))
    return difference(actualObject, expectedObject, path: "$") ?? "unknown difference"
  }

  private static func difference(_ actual: Any, _ expected: Any, path: String) -> String? {
    if let actual = actual as? [String: Any], let expected = expected as? [String: Any] {
      for key in Set(actual.keys).union(expected.keys).sorted() {
        guard let actualValue = actual[key] else { return "\(path).\(key): missing actual" }
        guard let expectedValue = expected[key] else { return "\(path).\(key): unexpected actual" }
        if let difference = difference(actualValue, expectedValue, path: "\(path).\(key)") {
          return difference
        }
      }
      return nil
    }
    if let actual = actual as? [Any], let expected = expected as? [Any] {
      guard actual.count == expected.count else {
        return "\(path): count \(actual.count) != \(expected.count)"
      }
      for index in actual.indices {
        if let difference = difference(actual[index], expected[index], path: "\(path)[\(index)]") {
          return difference
        }
      }
      return nil
    }
    let actualValue = actual as? NSObject
    let expectedValue = expected as? NSObject
    return actualValue == expectedValue ? nil : "\(path): \(actual) != \(expected)"
  }
}

struct ExpectedLocalizedModel<Model: Codable & Equatable>: Codable, Equatable {
  let id: String
  let model: Model
}
