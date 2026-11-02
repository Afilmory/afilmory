import UIKit

final class DetailOriginalProgressView: UIView {
  var onRetry: (() -> Void)?
  var accent: UIColor = AFColor.accentFallback {
    didSet {
      fill.backgroundColor = accent
      segment.backgroundColor = accent
    }
  }

  private let track = UIView()
  private let fill = UIView()
  private let segment = UIView()
  private let titleLabel = AFLabel.mono(size: 11)
  private let amountLabel = AFLabel.mono(size: 11, color: AFColor.textPrimary)
  private(set) lazy var retryButton = AFGlassButton.titled(String(localized: "Retry original"), symbol: "arrow.clockwise") { [weak self] in
    self?.onRetry?()
  }

  private var display = DetailOriginalProgress.Display.hidden
  private var lineRect = CGRect.zero
  private var fraction: Double = 0

  var fillWidth: CGFloat { fill.frame.width }
  var amountText: String? { amountLabel.text }
  var lineFrame: CGRect { track.frame }
  var isLineHidden: Bool { track.isHidden }

  override init(frame: CGRect) {
    super.init(frame: frame)
    alpha = 0
    track.backgroundColor = AFColor.textPrimary.withAlphaComponent(0.12)
    track.clipsToBounds = true
    fill.backgroundColor = accent
    segment.backgroundColor = accent
    segment.isHidden = true
    track.addSubview(fill)
    track.addSubview(segment)
    titleLabel.translatesAutoresizingMaskIntoConstraints = true
    amountLabel.translatesAutoresizingMaskIntoConstraints = true
    titleLabel.attributedText = NSAttributedString(string: "▸ " + String(localized: "ORIGINAL"), attributes: [.kern: 0.6])
    amountLabel.textAlignment = .right
    retryButton.isHidden = true
    [track, titleLabel, amountLabel, retryButton].forEach(addSubview)
    isAccessibilityElement = false
    titleLabel.accessibilityLabel = String(localized: "Loading original")
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
    guard alpha > 0.01, !retryButton.isHidden else { return nil }
    let local = convert(point, to: retryButton)
    return retryButton.point(inside: local, with: event) ? retryButton : nil
  }

  func place(image: CGRect, floor: CGFloat) {
    let y = DetailOriginalProgress.lineY(image: image, floor: floor)
    lineRect = CGRect(x: image.minX, y: y, width: image.width, height: 2)
    track.frame = lineRect
    let inset: CGFloat = image.width >= bounds.width - 1 ? 16 : 0
    let readoutWidth = (image.width - inset * 2) / 2
    titleLabel.frame = CGRect(x: image.minX + inset, y: y + 10, width: readoutWidth, height: 14)
    amountLabel.frame = CGRect(x: image.minX + inset + readoutWidth, y: y + 10, width: readoutWidth, height: 14)
    retryButton.sizeToFit()
    let size = CGSize(width: retryButton.bounds.width, height: 36)
    retryButton.frame = CGRect(x: image.midX - size.width / 2, y: y - 16 - size.height, width: size.width, height: size.height)
    layoutFill()
    layoutSegment()
  }

  func apply(_ next: DetailOriginalProgress.Display, animated: Bool) {
    let previous = display
    display = next
    switch next {
    case .hidden:
      stopSweep()
      fade(to: 0, animated: animated && previous != .hidden)
    case .loading(let value, let readout):
      setLine(hidden: false)
      retryButton.isHidden = true
      amountLabel.text = readout
      fraction = value ?? 0
      fill.isHidden = value == nil
      if value == nil { startSweep() } else { stopSweep() }
      animated ? UIView.animate(withDuration: 0.2, delay: 0, options: [.curveLinear, .beginFromCurrentState]) { self.layoutFill() } : layoutFill()
      fade(to: 1, animated: animated && previous == .hidden)
    case .complete:
      stopSweep()
      fill.isHidden = false
      fraction = 1
      let finish = { self.fade(to: 0, animated: animated) }
      if animated {
        UIView.animate(withDuration: 0.2, delay: 0, options: [.curveEaseOut, .beginFromCurrentState]) { self.layoutFill() } completion: { _ in finish() }
      } else {
        layoutFill()
        finish()
      }
    case .failed:
      stopSweep()
      setLine(hidden: true)
      retryButton.isHidden = false
      fade(to: 1, animated: animated)
      UIAccessibility.post(notification: .layoutChanged, argument: retryButton)
    }
  }

  private func setLine(hidden: Bool) {
    [track, titleLabel, amountLabel].forEach { $0.isHidden = hidden }
  }

  private func fade(to alpha: CGFloat, animated: Bool) {
    guard animated else {
      self.alpha = alpha
      return
    }
    UIView.animate(withDuration: alpha > 0 ? 0.2 : 0.3, delay: 0, options: [.allowUserInteraction, .beginFromCurrentState]) {
      self.alpha = alpha
    }
  }

  private func layoutFill() {
    fill.frame = CGRect(x: 0, y: 0, width: lineRect.width * CGFloat(fraction), height: 2)
  }

  private func layoutSegment() {
    segment.frame = CGRect(x: -lineRect.width * 0.24, y: 0, width: lineRect.width * 0.24, height: 2)
  }

  private func startSweep() {
    guard !AFMotion.reduceMotion else {
      segment.isHidden = true
      return
    }
    segment.isHidden = false
    guard segment.layer.animation(forKey: "sweep") == nil else { return }
    let sweep = CABasicAnimation(keyPath: "position.x")
    sweep.fromValue = -lineRect.width * 0.12
    sweep.toValue = lineRect.width * 1.12
    sweep.duration = 1.4
    sweep.timingFunction = CAMediaTimingFunction(controlPoints: 0.45, 0, 0.55, 1)
    sweep.repeatCount = .infinity
    segment.layer.add(sweep, forKey: "sweep")
  }

  private func stopSweep() {
    segment.layer.removeAnimation(forKey: "sweep")
    segment.isHidden = true
  }
}
