import UIKit

enum DuoBarEdge: Sendable, Equatable {
  case none
  case leading
  case trailing
}

enum DuoPosture: Sendable, Equatable {
  case single
  case book(fold: CGRect)
  case flat
}

enum HingeReading: Sendable, Equatable {
  case unknown
  case closed
  case partiallyOpen
  case fullyOpen
}

struct DuoContext: Sendable, Equatable {
  var barEdge: DuoBarEdge
  var posture: DuoPosture

  static let phone = DuoContext(barEdge: .none, posture: .single)

  var hasVerticalBar: Bool { barEdge != .none }

  var isExpanded: Bool { posture != .single }

  var isBook: Bool {
    if case .book = posture { return true }
    return false
  }

  var isFlat: Bool { posture == .flat }

  static func resolve(edge: DuoBarEdge, hinge: HingeReading, division: CGRect?, regularWidth: Bool) -> DuoContext {
    guard edge != .none else { return .phone }
    guard hinge != .closed, regularWidth else { return DuoContext(barEdge: edge, posture: .single) }
    if hinge != .fullyOpen, let division, division.height > 0 {
      return DuoContext(barEdge: edge, posture: .book(fold: division))
    }
    return DuoContext(barEdge: edge, posture: .flat)
  }
}

struct DuoContextTrait: UITraitDefinition {
  static let defaultValue = DuoContext.phone
  static let affectsColorAppearance = false
  static let name = "AfilmoryDuoContext"
}

extension UITraitCollection {
  var duoContext: DuoContext { self[DuoContextTrait.self] }
}

extension UIMutableTraits {
  var duoContext: DuoContext {
    get { self[DuoContextTrait.self] }
    set { self[DuoContextTrait.self] = newValue }
  }
}

extension UIView {
  var duoContext: DuoContext { traitCollection.duoContext }
}
