import UIKit

final class DetailReactionRail: UIView {
  static let height: CGFloat = 56
  static let comboCap = 99

  var onSend: ((PhotoReaction, Int) -> Void)?

  private let background = UIVisualEffectView(effect: AdaptiveGlass.effect())
  private var buttons: [UIButton] = []
  private var counts: [UILabel] = []
  private var streamTimer: Timer?
  private var holdTimer: Timer?
  private var streamCount = 0
  private var streamingReaction: PhotoReaction?
  private let haptics = UIImpactFeedbackGenerator(style: .light)

  override init(frame: CGRect) {
    super.init(frame: frame)
    background.layer.cornerRadius = Self.height / 2
    background.layer.cornerCurve = .continuous
    background.clipsToBounds = true
    if #unavailable(iOS 26.0) {
      background.backgroundColor = UIColor(afHex: 0x262421, alpha: 0.8)
    }
    addSubview(background)
    for reaction in PhotoReaction.allCases {
      let button = UIButton(type: .custom)
      button.setTitle(reaction.rawValue, for: .normal)
      button.titleLabel?.font = .systemFont(ofSize: 24)
      button.accessibilityLabel = Self.name(reaction)
      button.addAction(UIAction { [weak self] _ in self?.tap(reaction) }, for: .touchUpInside)
      let press = UILongPressGestureRecognizer(target: self, action: #selector(pressed(_:)))
      press.minimumPressDuration = 0.4
      button.addGestureRecognizer(press)
      button.tag = buttons.count
      let count = AFLabel.mono(size: 9, color: AFColor.textSecondary)
      count.translatesAutoresizingMaskIntoConstraints = true
      count.textAlignment = .center
      count.isAccessibilityElement = false
      buttons.append(button)
      counts.append(count)
      background.contentView.addSubview(button)
      background.contentView.addSubview(count)
    }
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  override var intrinsicContentSize: CGSize {
    CGSize(width: CGFloat(PhotoReaction.allCases.count) * 46 + 16, height: Self.height)
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    background.frame = bounds
    for (index, button) in buttons.enumerated() {
      button.frame = CGRect(x: 8 + CGFloat(index) * 46, y: 2, width: 46, height: 42)
      counts[index].frame = CGRect(x: button.frame.minX, y: 40, width: 46, height: 12)
    }
  }

  func setCounts(_ values: [String: Int]) {
    for (index, reaction) in PhotoReaction.allCases.enumerated() {
      let value = values[reaction.rawValue] ?? 0
      counts[index].text = value > 0 ? "\(value)" : ""
      buttons[index].accessibilityValue = "\(value)"
    }
  }

  private func tap(_ reaction: PhotoReaction) {
    guard streamingReaction == nil else { return }
    haptics.impactOccurred()
    pulse(reaction)
    onSend?(reaction, 1)
  }

  @objc private func pressed(_ gesture: UILongPressGestureRecognizer) {
    guard let index = gesture.view?.tag, PhotoReaction.allCases.indices.contains(index) else { return }
    let reaction = PhotoReaction.allCases[index]
    switch gesture.state {
    case .began:
      streamingReaction = reaction
      streamCount = 0
      fire()
      streamTimer = Timer.scheduledTimer(withTimeInterval: 0.18, repeats: true) { [weak self] _ in
        MainActor.assumeIsolated { self?.fire() }
      }
    case .ended, .cancelled, .failed:
      streamTimer?.invalidate()
      streamTimer = nil
      if let streamingReaction, streamCount > 0 { onSend?(streamingReaction, streamCount) }
      streamingReaction = nil
      streamCount = 0
    default:
      break
    }
  }

  private func fire() {
    guard let reaction = streamingReaction, streamCount < Self.comboCap else { return }
    streamCount += 1
    haptics.impactOccurred(intensity: min(1, 0.4 + CGFloat(streamCount) / 30))
    pulse(reaction)
  }

  private func pulse(_ reaction: PhotoReaction) {
    guard let index = PhotoReaction.allCases.firstIndex(of: reaction) else { return }
    let button = buttons[index]
    guard !AFMotion.reduceMotion else { return }
    button.transform = CGAffineTransform(scaleX: 1.3, y: 1.3)
    AFMotion.spring(duration: 0.35, damping: 0.5, animations: { button.transform = .identity })
  }

  private static func name(_ reaction: PhotoReaction) -> String {
    switch reaction {
    case .like: String(localized: "Like")
    case .love: String(localized: "Love")
    case .fire: String(localized: "Fire")
    case .applause: String(localized: "Applause")
    case .star: String(localized: "Star")
    case .celebrate: String(localized: "Celebrate")
    }
  }
}
