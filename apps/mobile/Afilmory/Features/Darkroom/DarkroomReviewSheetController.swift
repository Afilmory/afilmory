import UIKit

final class DarkroomReviewSheetController: AFSheetController {
  private let picks: [DarkroomPick]
  private var selection: DarkroomReviewSelection
  private var tags: DarkroomTagSelection
  private let startButton = DarkroomPillButton(style: .filled, height: 54)
  private var pickButtons: [String: DarkroomPickButton] = [:]
  private let chips = DarkroomChipFlowView()
  private var started = false

  var onStart: (([DarkroomPick], [String]) -> Void)?
  var onCancel: (() -> Void)?

  init(picks: [DarkroomPick], availableTags: [String]) {
    self.picks = picks
    selection = DarkroomReviewSelection(ids: picks.map(\.id))
    tags = DarkroomTagSelection(available: availableTags)
    super.init(title: " ", detent: .fit)
    closeAction = { [weak self] in self?.cancel() }
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    let strip = UIScrollView()
    strip.showsHorizontalScrollIndicator = false
    strip.alwaysBounceHorizontal = true
    strip.contentInset = UIEdgeInsets(top: 0, left: 22, bottom: 0, right: 22)
    let row = UIStackView()
    row.spacing = 8
    row.alignment = .center
    row.translatesAutoresizingMaskIntoConstraints = false
    strip.addSubview(row)
    for pick in picks {
      let button = DarkroomPickButton(pick: pick)
      button.addAction(UIAction { [weak self] _ in self?.toggle(pick.id) }, for: .primaryActionTriggered)
      pickButtons[pick.id] = button
      row.addArrangedSubview(button)
    }

    let tagLabel = DarkroomGroupView.sectionLabel(String(localized: "Tags"))
    chips.onToggle = { [weak self] tag in self?.toggleTag(tag) }
    chips.tags = tags.available
    let noTags = AFLabel.mono(String(localized: "No tags in your library yet"), size: 11)
    noTags.isHidden = !tags.available.isEmpty
    chips.isHidden = tags.available.isEmpty

    startButton.addAction(UIAction { [weak self] _ in self?.start() }, for: .primaryActionTriggered)

    let padded = UIStackView(arrangedSubviews: [tagLabel, chips, noTags, startButton])
    padded.axis = .vertical
    padded.spacing = 10
    padded.setCustomSpacing(28, after: chips)
    padded.setCustomSpacing(28, after: noTags)
    for view in [padded, strip] as [UIView] {
      view.translatesAutoresizingMaskIntoConstraints = false
      sheetContent.addSubview(view)
    }
    padded.insertArrangedSubview(UIView(), at: 0)
    let stripSlot = padded.arrangedSubviews[0]
    padded.setCustomSpacing(22, after: stripSlot)
    NSLayoutConstraint.activate([
      padded.topAnchor.constraint(equalTo: sheetContent.topAnchor, constant: 2),
      padded.leadingAnchor.constraint(equalTo: sheetContent.leadingAnchor, constant: 22),
      padded.trailingAnchor.constraint(equalTo: sheetContent.trailingAnchor, constant: -22),
      padded.bottomAnchor.constraint(equalTo: sheetContent.bottomAnchor, constant: -30),
      stripSlot.heightAnchor.constraint(equalToConstant: 150),
      strip.topAnchor.constraint(equalTo: stripSlot.topAnchor),
      strip.bottomAnchor.constraint(equalTo: stripSlot.bottomAnchor),
      strip.leadingAnchor.constraint(equalTo: sheetContent.leadingAnchor),
      strip.trailingAnchor.constraint(equalTo: sheetContent.trailingAnchor),
      row.topAnchor.constraint(equalTo: strip.contentLayoutGuide.topAnchor),
      row.bottomAnchor.constraint(equalTo: strip.contentLayoutGuide.bottomAnchor),
      row.leadingAnchor.constraint(equalTo: strip.contentLayoutGuide.leadingAnchor),
      row.trailingAnchor.constraint(equalTo: strip.contentLayoutGuide.trailingAnchor),
      row.heightAnchor.constraint(equalTo: strip.frameLayoutGuide.heightAnchor),
    ])
    render(animated: false)
  }

