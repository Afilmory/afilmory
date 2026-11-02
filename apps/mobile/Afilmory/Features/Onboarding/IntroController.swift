import UIKit

final class IntroController: UIViewController {
  enum Mode {
    case firstLaunch
    case replay
  }

  private let mode: Mode
  private let onFinish: () -> Void
  private var flow: IntroFlow
  private var pageView: ExhibitPageView?
  private var exposed = false
  private let pages = IntroPage.all

  private let signInState = SignInState()

  init(mode: Mode, flags: OnboardingFlags = .shared, onFinish: @escaping () -> Void) {
    self.mode = mode
    self.onFinish = onFinish
    flow = IntroFlow(flags: flags)
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
    let back = UIPanGestureRecognizer(target: self, action: #selector(handleBackSwipe(_:)))
    back.delegate = self
    view.addGestureRecognizer(back)
    show(index: 0, forward: true, animated: false)
  }

  override func viewDidAppear(_ animated: Bool) {
    super.viewDidAppear(animated)
    guard !exposed, let page = pageView else { return }
    exposed = true
    page.labelStack.alpha = 0
    page.actions.alpha = 0
    AFMotion.expose(page.photoCard) {
      AFMotion.rackIn(page.labelStack)
      AFMotion.rackIn(page.actions, delay: 0.08)
    }
  }

  func advance() {
    let from = flow.index
    flow.advance()
    guard flow.index != from else { return }
    show(index: flow.index, forward: true, animated: true)
  }

  func skip() {
    guard !flow.isSignInPage else { return }
    flow.skip()
    show(index: flow.index, forward: true, animated: true)
  }

  func finish() {
    flow.flags.introSeen = true
    onFinish()
  }

  private func goBack() {
    let from = flow.index
    flow.back()
    guard flow.index != from else { return }
    show(index: flow.index, forward: false, animated: true)
  }

  @objc private func handleBackSwipe(_ gesture: UIPanGestureRecognizer) {
    guard gesture.state == .ended else { return }
    let translation = gesture.translation(in: view)
    let velocity = gesture.velocity(in: view)
    guard abs(translation.x) > abs(translation.y) else { return }
    if translation.x > 60 || velocity.x > 600 {
      goBack()
    } else if translation.x < -60 || velocity.x < -600, !flow.isSignInPage {
      advance()
    }
  }

  private func show(index: Int, forward: Bool, animated: Bool) {
    let staleChildren = children
    let page = pages[index]
    let next = ExhibitPageView(photoFraction: index == pages.count - 1 ? 0.32 : 0.53)
    next.configure(image: UIImage(named: page.imageName), kicker: page.kicker, number: page.number == 4 ? nil : page.number, title: page.title, body: page.body)
    let dots = AFProgressDots(count: pages.count)
    dots.accentColor = next.accent
    dots.setCurrent(index, animated: false)
    next.actions.addArrangedSubview(dots)
    next.actions.setCustomSpacing(18, after: dots)
    for action in actions(for: index) {
      next.actions.addArrangedSubview(action)
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
    UIAccessibility.post(notification: .screenChanged, argument: next.labelStack)
    let release = {
      for child in staleChildren {
        child.willMove(toParent: nil)
        child.removeFromParent()
      }
    }
    guard animated, let previous else {
      previous?.removeFromSuperview()
      release()
      return
    }
    view.bringSubviewToFront(next)
    next.backgroundColor = .clear
    previous.isUserInteractionEnabled = false
    AFMotion.defocus(previous, amount: forward ? 1 : 0.6)
    UIView.animate(withDuration: AFMotion.reduceMotion ? 0.25 : 0.32) {
      previous.alpha = 0
    } completion: { _ in
      previous.removeFromSuperview()
      release()
      next.backgroundColor = AFColor.ground
    }
    AFMotion.rackIn(next)
  }

  private func actions(for index: Int) -> [UIView] {
    if index == pages.count - 1 {
      if mode == .replay {
        return [primary(String(localized: "Done")) { [weak self] in self?.finish() }]
      }
      let panel = SignInPanelHost.make(
        presentation: .intro,
        state: signInState,
        onSignedIn: {},
        onGuest: { [weak self] in self?.finish() }
      )
      addChild(panel)
      panel.didMove(toParent: self)
      return [panel.view]
    }
    return [
      primary(String(localized: "Continue")) { [weak self] in self?.advance() },
      AFTextButton.make(String(localized: "Skip intro")) { [weak self] in self?.skip() },
    ]
  }

  private func primary(_ title: String, action: @escaping () -> Void) -> UIView {
    let button = DarkroomPillButton(style: .filled, height: 52)
    button.setTitle(title, size: 17)
    button.addAction(UIAction { _ in action() }, for: .primaryActionTriggered)
    return button
  }
}

extension IntroController: UIGestureRecognizerDelegate {
  func gestureRecognizer(_: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith _: UIGestureRecognizer) -> Bool {
    true
  }
}
