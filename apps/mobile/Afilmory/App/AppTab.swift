import Foundation

enum AppTab: Int, CaseIterable, Sendable {
  case exhibition
  case viewing
  case darkroom

  var title: String {
    switch self {
    case .exhibition: String(localized: "Exhibition")
    case .viewing: String(localized: "Viewing")
    case .darkroom: String(localized: "Darkroom")
    }
  }
}

enum DeepLinkTabRouting {
  static func tab(for link: AfilmoryDeepLink) -> AppTab {
    switch link {
    case .root, .photos, .map: .exhibition
    case .explore: .viewing
    case .studio, .developerLab: .darkroom
    }
  }
}
