import UIKit

final class UploadFabView: UIView {
  private let glass = UIVisualEffectView(effect: AdaptiveGlass.effect())
  private let trackLayer = CAShapeLayer()
  private let ringLayer = CAShapeLayer()
  private let countLabel = UILabel()
  private let symbolView = UIImageView()
  private var observerToken: UUID?

  override init(frame: CGRect) {
    super.init(frame: frame)

    isAccessibilityElement = true
    accessibilityTraits = .button
    accessibilityLabel = String(localized: "Uploads")

    glass.clipsToBounds = true
    addSubview(glass)

    countLabel.font = .monospacedDigitSystemFont(ofSize: 13, weight: .bold)
    countLabel.textColor = .label
    countLabel.textAlignment = .center
    countLabel.adjustsFontSizeToFitWidth = true
    countLabel.minimumScaleFactor = 0.7
    glass.contentView.addSubview(countLabel)

    symbolView.contentMode = .center
    symbolView.preferredSymbolConfiguration = UIImage.SymbolConfiguration(pointSize: 18, weight: .semibold)
    glass.contentView.addSubview(symbolView)

    trackLayer.fillColor = nil
    trackLayer.strokeColor = UIColor.systemFill.cgColor
    trackLayer.lineWidth = 3
    layer.addSublayer(trackLayer)

    ringLayer.fillColor = nil
    ringLayer.strokeColor = UIColor.tintColor.cgColor
    ringLayer.lineWidth = 3
    ringLayer.lineCap = .round
    ringLayer.strokeEnd = 0
    layer.addSublayer(ringLayer)

    addGestureRecognizer(UITapGestureRecognizer(target: self, action: #selector(handleTap)))

    observerToken = UploadCenter.shared.observe { [weak self] jobs in
      self?.update(with: jobs)
    }
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) is not supported")
  }

  deinit {
    if let observerToken {
      UploadCenter.shared.unobserve(observerToken)
    }
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    glass.frame = bounds
    glass.layer.cornerRadius = min(bounds.width, bounds.height) / 2
    countLabel.frame = glass.contentView.bounds
    symbolView.frame = glass.contentView.bounds

    let inset: CGFloat = 1.5
    let ringPath = UIBezierPath(
      arcCenter: CGPoint(x: bounds.midX, y: bounds.midY),
      radius: min(bounds.width, bounds.height) / 2 - inset,
      startAngle: -.pi / 2,
      endAngle: .pi * 1.5,
      clockwise: true
    )
    trackLayer.path = ringPath.cgPath
    ringLayer.path = ringPath.cgPath
  }

  private func update(with jobs: [UploadJobState]) {
    let summary = UploadQueueSummary(jobs: jobs)

    CATransaction.begin()
    CATransaction.setAnimationDuration(0.2)
    if summary.failed > 0, !summary.running {
      ringLayer.strokeColor = UIColor.systemRed.cgColor
      ringLayer.strokeEnd = 1
      showSymbol("exclamationmark", tint: .systemRed)
      accessibilityValue = String(localized: "\(summary.failed) failed")
    } else if summary.running {
      ringLayer.strokeColor = UIColor.tintColor.cgColor
      ringLayer.strokeEnd = max(0.02, summary.progress)
      showCount(done: summary.done, total: summary.total)
      accessibilityValue = String(localized: "Uploaded \(summary.done) of \(summary.total)")
    } else {
      ringLayer.strokeColor = UIColor.systemGreen.cgColor
      ringLayer.strokeEnd = 1
      showSymbol("checkmark", tint: .systemGreen)
      accessibilityValue = String(localized: "Uploaded \(summary.done) of \(summary.total)")
    }
    CATransaction.commit()
  }

  private func showCount(done: Int, total: Int) {
    countLabel.text = "\(done)/\(total)"
    countLabel.isHidden = false
    symbolView.isHidden = true
  }

  private func showSymbol(_ name: String, tint: UIColor) {
    symbolView.image = UIImage(systemName: name)
    symbolView.tintColor = tint
    symbolView.isHidden = false
    countLabel.isHidden = true
  }

  @objc private func handleTap() {
    guard let presenter = nearestViewController else { return }
    UploadQueuePresenter.present(from: presenter)
  }
}
