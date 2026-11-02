import UIKit

final class DetailInfoColumn: UIView {
  var onOpenLocation: (() -> Void)?
  var onOpenComments: (() -> Void)?
  private(set) var sectionOrder: [String] = []
  private(set) var exposureColumns = 0
  private(set) var locationRow: UIControl?
  private(set) var commentsRow: UIControl?

  private let scroller = UIScrollView()
  private let stack = UIStackView()
  private let dot = UIView()
  private var exposure: [DuoInfoModel.Value] = []
  private var exposureHost: UIStackView?
  private var toneBars: [UIView] = []
  private(set) var commentCount: Int?
  private(set) var accent = AFColor.accentFallback

  override init(frame: CGRect) {
    super.init(frame: frame)
    scroller.alwaysBounceVertical = true
    scroller.showsVerticalScrollIndicator = false
    scroller.contentInsetAdjustmentBehavior = .never
    addSubview(scroller)
    stack.axis = .vertical
    stack.spacing = 22
    stack.translatesAutoresizingMaskIntoConstraints = false
    scroller.addSubview(stack)
    NSLayoutConstraint.activate([
      stack.topAnchor.constraint(equalTo: scroller.contentLayoutGuide.topAnchor, constant: 30),
      stack.bottomAnchor.constraint(equalTo: scroller.contentLayoutGuide.bottomAnchor, constant: -24),
      stack.leadingAnchor.constraint(equalTo: scroller.frameLayoutGuide.leadingAnchor, constant: 22),
      stack.trailingAnchor.constraint(equalTo: scroller.frameLayoutGuide.trailingAnchor, constant: -18),
    ])
    dot.layer.cornerRadius = 3.5
    dot.translatesAutoresizingMaskIntoConstraints = false
    NSLayoutConstraint.activate([dot.widthAnchor.constraint(equalToConstant: 7), dot.heightAnchor.constraint(equalToConstant: 7)])
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    scroller.frame = bounds
    let columns = bounds.width >= 360 ? 3 : 2
    if columns != exposureColumns, let exposureHost {
      exposureColumns = columns
      exposureHost.arrangedSubviews.last?.removeFromSuperview()
      exposureHost.addArrangedSubview(Self.grid(exposure, columns: columns))
    }
  }

  func configure(model: DuoInfoModel, accent: UIColor, commentsEnabled: Bool) {
    stack.arrangedSubviews.forEach { $0.removeFromSuperview() }
    sectionOrder = []
    toneBars = []
    exposureHost = nil
    exposureColumns = 0
    locationRow = nil
    commentsRow = nil
    exposure = model.exposure
    self.accent = accent
    dot.backgroundColor = accent
    append("header", header(model))
    if !model.tags.isEmpty {
      let tags = DetailChipFlowView()
      tags.chips = model.tags
      append("tags", tags)
    }
    if !model.exposure.isEmpty {
      let host = UIStackView(arrangedSubviews: [DetailSectionViews.caption(String(localized: "Exposure & Metering")), UIView()])
      host.axis = .vertical
      host.spacing = 10
      exposureHost = host
      append("exposure", host)
    }
    if let tone = model.tone {
      append("tone", DetailSectionViews.view(for: tone, accent: accent, bars: &toneBars) {})
    }
    for extra in model.extras {
      append(extra.id, DetailSectionViews.view(for: extra, accent: accent, bars: &toneBars) {})
    }
    let rows = UIStackView()
    rows.axis = .vertical
    if model.hasLocation {
      let row = Self.row(title: model.place ?? String(localized: "Location"), detail: String(localized: "Show on the exhibition map") + " ›") { [weak self] in
        self?.onOpenLocation?()
      }
      locationRow = row
      rows.addArrangedSubview(row)
      sectionOrder.append("location")
    }
    if commentsEnabled {
      let row = Self.row(title: Self.commentsTitle(commentCount), detail: "›") { [weak self] in
        self?.onOpenComments?()
      }
      commentsRow = row
      rows.addArrangedSubview(row)
      sectionOrder.append("comments")
    }
    if !rows.arrangedSubviews.isEmpty {
      stack.addArrangedSubview(rows)
    }
    setNeedsLayout()
  }

  func setCommentCount(_ count: Int?) {
    commentCount = count
    (commentsRow as? Row)?.title.text = Self.commentsTitle(count)
  }

  func setAccent(_ color: UIColor) {
    accent = color
    dot.backgroundColor = color
    toneBars.forEach { $0.backgroundColor = color }
  }

