import CoreImage
import UIKit

enum DarkroomNegative {
  private static let context = CIContext(options: [.cacheIntermediates: false])

  static func load(previewAt url: URL, blur: Bool) async -> (positive: UIImage, negative: UIImage)? {
    await Task.detached(priority: .utility) {
      guard let data = try? Data(contentsOf: url), let image = UIImage(data: data) else { return nil }
      let positive = image.preparingForDisplay() ?? image
      guard let negative = render(image, blur: blur) else { return (positive, positive) }
      return (positive, negative)
    }.value
  }

  static func render(_ image: UIImage, blur: Bool) -> UIImage? {
    guard let cgImage = image.cgImage else { return nil }
    let input = CIImage(cgImage: cgImage)
    let state = AFMotion.developState(progress: 0)
    var output = input
      .applyingFilter("CIColorControls", parameters: [
        kCIInputSaturationKey: 1 - state.grayscale,
        kCIInputContrastKey: 1.3,
      ])
      .applyingFilter("CIColorInvert")
    if blur {
      let scale = CGFloat(cgImage.width) / 96
      output = output.clampedToExtent()
        .applyingGaussianBlur(sigma: Double(state.blur * max(1, scale)))
        .cropped(to: input.extent)
    }
    guard let rendered = context.createCGImage(output, from: input.extent) else { return nil }
    return UIImage(cgImage: rendered, scale: image.scale, orientation: image.imageOrientation)
  }
}

final class DarkroomDevelopTile: UIView {
  private let frameView = UIView()
  private let positive = UIImageView()
  private let negative = UIImageView()
  private let check = UIView()
  private let retry = UIButton(type: .system)
  private let label = AFLabel.mono(nil, size: 10)
  private(set) var jobID: String?
  private var state: DarkroomTileState?
  private var loadedPreview = false
  private var loadTask: Task<Void, Never>?

  var onRetry: ((String) -> Void)?

