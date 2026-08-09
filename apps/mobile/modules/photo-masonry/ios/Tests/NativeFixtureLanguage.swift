import Foundation

/// Golden fixtures are keyed by the legacy locale codes the capture script wrote.
/// The models under test now localize through the app bundle, so a run only ever
/// exercises one language — pass `-testLanguage zh-Hans` (etc.) to cover another.
enum NativeFixtureLanguage {
  static var current: String {
    switch Bundle.main.preferredLocalizations.first {
    case "zh-Hans": "zh-CN"
    case "zh-Hant": "zh-TW"
    case "zh-HK": "zh-HK"
    case "ja": "jp"
    case "ko": "ko"
    default: "en"
    }
  }
}
