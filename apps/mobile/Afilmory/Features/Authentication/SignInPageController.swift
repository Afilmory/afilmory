import SwiftUI
import UIKit

final class SignInPageController: UIViewController {
  private let state = SignInState()

  init() {
    super.init(nibName: nil, bundle: nil)
    modalPresentationStyle = .fullScreen
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = AFColor.ground
    let page = ExhibitPageView(photoFraction: 0.32)
    let last = IntroPage.all[IntroPage.all.count - 1]
    page.configure(image: UIImage(named: last.imageName), kicker: last.kicker, number: nil, title: last.title, body: last.body)
    page.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(page)

    let panel = SignInPanelHost.make(presentation: .standalone, state: state, onSignedIn: { [weak self] in
      self?.dismiss(animated: true)
    }, onGuest: {})
    addChild(panel)
    page.actions.addArrangedSubview(panel.view)
    panel.didMove(toParent: self)

    var configuration = UIButton.Configuration.filled()
    configuration.cornerStyle = .capsule
    configuration.baseBackgroundColor = AFColor.fill.withAlphaComponent(0.85)
    configuration.baseForegroundColor = AFColor.textPrimary
    configuration.image = UIImage(systemName: "xmark", withConfiguration: UIImage.SymbolConfiguration(pointSize: 15, weight: .semibold))
    let close = UIButton(configuration: configuration, primaryAction: UIAction { [weak self] _ in
      self?.dismiss(animated: true)
    })
    close.accessibilityLabel = String(localized: "Close")
    close.translatesAutoresizingMaskIntoConstraints = false
    page.photoCard.addSubview(close)

    NSLayoutConstraint.activate([
      page.topAnchor.constraint(equalTo: view.topAnchor),
      page.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      page.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      page.bottomAnchor.constraint(equalTo: view.bottomAnchor),
      close.topAnchor.constraint(equalTo: page.photoCard.topAnchor, constant: 12),
      close.trailingAnchor.constraint(equalTo: page.photoCard.trailingAnchor, constant: -12),
      close.widthAnchor.constraint(equalToConstant: 44),
      close.heightAnchor.constraint(equalToConstant: 44),
    ])
  }

  override func accessibilityPerformEscape() -> Bool {
    dismiss(animated: true)
    return true
  }
}

@MainActor
enum SignInPanelHost {
  static func make(
    presentation: SignInPresentation,
    state: SignInState,
    onSignedIn: @escaping @MainActor @Sendable () -> Void,
    onGuest: @escaping () -> Void
  ) -> UIViewController {
    let host = UIHostingController(rootView: SignInPanel(
      presentation: presentation,
      state: state,
      onSignedIn: onSignedIn,
      onGuest: onGuest
    ))
    host.view.backgroundColor = .clear
    host.sizingOptions = .intrinsicContentSize
    host.view.setContentCompressionResistancePriority(.required, for: .vertical)
    return host
  }
}
