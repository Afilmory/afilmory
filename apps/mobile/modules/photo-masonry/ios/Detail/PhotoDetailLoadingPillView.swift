import UIKit

enum PhotoOriginalLoadState: Equatable {
  case idle
  case loading(tier: Int, receivedBytes: Int, expectedBytes: Int)
  case finished
  case failed
}

struct PhotoLoadPillStateMachine: Equatable {
  enum Phase: Equatable {
    case idle
    case pending(showAt: TimeInterval)
    case showing
    case error(hideAt: TimeInterval)
  }

  enum Display: Equatable {
    case hidden
    case loading(receivedBytes: Int, expectedBytes: Int?)
    case error
  }

  // Delays keep cache hits from flashing the pill; zoom-tier re-decodes
  // stay silent unless they drag on.
  static let firstLoadDelay: TimeInterval = 0.35
  static let tierUpgradeDelay: TimeInterval = 1
  static let errorHold: TimeInterval = 2.5

  private(set) var phase = Phase.idle
  private(set) var receivedBytes = 0
  private(set) var expectedBytes: Int?

  var display: Display {
    switch phase {
    case .idle, .pending:
      return .hidden
    case .showing:
      return .loading(receivedBytes: receivedBytes, expectedBytes: expectedBytes)
    case .error:
      return .error
    }
  }

  var nextDeadline: TimeInterval? {
    switch phase {
    case .pending(let showAt):
      return showAt
    case .error(let hideAt):
      return hideAt
    case .idle, .showing:
      return nil
    }
  }

  mutating func handle(_ state: PhotoOriginalLoadState, now: TimeInterval) {
    switch state {
    case .idle:
      phase = .idle
      receivedBytes = 0
      expectedBytes = nil
    case .loading(let tier, let received, let expected):
      receivedBytes = received
      expectedBytes = expected > 0 ? expected : nil
      switch phase {
      case .idle, .error:
        let delay = tier <= 1 ? Self.firstLoadDelay : Self.tierUpgradeDelay
        phase = .pending(showAt: now + delay)
      case .pending, .showing:
        break
      }
    case .finished:
      phase = .idle
    case .failed:
      phase = .error(hideAt: now + Self.errorHold)
    }
    tick(now: now)
  }

  mutating func tick(now: TimeInterval) {
    switch phase {
    case .pending(let showAt) where now >= showAt:
      phase = .showing
    case .error(let hideAt) where now >= hideAt:
      phase = .idle
    default:
      break
    }
  }
}

final class PhotoDetailLoadingPillView: UIView {
  private static let ringSize: CGFloat = 20
  private static let ringLineWidth: CGFloat = 2
  private static let horizontalInset: CGFloat = 12
  private static let verticalInset: CGFloat = 8
  private static let ringSpacing: CGFloat = 8
  private static let lineSpacing: CGFloat = 2

  private let backgroundView = UIVisualEffectView(
    effect: AdaptiveGlass.effect(fallbackStyle: .systemThinMaterialDark)
  )
  private let ringView = UIView()
  private let trackLayer = CAShapeLayer()
  private let progressLayer = CAShapeLayer()
  private let errorIconView = UIImageView()
  private let titleLabel = UILabel()
  private let subtitleLabel = UILabel()

  private let loadingTitle = String(localized: "Loading original")
  private let failedTitle = String(localized: "Failed to load original")

  private var machine = PhotoLoadPillStateMachine()
  private var pendingTick: DispatchWorkItem?
  private var visible = false
  private var lastFittedSize = CGSize.zero

  var onSizeChange: (() -> Void)?

