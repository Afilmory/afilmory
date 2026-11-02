import UIKit

final class PostSetupController: UIViewController {
  private let flow: PostSetupFlow
  private var pageView: UIView?
  private lazy var uploadFlow = DarkroomUploadFlow(host: self, availableTags: { [] })
  private let onClose: (_ developing: Bool) -> Void

  init(permissions: PostSetupPermissions = LivePostSetupPermissions(), onClose: @escaping (_ developing: Bool) -> Void) {
    flow = PostSetupFlow(permissions: permissions)
    self.onClose = onClose
    super.init(nibName: nil, bundle: nil)
    modalPresentationStyle = .fullScreen
    isModalInPresentation = true
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = AFColor.ground
    flow.onStepChange = { [weak self] step in self?.render(step, animated: true) }
    uploadFlow.onEnqueued = { [weak self] in self?.close(developing: true) }
    render(.permissions, animated: false)
    Task { await flow.start() }
  }

  private func render(_ step: PostSetupFlow.Step, animated: Bool) {
    let next: UIView
    switch step {
    case .permissions:
      next = PostSetupPages.permissions(
        showsNotifications: AfilmoryBuildConfiguration.supportsPushNotifications,
        onAllow: { [weak self] in
          guard let self else { return }
          Task { await self.flow.allow() }
        },
        onLater: { [weak self] in self?.flow.later() }
      )
    case .firstRoll:
      next = PostSetupPages.firstRoll(
        onSelect: { [weak self] in self?.uploadFlow.begin() },
        onSkip: { [weak self] in self?.close(developing: false) }
      )
    case .done:
      return
    }
    next.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(next)
    NSLayoutConstraint.activate([
      next.topAnchor.constraint(equalTo: view.topAnchor),
      next.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      next.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      next.bottomAnchor.constraint(equalTo: view.bottomAnchor),
    ])
    let previous = pageView
    pageView = next
    UIAccessibility.post(notification: .screenChanged, argument: next)
    guard animated, let previous else {
      previous?.removeFromSuperview()
      return
    }
    previous.isUserInteractionEnabled = false
    AFMotion.defocus(previous)
    UIView.animate(withDuration: AFMotion.reduceMotion ? 0.25 : 0.32) {
      previous.alpha = 0
    } completion: { _ in
      previous.removeFromSuperview()
    }
    AFMotion.rackIn(next)
  }

  private func close(developing: Bool) {
    flow.finish()
    onClose(developing)
  }
}
