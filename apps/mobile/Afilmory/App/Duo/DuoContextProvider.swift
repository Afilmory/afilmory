import UIKit

@MainActor
final class DuoContextProvider {
  private weak var controller: UIViewController?
  private var hinge: HingeReading = .unknown
  private var interaction: (any UIInteraction)?

  init(controller: UIViewController) {
    self.controller = controller
    guard #available(iOS 27.1, *) else { return }
    let interaction = UIHingeInteraction { [weak self] _, update in
      self?.hinge = HingeReading(update.hinge?.status)
      self?.refresh()
    }
    controller.view.addInteraction(interaction)
    self.interaction = interaction
    let traits = UITraitCollection.systemTraitsAffectingVerticalBarEdge + [UITraitHorizontalSizeClass.self]
    controller.registerForTraitChanges(traits) { [weak self] (_: UIViewController, _: UITraitCollection) in
      self?.refresh()
    }
  }

  func refresh() {
    guard let controller, let window = controller.view.window else { return }
    var next = resolve(controller: controller, window: window)
    #if DEBUG
      if let forced = Self.forcedContext(UserDefaults.standard.string(forKey: "duo.posture"), windowBounds: window.bounds) {
        next = forced
      }
    #endif
    if window.traitOverrides.contains(DuoContextTrait.self), window.traitOverrides.duoContext == next { return }
    window.traitOverrides.duoContext = next
  }

  static func forcedContext(_ value: String?, windowBounds: CGRect) -> DuoContext? {
    switch value {
    case "book":
      let fold = CGRect(x: windowBounds.midX - 5, y: windowBounds.minY, width: 10, height: windowBounds.height)
      return DuoContext(barEdge: .trailing, posture: .book(fold: fold))
    case "flat":
      return DuoContext(barEdge: .trailing, posture: .flat)
    case "outer":
      return DuoContext(barEdge: .trailing, posture: .single)
    default:
      return nil
    }
  }

  private func resolve(controller: UIViewController, window: UIWindow) -> DuoContext {
    guard #available(iOS 27.1, *) else { return .phone }
    let traits = controller.traitCollection
    let edge: DuoBarEdge = switch traits.verticalBarEdge {
    case .leading: .leading
    case .trailing: .trailing
    default: .none
    }
    let division = controller.view.reservedRegions(kind: .division)
      .first { $0.isActive }
      .map { controller.view.convert($0.frame, to: window) }
    return DuoContext.resolve(edge: edge, hinge: hinge, division: division, regularWidth: traits.horizontalSizeClass == .regular)
  }
}

@available(iOS 27.1, *)
extension HingeReading {
  init(_ status: UIHinge.Status?) {
    switch status {
    case .closed: self = .closed
    case .partiallyOpen: self = .partiallyOpen
    case .fullyOpen: self = .fullyOpen
    default: self = .unknown
    }
  }
}
