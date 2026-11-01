import Foundation

enum ContactSheetLevel: Int, CaseIterable, Sendable {
  case day
  case month
  case year
  case infinity

  var label: String {
    switch self {
    case .day: String(localized: "Day")
    case .month: String(localized: "Month")
    case .year: String(localized: "Year")
    case .infinity: "∞"
    }
  }
}
