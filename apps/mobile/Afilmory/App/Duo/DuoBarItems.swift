import UIKit

@MainActor
enum DuoBarItems {
  static func symbol(_ name: String, label: String, enabled: Bool = true, action: @escaping () -> Void) -> UIBarButtonItem {
    let item = UIBarButtonItem(image: UIImage(systemName: name), primaryAction: UIAction { _ in action() })
    item.accessibilityLabel = label
    item.title = label
    item.isEnabled = enabled
    return item
  }

  static func custom(_ view: UIView, label: String) -> UIBarButtonItem {
    let item = UIBarButtonItem(customView: view)
    item.hidesSharedBackground = true
    item.accessibilityLabel = label
    item.title = label
    return item
  }

  static func install(_ items: [UIBarButtonItem], on controller: UIViewController) {
    let shown = controller.traitCollection.duoContext.hasVerticalBar ? items : []
    if #available(iOS 27.1, *) {
      shown.forEach { $0.axisBehavior = .verticalPreferred }
    }
    controller.navigationItem.rightBarButtonItems = shown
  }

  static func observe<Controller: UIViewController>(_ controller: Controller, apply: @escaping (Controller) -> Void) {
    controller.registerForTraitChanges([DuoContextTrait.self]) { (controller: Controller, _: UITraitCollection) in
      apply(controller)
    }
  }
}
