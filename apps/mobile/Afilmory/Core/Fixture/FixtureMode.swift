import Foundation

enum FixtureScenario: String, CaseIterable, Sendable {
  case owner
  case newcomer
  case empty
  case visitor
  case offline
}

enum FixtureMode {
  static let host = "fixture.afilmory.invalid"

  static let isOn: Bool = {
    #if DEBUG
      let environment = ProcessInfo.processInfo.environment
      if environment["XCTestConfigurationFilePath"] != nil, environment["AFILMORY_FIXTURE"] == nil {
        return false
      }
      return UserDefaults.standard.bool(forKey: "fixture.mode") || environment["AFILMORY_FIXTURE"] == "1"
    #else
      return false
    #endif
  }()

  static let scenario: FixtureScenario = {
    let raw = UserDefaults.standard.string(forKey: "fixture.scenario")
      ?? ProcessInfo.processInfo.environment["AFILMORY_FIXTURE_SCENARIO"]
    return raw.flatMap(FixtureScenario.init(rawValue:)) ?? .owner
  }()

  static var uploadsFail: Bool {
    scenario == .offline || UserDefaults.standard.bool(forKey: "fixture.uploadFails")
  }

  static var mediaFails: Bool {
    UserDefaults.standard.bool(forKey: "fixture.mediaFails")
  }

  static var latency: TimeInterval {
    let milliseconds = UserDefaults.standard.double(forKey: "fixture.latency")
    return milliseconds > 0 ? milliseconds / 1000 : 0.12
  }

  static var bandwidth: Double {
    UserDefaults.standard.double(forKey: "fixture.bandwidth")
  }

  static func mediaStreamDuration(bytes: Int, latency: TimeInterval = latency, bandwidth: Double = bandwidth) -> TimeInterval {
    bandwidth > 0 ? Double(bytes) / (bandwidth * 1024) : latency / 2
  }

  static var catalogEntryID: String? {
    #if DEBUG
      let arguments = ProcessInfo.processInfo.arguments
      guard let index = arguments.firstIndex(of: "-catalog-open"), arguments.indices.contains(index + 1) else {
        return nil
      }
      return arguments[index + 1]
    #else
      return nil
    #endif
  }

  static func storageRoot(
    _ name: String,
    fixture: Bool = isOn,
    base: URL,
    temporary: URL = FileManager.default.temporaryDirectory
  ) -> URL {
    let parent = fixture ? temporary.appendingPathComponent("fixture", isDirectory: true) : base
    return parent.appendingPathComponent(name, isDirectory: true)
  }

  static func imageCacheDirectory(temporary: URL = FileManager.default.temporaryDirectory) -> String {
    temporary.appendingPathComponent("fixture/image-cache", isDirectory: true).path
  }

  static func mediaURL(_ name: String) -> URL {
    URL(string: "https://\(host)/media/\(name)")!
  }

  static func playableURL(for url: URL) -> URL {
    #if DEBUG
      guard url.host == host, url.path.hasPrefix("/media/") else { return url }
      let name = url.lastPathComponent as NSString
      return Bundle.main.url(forResource: name.deletingPathExtension, withExtension: name.pathExtension) ?? url
    #else
      return url
    #endif
  }
}
