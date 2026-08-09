import SwiftUI
import UIKit

final class PhotoDetailInfoView: UIView {
  private var info = PhotoInfoSheetModel.empty
  private var hostingController: UIHostingController<PhotoInfoInspectorView>!
  private var scrollEdgeInteraction: AnyObject?
  private weak var edgeEffectScrollView: UIScrollView?

  override init(frame: CGRect) {
    super.init(frame: frame)

    backgroundColor = .systemGroupedBackground
    hostingController = UIHostingController(rootView: makeRootView())
    hostingController.view.backgroundColor = .systemGroupedBackground
    addSubview(hostingController.view)
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) is not supported")
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    hostingController.view.frame = bounds
  }

  /// Wires the hosted scroll view to the detail toolbar so content passing under
  /// it gets the system soft edge effect. SwiftUI cannot do this itself — the
  /// toolbar is a UIKit sibling, so it is invisible to `scrollEdgeEffectStyle`.
  func installScrollEdgeEffect(under container: UIView) {
    guard #available(iOS 26.0, *) else { return }
    guard let scrollView = firstScrollView(in: self), scrollView !== edgeEffectScrollView else { return }
    if let interaction = scrollEdgeInteraction as? UIScrollEdgeElementContainerInteraction {
      container.removeInteraction(interaction)
    }
    scrollView.bottomEdgeEffect.style = .soft
    let interaction = UIScrollEdgeElementContainerInteraction()
    interaction.scrollView = scrollView
    interaction.edge = .bottom
    container.addInteraction(interaction)
    scrollEdgeInteraction = interaction
    edgeEffectScrollView = scrollView
  }

  private func firstScrollView(in view: UIView) -> UIScrollView? {
    if let scrollView = view as? UIScrollView {
      return scrollView
    }
    for subview in view.subviews {
      if let found = firstScrollView(in: subview) {
        return found
      }
    }
    return nil
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    if window == nil {
      hostingController.willMove(toParent: nil)
      hostingController.removeFromParent()
    } else {
      attachHostingControllerIfNeeded()
    }
  }

  func setInfo(_ value: PhotoInfoSheetModel) {
    info = value
    hostingController.rootView = makeRootView()
  }

  private func makeRootView() -> PhotoInfoInspectorView {
    PhotoInfoInspectorView(
      info: info,
      showsHeader: false,
      bottomContentInset: 82,
      onClose: {}
    )
  }

  private func attachHostingControllerIfNeeded() {
    guard hostingController.parent == nil else { return }
    var responder: UIResponder? = next
    while let current = responder {
      if let viewController = current as? UIViewController {
        viewController.addChild(hostingController)
        hostingController.didMove(toParent: viewController)
        return
      }
      responder = current.next
    }
  }
}
