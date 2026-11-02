import MapKit
import UIKit

@MainActor
enum DetailSectionViews {
  static func caption(_ text: String) -> UILabel {
    let label = AFLabel.mono(size: 10)
    label.attributedText = NSAttributedString(string: text.uppercased(), attributes: [.kern: 1])
    label.accessibilityLabel = text
    label.accessibilityTraits = .header
    return label
  }

  static func section(_ title: String, trailing: UIView? = nil, body: UIView) -> UIView {
    let head = UIStackView(arrangedSubviews: [caption(title)] + (trailing.map { [UIView(), $0] } ?? []))
    head.axis = .horizontal
    head.alignment = .firstBaseline
    let stack = UIStackView(arrangedSubviews: [head, body])
    stack.axis = .vertical
    stack.spacing = 10
    return stack
  }

  static func grid(_ rows: [PhotoInfoRow], columns: Int = 2) -> UIView {
    let outer = UIStackView()
    outer.axis = .vertical
    outer.spacing = 12
    stride(from: 0, to: rows.count, by: columns).forEach { start in
      let line = UIStackView()
      line.axis = .horizontal
      line.distribution = .fillEqually
      line.spacing = 20
      line.alignment = .top
      for index in start..<start + columns {
        guard rows.indices.contains(index) else {
          line.addArrangedSubview(UIView())
          continue
        }
        let label = AFLabel.ui(rows[index].label, size: 12, color: AFColor.textTertiary)
        label.numberOfLines = 0
        let value = AFLabel.ui(rows[index].value, size: 14, color: AFColor.textPrimary)
        value.font = AFFont.ui(size: 14, relativeTo: .subheadline)
        value.numberOfLines = 0
        let cell = UIStackView(arrangedSubviews: [label, value])
        cell.axis = .vertical
        cell.spacing = 3
        cell.isAccessibilityElement = true
        cell.accessibilityLabel = "\(rows[index].label), \(rows[index].value)"
        line.addArrangedSubview(cell)
      }
      outer.addArrangedSubview(line)
    }
    return outer
  }

  static func chips(_ values: [String]) -> UIView {
    let flow = DetailChipFlowView()
    flow.chips = values
    return flow
  }

  static func tone(_ values: [DetailToneValue], accent: UIColor, bars: inout [UIView]) -> UIView {
    let row = UIStackView()
    row.axis = .horizontal
    row.distribution = .fillEqually
    row.spacing = 12
    for value in values {
      let number = AFLabel.exhibit(value.display, size: 22)
      let track = UIView()
      track.backgroundColor = AFColor.divider
      track.translatesAutoresizingMaskIntoConstraints = false
      track.heightAnchor.constraint(equalToConstant: 3).isActive = true
      let fill = UIView()
      fill.backgroundColor = accent
      fill.translatesAutoresizingMaskIntoConstraints = false
      track.addSubview(fill)
      NSLayoutConstraint.activate([
        fill.leadingAnchor.constraint(equalTo: track.leadingAnchor),
        fill.topAnchor.constraint(equalTo: track.topAnchor),
        fill.bottomAnchor.constraint(equalTo: track.bottomAnchor),
        fill.widthAnchor.constraint(equalTo: track.widthAnchor, multiplier: max(0.001, CGFloat(value.percent) / 100)),
      ])
      bars.append(fill)
      let label = AFLabel.ui(value.label, size: 11, color: AFColor.textTertiary)
      label.numberOfLines = 2
      let column = UIStackView(arrangedSubviews: [number, track, label])
      column.axis = .vertical
      column.spacing = 6
      column.isAccessibilityElement = true
      column.accessibilityLabel = "\(value.label), \(value.display)"
      row.addArrangedSubview(column)
    }
    return row
  }

  static func rating(_ value: Int) -> UIView {
    let label = UILabel()
    label.text = String(repeating: "★", count: value) + String(repeating: "☆", count: max(0, 5 - value))
    label.font = .systemFont(ofSize: 18)
    label.textColor = AFColor.textPrimary
    label.accessibilityLabel = String(localized: "\(value) of 5 stars")
    return label
  }

  static func location(latitude: Double, longitude: Double, place: String?, action: @escaping () -> Void) -> UIView {
    let button = UIButton(type: .custom, primaryAction: UIAction { _ in action() })
    button.accessibilityLabel = [place, String(localized: "Show on the exhibition map")].compactMap { $0 }.joined(separator: ", ")
    let map = MKMapView()
    ExhibitionMapStyle.configure(map)
    map.isUserInteractionEnabled = false
    map.layer.cornerRadius = AFRadius.mosaic
    map.layer.cornerCurve = .continuous
    map.clipsToBounds = true
    let coordinate = CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
    map.setRegion(MKCoordinateRegion(center: coordinate, latitudinalMeters: 8_000, longitudinalMeters: 8_000), animated: false)
    let pin = MKPointAnnotation()
    pin.coordinate = coordinate
    map.addAnnotation(pin)
    map.translatesAutoresizingMaskIntoConstraints = false
    let text = AFLabel.ui(place ?? String(format: "%.4f, %.4f", latitude, longitude), size: 14, color: AFColor.textPrimary)
    let hint = AFLabel.ui(String(localized: "Show on the exhibition map"), size: 12, color: AFColor.textTertiary)
    let chevron = UIImageView(image: UIImage(systemName: "chevron.right"))
    chevron.tintColor = AFColor.textTertiary
    let texts = UIStackView(arrangedSubviews: [text, hint])
    texts.axis = .vertical
    texts.spacing = 2
    let line = UIStackView(arrangedSubviews: [texts, chevron])
    line.alignment = .center
    let column = UIStackView(arrangedSubviews: [map, line])
    column.axis = .vertical
    column.spacing = 10
    column.isUserInteractionEnabled = false
    column.translatesAutoresizingMaskIntoConstraints = false
    button.addSubview(column)
    NSLayoutConstraint.activate([
      map.heightAnchor.constraint(equalToConstant: 132),
      column.leadingAnchor.constraint(equalTo: button.leadingAnchor),
      column.trailingAnchor.constraint(equalTo: button.trailingAnchor),
      column.topAnchor.constraint(equalTo: button.topAnchor),
      column.bottomAnchor.constraint(equalTo: button.bottomAnchor),
    ])
    return button
  }

