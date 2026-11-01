import UIKit

final class AFCloseBar: UINavigationBar {
  init(action: @escaping () -> Void) {
    super.init(frame: CGRect(origin: .zero, size: CGSize(width: 64, height: 44)))
    translatesAutoresizingMaskIntoConstraints = false
    let appearance = UINavigationBarAppearance()
    appearance.configureWithTransparentBackground()
    standardAppearance = appearance
    scrollEdgeAppearance = appearance
    compactAppearance = appearance
    let item = UINavigationItem()
    item.rightBarButtonItem = UIBarButtonItem(systemItem: .close, primaryAction: UIAction { _ in action() })
    setItems([item], animated: false)
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  override var intrinsicContentSize: CGSize { CGSize(width: 64, height: 44) }
}