  override init(frame: CGRect) {
    super.init(frame: frame)

    isUserInteractionEnabled = false
    isHidden = true
    alpha = 0
    accessibilityIdentifier = "photo-loading-pill"

    backgroundView.clipsToBounds = true
    backgroundView.layer.cornerCurve = .continuous
    addSubview(backgroundView)

    trackLayer.fillColor = nil
    trackLayer.lineWidth = Self.ringLineWidth
    trackLayer.strokeColor = UIColor.white.withAlphaComponent(0.25).cgColor
    ringView.layer.addSublayer(trackLayer)

    progressLayer.fillColor = nil
    progressLayer.lineCap = .round
    progressLayer.lineWidth = Self.ringLineWidth
    progressLayer.strokeColor = UIColor.white.cgColor
    progressLayer.strokeEnd = 0
    ringView.layer.addSublayer(progressLayer)
    addSubview(ringView)

    errorIconView.image = UIImage(
      systemName: "exclamationmark.triangle.fill",
      withConfiguration: UIImage.SymbolConfiguration(pointSize: 13, weight: .semibold)
    )
    errorIconView.tintColor = .systemRed
    errorIconView.contentMode = .center
    errorIconView.isHidden = true
    addSubview(errorIconView)

    titleLabel.font = .monospacedDigitSystemFont(ofSize: 13, weight: .semibold)
    titleLabel.textColor = .white
    addSubview(titleLabel)

    subtitleLabel.font = .monospacedDigitSystemFont(ofSize: 11, weight: .regular)
    subtitleLabel.textColor = UIColor.white.withAlphaComponent(0.7)
    addSubview(subtitleLabel)
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) is not supported")
  }

  func handle(_ state: PhotoOriginalLoadState) {
    machine.handle(state, now: CACurrentMediaTime())
    render()
    scheduleTick()
  }

  override func sizeThatFits(_ size: CGSize) -> CGSize {
    let titleWidth = titleLabel.intrinsicContentSize.width
    let subtitleWidth = subtitleLabel.isHidden ? 0 : subtitleLabel.intrinsicContentSize.width
    let textWidth = max(titleWidth, subtitleWidth)
    let width = Self.horizontalInset + Self.ringSize + Self.ringSpacing + textWidth + Self.horizontalInset
    var textHeight = titleLabel.intrinsicContentSize.height
    if !subtitleLabel.isHidden {
      textHeight += Self.lineSpacing + subtitleLabel.intrinsicContentSize.height
    }
    let height = max(Self.ringSize, textHeight) + Self.verticalInset * 2
    return CGSize(width: ceil(min(width, size.width > 0 ? size.width : width)), height: ceil(height))
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    backgroundView.frame = bounds
    backgroundView.layer.cornerRadius = bounds.height / 2

    let ringFrame = CGRect(
      x: Self.horizontalInset,
      y: (bounds.height - Self.ringSize) / 2,
      width: Self.ringSize,
      height: Self.ringSize
    )
    if ringView.frame != ringFrame {
      ringView.frame = ringFrame
      let ringPath = UIBezierPath(
        arcCenter: CGPoint(x: Self.ringSize / 2, y: Self.ringSize / 2),
        radius: (Self.ringSize - Self.ringLineWidth) / 2,
        startAngle: -.pi / 2,
        endAngle: .pi * 1.5,
        clockwise: true
      )
      trackLayer.frame = ringView.bounds
      trackLayer.path = ringPath.cgPath
      progressLayer.frame = ringView.bounds
      progressLayer.path = ringPath.cgPath
    }
    errorIconView.frame = ringFrame

    let textX = ringFrame.maxX + Self.ringSpacing
    let textWidth = bounds.width - textX - Self.horizontalInset
    let titleHeight = titleLabel.intrinsicContentSize.height
    if subtitleLabel.isHidden {
      titleLabel.frame = CGRect(x: textX, y: (bounds.height - titleHeight) / 2, width: textWidth, height: titleHeight)
    } else {
      let subtitleHeight = subtitleLabel.intrinsicContentSize.height
      let textHeight = titleHeight + Self.lineSpacing + subtitleHeight
      let textY = (bounds.height - textHeight) / 2
      titleLabel.frame = CGRect(x: textX, y: textY, width: textWidth, height: titleHeight)
      subtitleLabel.frame = CGRect(
        x: textX,
        y: textY + titleHeight + Self.lineSpacing,
        width: textWidth,
        height: subtitleHeight
      )
    }
  }

  private func applyTick() {
    machine.tick(now: CACurrentMediaTime())
    render()
    scheduleTick()
  }

  private func scheduleTick() {
    pendingTick?.cancel()
    pendingTick = nil
    guard let deadline = machine.nextDeadline else { return }
    let item = DispatchWorkItem { [weak self] in self?.applyTick() }
    pendingTick = item
    DispatchQueue.main.asyncAfter(
      deadline: .now() + max(0, deadline - CACurrentMediaTime()),
      execute: item
    )
  }

  private func render() {
    switch machine.display {
    case .hidden:
      setVisible(false)
    case .loading(let received, let expected):
      renderLoading(received: received, expected: expected)
      setVisible(true)
    case .error:
      renderError()
      setVisible(true)
    }
  }

  private func renderLoading(received: Int, expected: Int?) {
    errorIconView.isHidden = true
    ringView.isHidden = false

    if let expected {
      let fraction = min(max(Double(received) / Double(expected), 0), 1)
      progressLayer.removeAnimation(forKey: "spin")
      // Progress arrives in rapid bursts; implicit 0.25s animations pile up and
      // leave the presentation arc far behind the model value.
      CATransaction.begin()
      CATransaction.setDisableActions(true)
      progressLayer.strokeEnd = fraction
      CATransaction.commit()
      titleLabel.text = "\(loadingTitle) \(Int(fraction * 100))%"
      subtitleLabel.isHidden = false
      subtitleLabel.text = "\(megabytes(received)) / \(megabytes(expected))"
    } else {
      if progressLayer.animation(forKey: "spin") == nil {
        let spin = CABasicAnimation(keyPath: "transform.rotation.z")
        spin.fromValue = 0
        spin.toValue = CGFloat.pi * 2
        spin.duration = 0.9
        spin.repeatCount = .infinity
        progressLayer.add(spin, forKey: "spin")
      }
      CATransaction.begin()
      CATransaction.setDisableActions(true)
      progressLayer.strokeEnd = 0.3
      CATransaction.commit()
      titleLabel.text = loadingTitle
      subtitleLabel.isHidden = received <= 0
      subtitleLabel.text = received > 0 ? megabytes(received) : nil
    }
    accessibilityLabel = titleLabel.text
    notifySizeChangeIfNeeded()
  }

  private func renderError() {
    progressLayer.removeAnimation(forKey: "spin")
    ringView.isHidden = true
    errorIconView.isHidden = false
    titleLabel.text = failedTitle
    subtitleLabel.isHidden = true
    subtitleLabel.text = nil
    accessibilityLabel = failedTitle
    notifySizeChangeIfNeeded()
  }

  private func notifySizeChangeIfNeeded() {
    let fitted = sizeThatFits(.zero)
    guard fitted != lastFittedSize else { return }
    lastFittedSize = fitted
    onSizeChange?()
  }

  private func setVisible(_ newVisible: Bool) {
    guard newVisible != visible else { return }
    visible = newVisible
    if newVisible {
      isHidden = false
      alpha = 0
      transform = CGAffineTransform(scaleX: 0.95, y: 0.95)
      UIView.animate(
        withDuration: 0.35,
        delay: 0,
        usingSpringWithDamping: 0.85,
        initialSpringVelocity: 0,
        options: [.beginFromCurrentState, .allowUserInteraction]
      ) {
        self.alpha = 1
        self.transform = .identity
      }
    } else {
      UIView.animate(
        withDuration: 0.2,
        delay: 0,
        options: [.beginFromCurrentState, .curveEaseIn]
      ) {
        self.alpha = 0
        self.transform = CGAffineTransform(scaleX: 0.97, y: 0.97)
      } completion: { _ in
        guard !self.visible else { return }
        self.isHidden = true
        self.transform = .identity
      }
    }
  }

  private func megabytes(_ bytes: Int) -> String {
    String(format: "%.1f MB", Double(bytes) / 1_048_576)
  }
}