  private func toggle(_ id: String) {
    selection.toggle(id)
    UISelectionFeedbackGenerator().selectionChanged()
    render(animated: true)
  }

  private func toggleTag(_ tag: String) {
    tags.toggle(tag)
    chips.selected = Set(tags.chosen)
  }

  private func render(animated: Bool) {
    setHeader(title: String(localized: "Review · \(selection.count)"))
    startButton.setTitle(String(localized: "Start developing \(selection.count)"), size: 16)
    startButton.isEnabled = selection.count > 0
    for (id, button) in pickButtons {
      button.setOrder(selection.number(for: id), animated: animated)
    }
    chips.selected = Set(tags.chosen)
  }

  private func start() {
    guard !started, selection.count > 0 else { return }
    started = true
    let chosen = selection.selected.compactMap { id in picks.first { $0.id == id } }
    let tags = self.tags.chosen
    let onStart = self.onStart
    dismiss(animated: true) { onStart?(chosen, tags) }
  }

  private func cancel() {
    dismiss(animated: true)
  }

  override func viewDidDisappear(_ animated: Bool) {
    super.viewDidDisappear(animated)
    if !started { onCancel?() }
  }
}

private final class DarkroomPickButton: UIButton {
  private let photo = UIImageView()
  private let badge = UILabel()
  private let pick: DarkroomPick
  private var requestedThumbnail = false

  init(pick: DarkroomPick) {
    self.pick = pick
    super.init(frame: .zero)
    layer.cornerRadius = AFRadius.mosaic
    layer.cornerCurve = .continuous
    clipsToBounds = true
    backgroundColor = AFColor.fill
    photo.contentMode = .scaleAspectFill
    photo.isUserInteractionEnabled = false
    badge.font = AFFont.mono(size: 11)
    badge.textAlignment = .center
    badge.layer.cornerRadius = 12
    badge.layer.masksToBounds = true
    for view in [photo, badge] {
      view.translatesAutoresizingMaskIntoConstraints = false
      addSubview(view)
    }
    NSLayoutConstraint.activate([
      heightAnchor.constraint(equalToConstant: 150),
      widthAnchor.constraint(equalToConstant: (150 * CGFloat(min(3, max(0.33, pick.aspectRatio)))).rounded()),
      photo.topAnchor.constraint(equalTo: topAnchor),
      photo.leadingAnchor.constraint(equalTo: leadingAnchor),
      photo.trailingAnchor.constraint(equalTo: trailingAnchor),
      photo.bottomAnchor.constraint(equalTo: bottomAnchor),
      badge.topAnchor.constraint(equalTo: topAnchor, constant: 8),
      badge.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -8),
      badge.widthAnchor.constraint(equalToConstant: 24),
      badge.heightAnchor.constraint(equalToConstant: 24),
    ])
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    guard !requestedThumbnail, let scale = window?.windowScene?.screen.scale else { return }
    requestedThumbnail = true
    pick.loadThumbnail(height: 150, scale: scale) { [weak self] image in
      guard let self else { return }
      UIView.transition(with: self.photo, duration: 0.2, options: .transitionCrossDissolve) { self.photo.image = image }
    }
  }

  func setOrder(_ order: Int?, animated: Bool) {
    let on = order != nil
    accessibilityLabel = on
      ? String(localized: "Deselect \(pick.name)")
      : String(localized: "Select \(pick.name)")
    accessibilityTraits = on ? [.button, .selected] : .button
    let changes = {
      self.alpha = on ? 1 : 0.45
      self.transform = on || AFMotion.reduceMotion ? .identity : CGAffineTransform(scaleX: 0.95, y: 0.95)
      self.badge.text = order.map(String.init)
      self.badge.textColor = AFColor.onLight
      self.badge.backgroundColor = on ? AFColor.textPrimary : AFColor.ground.withAlphaComponent(0.4)
      self.badge.layer.borderWidth = on ? 0 : 1.5
      self.badge.layer.borderColor = AFColor.textPrimary.cgColor
    }
    animated ? AFMotion.spring(duration: 0.3, animations: changes) : changes()
  }
}