  static func view(for section: DetailSection, accent: UIColor, bars: inout [UIView], onOpenLocation: @escaping () -> Void) -> UIView {
    switch section {
    case .exposure(let rows):
      return Self.section(String(localized: "Exposure & Metering"), body: grid(rows))
    case .file(let values):
      return Self.section(String(localized: "File"), body: chips(values))
    case .tone(let type, let values):
      let typeLabel = type.map { AFLabel.exhibit($0, size: 14, italic: true, color: AFColor.textSecondary) }
      return Self.section(String(localized: "Tone"), trailing: typeLabel, body: tone(values, accent: accent, bars: &bars))
    case .description(let text):
      let label = AFLabel.exhibitUser(text, size: 16)
      label.font = AFFont.exhibitUser(size: 16, relativeTo: .body)
      label.numberOfLines = 0
      return Self.section(String(localized: "Description"), body: label)
    case .rating(let value):
      return Self.section(String(localized: "Rating"), body: rating(value))
    case .location(let latitude, let longitude, let place):
      return Self.section(String(localized: "Location"), body: location(latitude: latitude, longitude: longitude, place: place, action: onOpenLocation))
    case .fujiRecipe(let title, let rows):
      let titleLabel = title.map { AFLabel.exhibit($0, size: 14, italic: true, color: AFColor.textSecondary) }
      return Self.section(String(localized: "Film Simulation"), trailing: titleLabel, body: grid(rows))
    case .attribution(let rows):
      return Self.section(String(localized: "Attribution"), body: grid(rows))
    }
  }

  static func commentsRow(count: Int?, action: @escaping () -> Void) -> UIButton {
    var configuration = UIButton.Configuration.filled()
    configuration.baseBackgroundColor = UIColor(afHex: 0x1E1C19)
    configuration.baseForegroundColor = AFColor.textPrimary
    configuration.cornerStyle = .capsule
    configuration.title = String(localized: "Comments")
    configuration.subtitle = nil
    configuration.image = UIImage(systemName: "chevron.right", withConfiguration: UIImage.SymbolConfiguration(pointSize: 14, weight: .medium))
    configuration.imagePlacement = .trailing
    configuration.contentInsets = NSDirectionalEdgeInsets(top: 15, leading: 18, bottom: 15, trailing: 18)
    let button = UIButton(configuration: configuration, primaryAction: UIAction { _ in action() })
    button.contentHorizontalAlignment = .fill
    update(commentsRow: button, count: count)
    return button
  }

  static func update(commentsRow button: UIButton, count: Int?) {
    let title = count.map { String(localized: "Comments · \($0)") } ?? String(localized: "Comments")
    button.configuration?.attributedTitle = AttributedString(title, attributes: AttributeContainer([.font: AFFont.ui(size: 15, relativeTo: .body)]))
  }
}

final class DetailChipFlowView: UIView {
  var chips: [String] = [] {
    didSet { rebuild() }
  }

  private var labels: [UILabel] = []

  private func rebuild() {
    labels.forEach { $0.removeFromSuperview() }
    labels = chips.map { text in
      let label = PaddedLabel()
      label.insets = UIEdgeInsets(top: 0, left: 10, bottom: 0, right: 10)
      label.text = text
      label.font = AFFont.mono(size: 11)
      label.textColor = AFColor.textPrimary
      label.backgroundColor = AFColor.fill
      label.layer.cornerRadius = 13
      label.clipsToBounds = true
      addSubview(label)
      return label
    }
    invalidateIntrinsicContentSize()
    setNeedsLayout()
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    _ = arrange(width: bounds.width, apply: true)
  }

  override var intrinsicContentSize: CGSize {
    CGSize(width: UIView.noIntrinsicMetric, height: arrange(width: bounds.width > 0 ? bounds.width : 320, apply: false))
  }

  override func systemLayoutSizeFitting(_ targetSize: CGSize, withHorizontalFittingPriority _: UILayoutPriority, verticalFittingPriority _: UILayoutPriority) -> CGSize {
    CGSize(width: targetSize.width, height: arrange(width: targetSize.width, apply: false))
  }

  private func arrange(width: CGFloat, apply: Bool) -> CGFloat {
    var x: CGFloat = 0
    var y: CGFloat = 0
    for label in labels {
      let size = CGSize(width: min(width, label.intrinsicContentSize.width), height: 26)
      if x > 0, x + size.width > width {
        x = 0
        y += 32
      }
      if apply { label.frame = CGRect(origin: CGPoint(x: x, y: y), size: size) }
      x += size.width + 6
    }
    return labels.isEmpty ? 0 : y + 26
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    invalidateIntrinsicContentSize()
  }

  override var bounds: CGRect {
    didSet { if bounds.width != oldValue.width { invalidateIntrinsicContentSize() } }
  }
}
