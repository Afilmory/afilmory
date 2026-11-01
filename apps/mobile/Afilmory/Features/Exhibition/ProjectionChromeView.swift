import UIKit

final class ProjectionChromeView: UIView {
  var onClose: (() -> Void)?
  var onStep: ((Int) -> Void)?
  var stageBottom: CGFloat = 0 {
    didSet { setNeedsLayout() }
  }

  private lazy var closeButton = AFGlassButton.symbol("xmark", accessibilityLabel: String(localized: "Exit projection")) { [weak self] in
    self?.onClose?()
  }
  private let modeLabel = AFLabel.mono(size: 11)
  private let track = UIView()
  private let fill = UIView()
  private let markerLabel = AFLabel.mono(size: 11)
  private let dateLabel = AFLabel.mono(size: 11)
  private let cameraLabel = AFLabel.mono(size: 11)
  private let exifLabel = AFLabel.mono(size: 11)
  private let numberLabel = AFLabel.exhibit(size: 44)
  private let totalLabel = AFLabel.mono(size: 11)
  private lazy var previousButton = makeStepButton("chevron.left", label: String(localized: "Previous frame"), delta: -1)
  private lazy var nextButton = makeStepButton("chevron.right", label: String(localized: "Next frame"), delta: 1)
  private var accent = AFColor.accentFallback

  override init(frame: CGRect) {
    super.init(frame: frame)
    modeLabel.attributedText = NSAttributedString(
      string: String(localized: "PROJECT · AUTO 3.6 S"), attributes: [.kern: 1.5]
    )
    track.backgroundColor = AFColor.divider
    track.clipsToBounds = true
    fill.layer.anchorPoint = CGPoint(x: 0, y: 0.5)
    track.addSubview(fill)
    numberLabel.attributedText = NSAttributedString(string: "01", attributes: [.kern: -0.9])
    [closeButton, modeLabel, track, markerLabel, dateLabel, cameraLabel, exifLabel, numberLabel, totalLabel, previousButton, nextButton]
      .forEach { view in
        view.translatesAutoresizingMaskIntoConstraints = true
        addSubview(view)
      }
    track.isAccessibilityElement = false
    accessibilityElements = [closeButton, numberLabel, dateLabel, cameraLabel, exifLabel, previousButton, nextButton]
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
    let hit = super.hitTest(point, with: event)
    return hit === self ? nil : hit
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    let top = max(safeAreaInsets.top, 20)
    closeButton.frame = CGRect(x: 12, y: top + 10, width: 44, height: 44)
    let modeSize = modeLabel.sizeThatFits(bounds.size)
    modeLabel.frame = CGRect(x: bounds.width - 20 - modeSize.width, y: top + 32 - modeSize.height / 2, width: modeSize.width, height: modeSize.height)
    let base = stageBottom + 16
    track.frame = CGRect(x: 20, y: base, width: bounds.width - 40, height: 2)
    fill.bounds = CGRect(x: 0, y: 0, width: track.bounds.width, height: 2)
    fill.layer.position = CGPoint(x: 0, y: 1)
    var x: CGFloat = 20
    for label in [markerLabel, dateLabel, cameraLabel] {
      let size = label.sizeThatFits(bounds.size)
      label.frame = CGRect(x: x, y: base + 16, width: min(size.width, bounds.width - 20 - x), height: size.height)
      x = label.frame.maxX + 14
    }
    exifLabel.frame = CGRect(x: 20, y: markerLabel.frame.maxY + 4, width: bounds.width - 40, height: exifLabel.font.lineHeight)
    let numberSize = numberLabel.sizeThatFits(bounds.size)
    numberLabel.frame = CGRect(x: 20, y: exifLabel.frame.maxY + 22, width: numberSize.width, height: numberSize.height)
    let totalSize = totalLabel.sizeThatFits(bounds.size)
    totalLabel.frame = CGRect(x: numberLabel.frame.maxX + 8, y: numberLabel.frame.maxY - totalSize.height - 6, width: totalSize.width, height: totalSize.height)
    nextButton.frame = CGRect(x: bounds.width - 12 - 44, y: numberLabel.frame.midY - 22, width: 44, height: 44)
    previousButton.frame = nextButton.frame.offsetBy(dx: -48, dy: 0)
  }

  func configure(photo: GalleryPhoto, number: Int, total: Int, accent: UIColor, animated: Bool) {
    let stamp = ExhibitFormat.localDateTime(for: photo)
    markerLabel.text = "▸ \(ExhibitFormat.frameNumber(number))"
    dateLabel.text = stamp?.date
    cameraLabel.text = ExhibitFormat.camera(for: photo)
    exifLabel.text = ExhibitFormat.exifLine(for: photo)
    numberLabel.attributedText = NSAttributedString(string: ExhibitFormat.frameNumber(number), attributes: [.kern: -0.9])
    numberLabel.accessibilityLabel = String(localized: "Frame \(number) of \(total)")
    totalLabel.text = "/ \(ExhibitFormat.frameNumber(total))"
    totalLabel.isAccessibilityElement = false
    setAccent(accent)
    if animated, !AFMotion.reduceMotion {
      AFMotion.afLock(label: numberLabel, haptic: false)
    }
    setNeedsLayout()
  }

  func setAccent(_ color: UIColor) {
    accent = color
    UIView.animate(withDuration: 0.6) {
      self.markerLabel.textColor = color
      self.fill.backgroundColor = color
    }
  }

  func setProgress(_ progress: Double) {
    fill.transform = CGAffineTransform(scaleX: max(0.0001, CGFloat(progress)), y: 1)
  }

  private func makeStepButton(_ symbol: String, label: String, delta: Int) -> UIButton {
    let button = UIButton(type: .system, primaryAction: UIAction { [weak self] _ in self?.onStep?(delta) })
    button.setImage(UIImage(systemName: symbol, withConfiguration: UIImage.SymbolConfiguration(pointSize: 20, weight: .regular)), for: .normal)
    button.tintColor = AFColor.textPrimary
    button.accessibilityLabel = label
    return button
  }
}
