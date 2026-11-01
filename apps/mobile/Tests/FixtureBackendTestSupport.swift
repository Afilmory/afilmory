#if DEBUG
  @testable import Afilmory
  import Foundation
  import XCTest

  struct FixtureCountMirror: Decodable {
    let count: Int
  }

  struct FixtureRegisteredMirror: Decodable {
    let registered: Bool
  }

  struct FixtureDeletedMirror: Decodable {
    let deleted: Bool
  }

  struct FixtureSlugMirror: Decodable {
    let slug: String
  }

  struct FixtureWorkspaceSwitchMirror: Decodable {
    let activeWorkspace: AfilmorySessionWorkspace
  }

  struct FixtureTagChangeMirror: Decodable {
    let change: PhotoChange?
  }

  struct FixtureDeleteChangesMirror: Decodable {
    let changes: [PhotoChange]?
  }

  struct FixtureReactionAnalysisMirror: Decodable {
    struct Payload: Decodable {
      let reactions: JSONValue?
    }

    let data: Payload?
  }

  struct FixtureSocialSignInMirror: Decodable {
    let redirect: Bool?
    let url: String?
  }

  enum FixtureHost {
    static let platform = "http://localhost:1841/api"
    static let production = "https://api.afilmory.art/api"

    static func tenant(_ slug: String = FixtureCatalog.ownSlug) -> String {
      "http://\(slug).localhost:1841/api"
    }
  }

  extension XCTestCase {
    @discardableResult
    func fixtureSend(
      _ method: String,
      _ url: String,
      body: [String: Any]? = nil,
      scenario: FixtureScenario
    ) -> FixtureResponse {
      var request = URLRequest(url: URL(string: url)!)
      request.httpMethod = method
      let data = body.flatMap { try? JSONSerialization.data(withJSONObject: $0) }
      return FixtureBackend.respond(to: request, body: data, scenario: scenario)
    }

    func fixtureDecode<T: Decodable>(
      _ type: T.Type,
      _ url: String,
      scenario: FixtureScenario,
      file: StaticString = #filePath,
      line: UInt = #line
    ) throws -> T {
      try fixtureDecode(type, "GET", url, scenario: scenario, file: file, line: line)
    }

    func fixtureDecode<T: Decodable>(
      _ type: T.Type,
      _ method: String,
      _ url: String,
      body: [String: Any]? = nil,
      scenario: FixtureScenario,
      file: StaticString = #filePath,
      line: UInt = #line
    ) throws -> T {
      let response = fixtureSend(method, url, body: body, scenario: scenario)
      XCTAssertTrue(
        (200..<300).contains(response.status),
        "\(scenario.rawValue) \(method) \(url) -> \(response.status) \(String(decoding: response.body, as: UTF8.self))",
        file: file,
        line: line
      )
      do {
        return try APIResponseDecoding.decode(T.self, from: response.body)
      } catch {
        XCTFail("\(scenario.rawValue) \(method) \(url) failed to decode \(T.self): \(error)", file: file, line: line)
        throw error
      }
    }

    func fixtureJSON(_ response: FixtureResponse) -> Any? {
      try? JSONSerialization.jsonObject(with: response.body, options: [.fragmentsAllowed])
    }

    func fixtureMediaURLs(in value: Any?) -> Set<String> {
      switch value {
      case let string as String:
        return string.contains(FixtureMode.host) ? [string] : []
      case let array as [Any]:
        return array.reduce(into: Set<String>()) { $0.formUnion(fixtureMediaURLs(in: $1)) }
      case let object as [String: Any]:
        return object.values.reduce(into: Set<String>()) { $0.formUnion(fixtureMediaURLs(in: $1)) }
      default:
        return []
      }
    }
  }
#endif
