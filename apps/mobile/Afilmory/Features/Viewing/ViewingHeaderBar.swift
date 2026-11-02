import UIKit

final class ViewingHeaderBar: UIView {
  static let contentHeight: CGFloat = 44

  var onSelect: ((ViewingPage) -> Void)?
  var accent: UIColor = AFColor.accentFallback {
    didSet {
      guard accent != oldValue else { return }
      UIView.animate(withDuration: 0.4, delay: 0, options: [.allowUserInteraction, .beginFromCurrentState]) {
        self.segments.forEach { $0.underline.backgroundColor = self.accent }
      }
    }
  }

  private let blur = UIVisualEffectView(effect: UIBlurEffect(style: .dark))
  private let tint = UIView()
  private let hairline = UIView()
  private let titleLabel = AFLabel.exhibit(String(localized: "Viewing"), size: 24)
  private let row = UIStackView()
  private let segmentStack = UIStackView()
  private var segments: [Segment] = []
  private var selected = 0

  final class Segment: UIControl {
    let label = UILabel()
    let underline = UIView()

    init(title: String) {
      super.init(frame: .zero)
      label.text = title
      label.font = UIFontMetrics(forTextStyle: .subheadline).scaledFont(for: AFFont.ui(size: 15), maximumPointSize: 19)
      label.adjustsFontForContentSizeCategory = true
      label.textColor = AFColor.textTertiary
      label.translatesAutoresizingMaskIntoConstraints = false
      label.setContentHuggingPriority(.required, for: .horizontal)
      label.setContentCompressionResistancePriority(.required, for: .horizontal)
      underline.translatesAutoresizingMaskIntoConstraints = false
      underline.layer.cornerRadius = 1
      underline.backgroundColor = AFColor.accentFallback
      underline.isUserInteractionEnabled = false
      label.isUserInteractionEnabled = false
      addSubview(label)
      addSubview(underline)
      NSLayoutConstraint.activate([
        heightAnchor.constraint(greaterThanOrEqualToConstant: 44),
        label.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 10),
        label.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -10),
        label.centerYAnchor.constraint(equalTo: centerYAnchor),
        underline.leadingAnchor.constraint(equalTo: label.leadingAnchor),
        underline.trailingAnchor.constraint(equalTo: label.trailingAnchor),
        underline.heightAnchor.constraint(equalToConstant: 2),
        underline.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -6),
      ])
      isAccessibilityElement = true
      accessibilityLabel = title
      accessibilityTraits = .button
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
      fatalError("init(coder:) has not been implemented")
    }
  }

  init(pages: [ViewingPage], trailing: UIView? = nil) {
    super.init(frame: .zero)
    tint.backgroundColor = AFColor.ground.withAlphaComponent(0.72)
    hairline.backgroundColor = AFColor.hairline
    for view in [blur, tint, hairline] {
      view.translatesAutoresizingMaskIntoConstraints = false
      view.isUserInteractionEnabled = false
      addSubview(view)
    }
    titleLabel.accessibilityTraits = .header
    titleLabel.adjustsFontSizeToFitWidth = true
    titleLabel.minimumScaleFactor = 0.7
    titleLabel.setContentHuggingPriority(UILayoutPriority(1), for: .horizontal)
    titleLabel.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
    segmentStack.spacing = 4
    segmentStack.setContentHuggingPriority(.required, for: .horizontal)
    segmentStack.setContentCompressionResistancePriority(.required, for: .horizontal)
    segmentStack.accessibilityTraits = .tabBar
    segmentStack.accessibilityContainerType = .semanticGroup
    for page in pages {
      let segment = Segment(title: page.title)
      segment.addAction(UIAction { [weak self] _ in self?.onSelect?(page) }, for: .touchUpInside)
      segments.append(segment)
      segmentStack.addArrangedSubview(segment)
    }
    row.axis = .horizontal
    row.alignment = .center
    row.spacing = 12
    row.translatesAutoresizingMaskIntoConstraints = false
    row.addArrangedSubview(titleLabel)
    if pages.count > 1 { row.addArrangedSubview(segmentStack) }
    if let trailing { row.addArrangedSubview(trailing) }
    addSubview(row)
    NSLayoutConstraint.activate([
      blur.topAnchor.constraint(equalTo: topAnchor),
      blur.leadingAnchor.constraint(equalTo: leadingAnchor),
      blur.trailingAnchor.constraint(equalTo: trailingAnchor),
      blur.bottomAnchor.constraint(equalTo: bottomAnchor),
      tint.topAnchor.constraint(equalTo: topAnchor),
      tint.leadingAnchor.constraint(equalTo: leadingAnchor),
      tint.trailingAnchor.constraint(equalTo: trailingAnchor),
      tint.bottomAnchor.constraint(equalTo: bottomAnchor),
      hairline.leadingAnchor.constraint(equalTo: leadingAnchor),
      hairline.trailingAnchor.constraint(equalTo: trailingAnchor),
      hairline.bottomAnchor.constraint(equalTo: bottomAnchor),
      hairline.heightAnchor.constraint(equalToConstant: 0.5),
      row.leadingAnchor.constraint(equalTo: safeAreaLayoutGuide.leadingAnchor, constant: 20),
      row.trailingAnchor.constraint(equalTo: safeAreaLayoutGuide.trailingAnchor, constant: -12),
      row.bottomAnchor.constraint(equalTo: bottomAnchor),
      row.heightAnchor.constraint(greaterThanOrEqualToConstant: Self.contentHeight),
      row.topAnchor.constraint(equalTo: safeAreaLayoutGuide.topAnchor),
    ])
    applyTransparency()
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(applyTransparency),
      name: UIAccessibility.reduceTransparencyStatusDidChangeNotification,
      object: nil
    )
    setProgress(0)
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  func setProgress(_ progress: CGFloat) {
    for (index, segment) in segments.enumerated() {
      let scale = ViewingSegmentProgress.underlineScale(progress: progress, index: index)
      segment.underline.transform = CGAffineTransform(scaleX: max(scale, 0.001), y: 1)
      segment.underline.alpha = scale > 0.001 ? 1 : 0
    }
    let index = ViewingSegmentProgress.selectedIndex(progress: progress)
    guard index != selected || segments.first?.accessibilityTraits.contains(.selected) == false else { return }
    selected = index
    for (offset, segment) in segments.enumerated() {
      let isSelected = offset == index
      UIView.transition(with: segment.label, duration: 0.24, options: [.transitionCrossDissolve, .allowUserInteraction]) {
        segment.label.textColor = isSelected ? AFColor.textPrimary : AFColor.textTertiary
      }
      segment.accessibilityTraits = isSelected ? [.button, .selected] : .button
    }
  }

  func lock(_ page: ViewingPage) {
    guard segments.indices.contains(page.rawValue) else { return }
    AFMotion.afLock(label: segments[page.rawValue].label, haptic: false)
  }

  @objc private func applyTransparency() {
    let reduce = UIAccessibility.isReduceTransparencyEnabled
    blur.isHidden = reduce
    tint.backgroundColor = AFColor.ground.withAlphaComponent(reduce ? 1 : 0.72)
  }
}