  override init(frame: CGRect) {
    super.init(frame: frame)
    frameView.backgroundColor = AFColor.ground
    frameView.layer.cornerRadius = AFRadius.mosaic
    frameView.layer.cornerCurve = .continuous
    frameView.clipsToBounds = true
    for view in [positive, negative] {
      view.contentMode = .scaleAspectFill
      view.clipsToBounds = true
      view.translatesAutoresizingMaskIntoConstraints = false
      frameView.addSubview(view)
    }
    configureCheck()
    configureRetry()
    let stack = UIStackView(arrangedSubviews: [frameView, label])
    stack.axis = .vertical
    stack.spacing = 6
    stack.translatesAutoresizingMaskIntoConstraints = false
    addSubview(stack)
    NSLayoutConstraint.activate([
      stack.topAnchor.constraint(equalTo: topAnchor),
      stack.leadingAnchor.constraint(equalTo: leadingAnchor),
      stack.trailingAnchor.constraint(equalTo: trailingAnchor),
      stack.bottomAnchor.constraint(equalTo: bottomAnchor),
      frameView.heightAnchor.constraint(equalTo: frameView.widthAnchor),
      positive.topAnchor.constraint(equalTo: frameView.topAnchor),
      positive.leadingAnchor.constraint(equalTo: frameView.leadingAnchor),
      positive.trailingAnchor.constraint(equalTo: frameView.trailingAnchor),
      positive.bottomAnchor.constraint(equalTo: frameView.bottomAnchor),
      negative.topAnchor.constraint(equalTo: frameView.topAnchor),
      negative.leadingAnchor.constraint(equalTo: frameView.leadingAnchor),
      negative.trailingAnchor.constraint(equalTo: frameView.trailingAnchor),
      negative.bottomAnchor.constraint(equalTo: frameView.bottomAnchor),
    ])
    label.adjustsFontSizeToFitWidth = true
    label.minimumScaleFactor = 0.7
    isAccessibilityElement = true
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  private func configureCheck() {
    check.backgroundColor = AFColor.textPrimary
    check.layer.cornerRadius = 11
    check.translatesAutoresizingMaskIntoConstraints = false
    let mark = UIImageView(image: UIImage(systemName: "checkmark", withConfiguration: UIImage.SymbolConfiguration(pointSize: 11, weight: .bold)))
    mark.tintColor = AFColor.onLight
    mark.translatesAutoresizingMaskIntoConstraints = false
    check.addSubview(mark)
    frameView.addSubview(check)
    check.alpha = 0
    NSLayoutConstraint.activate([
      check.widthAnchor.constraint(equalToConstant: 22),
      check.heightAnchor.constraint(equalToConstant: 22),
      check.trailingAnchor.constraint(equalTo: frameView.trailingAnchor, constant: -6),
      check.bottomAnchor.constraint(equalTo: frameView.bottomAnchor, constant: -6),
      mark.centerXAnchor.constraint(equalTo: check.centerXAnchor),
      mark.centerYAnchor.constraint(equalTo: check.centerYAnchor),
    ])
  }

  private func configureRetry() {
    var configuration = UIButton.Configuration.filled()
    configuration.image = UIImage(systemName: "arrow.clockwise", withConfiguration: UIImage.SymbolConfiguration(pointSize: 13, weight: .semibold))
    configuration.baseBackgroundColor = AFColor.ground.withAlphaComponent(0.7)
    configuration.baseForegroundColor = AFColor.textPrimary
    configuration.cornerStyle = .capsule
    retry.configuration = configuration
    retry.accessibilityLabel = String(localized: "Retry")
    retry.translatesAutoresizingMaskIntoConstraints = false
    retry.isHidden = true
    retry.addAction(UIAction { [weak self] _ in
      guard let self, let jobID = self.jobID else { return }
      self.onRetry?(jobID)
    }, for: .primaryActionTriggered)
    frameView.addSubview(retry)
    NSLayoutConstraint.activate([
      retry.centerXAnchor.constraint(equalTo: frameView.centerXAnchor),
      retry.centerYAnchor.constraint(equalTo: frameView.centerYAnchor),
      retry.widthAnchor.constraint(equalToConstant: 44),
      retry.heightAnchor.constraint(equalToConstant: 44),
    ])
  }

  func apply(job: UploadJobState, index: Int) {
    if jobID != job.id {
      jobID = job.id
      state = nil
      loadedPreview = false
      loadTask?.cancel()
      positive.image = nil
      negative.image = nil
      check.alpha = 0
    }
    loadPreviewIfNeeded()
    let next = DarkroomTileState(job: job, index: index)
    let previous = state
    state = next
    label.text = next.label
    label.textColor = next.kind == .failed ? AFColor.destructive : AFColor.textTertiary
    accessibilityLabel = next.label
    retry.isHidden = next.kind != .failed
    accessibilityElementsHidden = false
    isAccessibilityElement = next.kind != .failed
    let animated = previous != nil && window != nil
    UIView.animate(withDuration: animated ? 0.26 : 0, delay: 0, options: [.curveLinear, .allowUserInteraction, .beginFromCurrentState]) {
      self.negative.alpha = next.negativeAlpha
      self.frameView.alpha = next.alpha
    }
    if next.kind == .developed, previous?.kind != .developed {
      if animated {
        check.alpha = 1
        AFMotion.afLock(label: frameView, dot: check, haptic: false)
      } else {
        check.alpha = 1
      }
    } else if next.kind != .developed {
      check.alpha = 0
    }
  }

  private func loadPreviewIfNeeded() {
    guard !loadedPreview, let jobID else { return }
    let url = UploadCenter.previewURL(jobID)
    guard FileManager.default.fileExists(atPath: url.path) else { return }
    loadedPreview = true
    let blur = !AFMotion.reduceMotion
    loadTask = Task { [weak self] in
      guard let images = await DarkroomNegative.load(previewAt: url, blur: blur), !Task.isCancelled else { return }
      guard let self, self.jobID == jobID else { return }
      UIView.transition(with: self.frameView, duration: 0.2, options: [.transitionCrossDissolve, .allowUserInteraction]) {
        self.positive.image = images.positive
        self.negative.image = images.negative
      }
    }
  }
}