  private func append(_ id: String, _ view: UIView) {
    sectionOrder.append(id)
    stack.addArrangedSubview(view)
  }

  private func header(_ model: DuoInfoModel) -> UIView {
    let number = AFLabel.exhibit(String(localized: "No. \(model.number)"), size: 16, italic: true)
    let kicker = UIStackView(arrangedSubviews: [dot, number, UIView()])
    kicker.alignment = .center
    kicker.spacing = 8
    let title = model.isUserTitle ? AFLabel.exhibitUser(model.title, size: 30) : AFLabel.exhibit(model.title, size: 30)
    title.numberOfLines = 0
    title.accessibilityTraits = .header
    let column = UIStackView(arrangedSubviews: [kicker, title])
    column.axis = .vertical
    column.spacing = 6
    if let meta = model.meta {
      let label = AFLabel.mono(meta, size: 11, color: AFColor.textTertiary)
      label.numberOfLines = 0
      column.addArrangedSubview(label)
      column.setCustomSpacing(8, after: title)
    }
    return column
  }

  private static func grid(_ values: [DuoInfoModel.Value], columns: Int) -> UIView {
    let outer = UIStackView()
    outer.axis = .vertical
    outer.spacing = 12
    stride(from: 0, to: values.count, by: columns).forEach { start in
      let line = UIStackView()
      line.distribution = .fillEqually
      line.alignment = .top
      line.spacing = 12
      for index in start..<start + columns {
        guard values.indices.contains(index) else {
          line.addArrangedSubview(UIView())
          continue
        }
        let value = AFLabel.exhibit(values[index].value, size: 17)
        value.numberOfLines = 0
        let label = AFLabel.mono(values[index].label, size: 10, color: AFColor.textTertiary)
        label.numberOfLines = 0
        let cell = UIStackView(arrangedSubviews: [value, label])
        cell.axis = .vertical
        cell.spacing = 2
        cell.isAccessibilityElement = true
        cell.accessibilityLabel = "\(values[index].label), \(values[index].value)"
        line.addArrangedSubview(cell)
      }
      outer.addArrangedSubview(line)
    }
    return outer
  }

  private static func commentsTitle(_ count: Int?) -> String {
    count.map { String(localized: "Comments · \($0)") } ?? String(localized: "Comments")
  }

  private static func row(title: String, detail: String, action: @escaping () -> Void) -> Row {
    let row = Row(title: title, detail: detail)
    row.addAction(UIAction { _ in action() }, for: .touchUpInside)
    return row
  }

  private final class Row: UIControl {
    let title = AFLabel.ui(size: 15, color: AFColor.textPrimary)
    private let detail = AFLabel.ui(size: 12, color: AFColor.textTertiary)
    private let rule = UIView()

    init(title text: String, detail detailText: String) {
      super.init(frame: .zero)
      title.text = text
      detail.text = detailText
      title.lineBreakMode = .byTruncatingTail
      title.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
      detail.setContentHuggingPriority(.required, for: .horizontal)
      rule.backgroundColor = AFColor.divider
      [title, detail, rule].forEach {
        $0.translatesAutoresizingMaskIntoConstraints = false
        $0.isUserInteractionEnabled = false
        addSubview($0)
      }
      NSLayoutConstraint.activate([
        heightAnchor.constraint(greaterThanOrEqualToConstant: 44),
        rule.topAnchor.constraint(equalTo: topAnchor),
        rule.leadingAnchor.constraint(equalTo: leadingAnchor),
        rule.trailingAnchor.constraint(equalTo: trailingAnchor),
        rule.heightAnchor.constraint(equalToConstant: 1),
        title.leadingAnchor.constraint(equalTo: leadingAnchor),
        title.centerYAnchor.constraint(equalTo: centerYAnchor),
        detail.leadingAnchor.constraint(greaterThanOrEqualTo: title.trailingAnchor, constant: 12),
        detail.trailingAnchor.constraint(equalTo: trailingAnchor),
        detail.centerYAnchor.constraint(equalTo: centerYAnchor),
      ])
      isAccessibilityElement = true
      accessibilityTraits = .button
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
      fatalError("init(coder:) has not been implemented")
    }

    override var accessibilityLabel: String? {
      get { [title.text, detail.text].compactMap { $0 }.joined(separator: ", ") }
      set {}
    }

    override var isHighlighted: Bool {
      didSet { alpha = isHighlighted ? 0.6 : 1 }
    }
  }
}
