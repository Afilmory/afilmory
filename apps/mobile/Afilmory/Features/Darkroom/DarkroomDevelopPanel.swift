import UIKit

final class DarkroomDevelopPanel: UIView {
  private let titleLabel = AFLabel.exhibit(nil, size: 22)
  private let metaLabel = AFLabel.mono(nil, size: 11)
  private let grid = UIStackView()
  private let track = UIView()
  private let bar = UIView()
  private var progress: CGFloat = 0
  private let buttons = UIStackView()
  private let secondaryButton = DarkroomPillButton(style: .outline)
  private let primaryButton = DarkroomPillButton(style: .filled)
  private var tiles: [DarkroomDevelopTile] = []

  var onRetry: ((String) -> Void)?
  var onSecondary: (() -> Void)?
  var onPrimary: (() -> Void)?

  override init(frame: CGRect) {
    super.init(frame: frame)
    titleLabel.font = AFFont.exhibit(size: 22, relativeTo: .title2)
    titleLabel.numberOfLines = 0
    metaLabel.font = UIFontMetrics(forTextStyle: .caption1).scaledFont(for: AFFont.mono(size: 11))
    metaLabel.textAlignment = .right
    metaLabel.setContentCompressionResistancePriority(.required, for: .horizontal)
    let header = UIStackView(arrangedSubviews: [titleLabel, metaLabel])
    header.alignment = .firstBaseline
    header.spacing = 8
    grid.axis = .vertical
    grid.spacing = 10
    track.backgroundColor = AFColor.divider
    track.clipsToBounds = true
    bar.backgroundColor = AFColor.accentFallback
    track.addSubview(bar)
    buttons.axis = .horizontal
    buttons.spacing = 10
    buttons.distribution = .fillEqually
    buttons.addArrangedSubview(secondaryButton)
    buttons.addArrangedSubview(primaryButton)
    secondaryButton.addAction(UIAction { [weak self] _ in self?.onSecondary?() }, for: .primaryActionTriggered)
    primaryButton.addAction(UIAction { [weak self] _ in self?.onPrimary?() }, for: .primaryActionTriggered)
    let stack = UIStackView(arrangedSubviews: [header, grid, track, buttons])
    stack.axis = .vertical
    stack.spacing = 16
    stack.translatesAutoresizingMaskIntoConstraints = false
    addSubview(stack)
    NSLayoutConstraint.activate([
      stack.topAnchor.constraint(equalTo: topAnchor, constant: 22),
      stack.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 20),
      stack.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -20),
      stack.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -22),
      track.heightAnchor.constraint(equalToConstant: 2),
    ])
    track.isAccessibilityElement = true
    track.accessibilityTraits = .updatesFrequently
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  var accent: UIColor = AFColor.accentFallback {
    didSet {
      UIView.animate(withDuration: 0.6) { self.bar.backgroundColor = self.accent }
    }
  }

  func apply(stage: DarkroomStage, jobs: [UploadJobState], animated: Bool) {
    titleLabel.text = stage.title
    metaLabel.text = stage.meta
    track.accessibilityLabel = String(localized: "Development progress")
    track.accessibilityValue = "\(stage.percent)%"
    rebuildTilesIfNeeded(count: jobs.count)
    for (index, job) in jobs.enumerated() {
      tiles[index].apply(job: job, index: index)
    }
    configureButtons(for: stage.phase)
    progress = CGFloat(min(1, max(0, stage.progress)))
    UIView.animate(withDuration: animated ? 0.26 : 0, delay: 0, options: [.curveLinear, .allowUserInteraction, .beginFromCurrentState]) {
      self.layoutBar()
    }
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    layoutBar()
  }

  private func layoutBar() {
    bar.frame = CGRect(x: 0, y: 0, width: track.bounds.width * progress, height: track.bounds.height)
  }

  private func configureButtons(for phase: DarkroomPhase) {
    switch phase {
    case .done:
      buttons.isHidden = false
      secondaryButton.setTitle(String(localized: "See exhibition"))
      primaryButton.setTitle(String(localized: "Keep uploading"))
    case .stalled:
      buttons.isHidden = false
      secondaryButton.setTitle(String(localized: "Discard failed"))
      primaryButton.setTitle(String(localized: "Retry all"))
    case .developing, .idle, .selecting, .reviewing:
      buttons.isHidden = true
    }
  }

  private func rebuildTilesIfNeeded(count: Int) {
    guard tiles.count != count else { return }
    while tiles.count < count {
      let tile = DarkroomDevelopTile()
      tile.onRetry = { [weak self] id in self?.onRetry?(id) }
      tiles.append(tile)
    }
    if tiles.count > count {
      tiles.removeLast(tiles.count - count)
    }
    grid.arrangedSubviews.forEach { $0.removeFromSuperview() }
    let columns = 4
    for start in stride(from: 0, to: tiles.count, by: columns) {
      let row = UIStackView()
      row.axis = .horizontal
      row.spacing = 10
      row.distribution = .fillEqually
      row.alignment = .top
      for column in 0..<columns {
        let index = start + column
        row.addArrangedSubview(index < tiles.count ? tiles[index] : UIView())
      }
      grid.addArrangedSubview(row)
    }
  }
}

final class DarkroomPillButton: UIButton {
  enum Style {
    case filled
    case outline
  }

  private let style: Style
  private let height: CGFloat

  init(style: Style, height: CGFloat = 48) {
    self.style = style
    self.height = height
    super.init(frame: .zero)
    var configuration: UIButton.Configuration = style == .filled ? .filled() : .plain()
    configuration.cornerStyle = .capsule
    configuration.baseBackgroundColor = AFColor.textPrimary
    configuration.baseForegroundColor = style == .filled ? AFColor.onLight : AFColor.textPrimary
    configuration.contentInsets = NSDirectionalEdgeInsets(top: 12, leading: 14, bottom: 12, trailing: 14)
    configuration.titleLineBreakMode = .byTruncatingTail
    self.configuration = configuration
    if style == .outline {
      layer.borderWidth = 1
      layer.borderColor = AFColor.tick.cgColor
      layer.cornerRadius = height / 2
    }
    heightAnchor.constraint(greaterThanOrEqualToConstant: height).isActive = true
    configurationUpdateHandler = { button in
      button.alpha = button.isEnabled ? (button.isHighlighted ? 0.75 : 1) : 0.4
    }
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  func setTitle(_ title: String, size: CGFloat = 15) {
    let weight: UIFont.Weight = style == .filled ? .semibold : .regular
    configuration?.attributedTitle = AttributedString(
      title,
      attributes: AttributeContainer([.font: AFFont.ui(size: size, weight: weight, relativeTo: .body)])
    )
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    if style == .outline { layer.cornerRadius = bounds.height / 2 }
  }
}
