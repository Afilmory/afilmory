import UIKit

private let afterglowDuration: TimeInterval = 1.2

final class PhotoDetailReactionRailView: UIView {
  var onSend: ((String, Int) -> Void)?
  var onEmitParticle: ((String, CGPoint) -> Void)?
  var anchorXCenter: CGFloat?

  private typealias Geometry = PhotoDetailReactionGeometry

  // One glass surface for the whole group, with the reactions sitting on it as
  // plain buttons — not six separate glass circles.
  private let container = UIVisualEffectView(
    effect: AdaptiveGlass.effect(fallbackStyle: .systemThinMaterialDark)
  )
  private let chargeRing = PhotoDetailReactionChargeRing()
  private let focusLabel = PhotoDetailReactionFocusLabel()
  private let haptics = PhotoDetailReactionHaptics()
  private let stream = PhotoDetailReactionStreamDriver()

  private var items: [PhotoDetailReactionItem] = []
  private var itemLabels: [UILabel] = []
  private var itemHighlights: [UIView] = []
  private var itemBadges: [PhotoDetailReactionBadge] = []
  private var accessibilityItems: [PhotoDetailReactionAccessibilityElement] = []

  private var presented = false
  private var scrubX: CGFloat?
  private var focusedIndex = 0
  private var collapsed = false

  private lazy var scrubGestureRecognizer: UILongPressGestureRecognizer = {
    // minimumPressDuration 0 turns this into a press-and-drag recogniser: it
    // begins on touch-down, where a pan would wait for displacement first.
    let recognizer = UILongPressGestureRecognizer(target: self, action: #selector(handleScrub))
    recognizer.minimumPressDuration = 0
    recognizer.allowableMovement = .greatestFiniteMagnitude
    return recognizer
  }()

  override init(frame: CGRect) {
    super.init(frame: frame)

    alpha = 0
    isHidden = true
    isAccessibilityElement = false

    // The magnified reaction rises out of the bar; neither the effect view nor
    // its content view may clip it away.
    container.clipsToBounds = false
    container.contentView.clipsToBounds = false
    container.layer.cornerCurve = .continuous
    addSubview(container)
    addSubview(chargeRing)

    focusLabel.alpha = 0
    addSubview(focusLabel)

    addGestureRecognizer(scrubGestureRecognizer)
    configureStream()
  }

  private func configureStream() {
    stream.onStreamBegan = { [weak self] in
      guard let self else { return }
      collapsed = true
      chargeRing.setProgress(0, animated: false)
      applyCollapseLayout()
      haptics.streamBegan()
    }
    stream.onShot = { [weak self] count, ramp in
      guard let self, items.indices.contains(focusedIndex) else { return }
      haptics.streamShot(progress: ramp)
      emitParticle(items[focusedIndex].reaction, at: focusedIndex)
      if count == Geometry.comboCap {
        haptics.streamCapped()
      }
      // Deliberately not a full layout pass: the collapse spring is still in
      // flight, and rewriting the same frames outside its animation block would
      // replace it and swallow the overshoot.
      chargeRing.setProgress(CGFloat(count) / CGFloat(Geometry.comboCap), animated: true)
      pulseFocusedItem()
      updateFocusLabel()
    }
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) is not supported")
  }

  // The rail reserves transparent headroom above the bar for the lift and the
  // count label. Touches up there belong to the photo, not to the rail.
  override func point(inside point: CGPoint, with event: UIEvent?) -> Bool {
    container.frame.insetBy(dx: -6, dy: -6).contains(point)
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    layoutItems()
  }

  override func sizeThatFits(_ size: CGSize) -> CGSize {
    CGSize(width: Geometry.containerWidth(itemCount: items.count), height: Geometry.railHeight)
  }

  func preferredFrame(containerWidth: CGFloat, bottomY: CGFloat) -> CGRect {
    let size = sizeThatFits(.zero)
    let x = anchorXCenter.map { center in
      min(max(12, center - size.width / 2), containerWidth - size.width - 12)
    } ?? max(12, containerWidth - size.width - 12)
    return CGRect(
      x: x,
      y: bottomY - size.height - 8,
      width: min(size.width, containerWidth - 24),
      height: size.height
    )
  }

  func prepareHaptics() {
    haptics.prepare()
  }

  func playFailureFeedback() {
    haptics.failed()
  }

  func setItems(_ items: [PhotoDetailReactionItem]) {
    let structureChanged = items.map(\.reaction) != self.items.map(\.reaction)
    self.items = items

    guard structureChanged else {
      for (index, item) in items.enumerated()
      where itemBadges.indices.contains(index) && accessibilityItems.indices.contains(index) {
        itemBadges[index].count = item.count
        accessibilityItems[index].accessibilityValue = "\(item.count)"
      }
      setNeedsLayout()
      return
    }

    container.contentView.subviews.forEach { $0.removeFromSuperview() }
    itemLabels.removeAll()
    itemHighlights.removeAll()
    itemBadges.removeAll()
    accessibilityItems.removeAll()

    for (index, item) in items.enumerated() {
      let highlight = UIView()
      highlight.alpha = 0
      highlight.backgroundColor = UIColor.white.withAlphaComponent(0.18)
      highlight.isUserInteractionEnabled = false
      highlight.layer.cornerCurve = .circular
      container.contentView.addSubview(highlight)
      itemHighlights.append(highlight)

      let label = UILabel()
      label.text = item.reaction
      label.textAlignment = .center
      container.contentView.addSubview(label)
      itemLabels.append(label)

      let badge = PhotoDetailReactionBadge()
      badge.count = item.count
      container.contentView.addSubview(badge)
      itemBadges.append(badge)

      let element = PhotoDetailReactionAccessibilityElement(accessibilityContainer: self)
      element.accessibilityLabel = item.accessibilityLabel
      element.accessibilityValue = "\(item.count)"
      element.accessibilityTraits = .button
      element.onActivate = { [weak self] in self?.sendSingle(at: index) }
      accessibilityItems.append(element)
    }

    accessibilityElements = accessibilityItems
    setNeedsLayout()
  }

  func setPresented(_ presented: Bool, animated: Bool) {
    guard presented != self.presented else { return }
    self.presented = presented

    if presented {
      isHidden = false
      layoutIfNeeded()
    } else {
      // Dismissing mid-gesture still owes whatever already flew out of the rail.
      cancelScrub(commit: true)
    }

    guard animated, !UIAccessibility.isReduceMotionEnabled else {
      alpha = presented ? 1 : 0
      transform = .identity
      itemLabels.forEach { $0.transform = .identity; $0.alpha = 1 }
      isHidden = !presented
      if presented { haptics.railPresented() }
      return
    }

    if presented {
      haptics.railPresented()
      alpha = 1
      transform = .identity
      for (index, label) in itemLabels.enumerated() {
        label.alpha = 0
        label.transform = CGAffineTransform(scaleX: 0.4, y: 0.4)
        UIView.animate(
          withDuration: 0.26,
          delay: Double(index) * 0.018,
          usingSpringWithDamping: 0.72,
          initialSpringVelocity: 0,
          options: [.allowUserInteraction, .beginFromCurrentState]
        ) {
          label.alpha = 1
          label.transform = .identity
        }
      }
      return
    }

    UIView.animate(
      withDuration: 0.16,
      delay: 0,
      options: [.allowUserInteraction, .beginFromCurrentState, .curveEaseOut]
    ) {
      self.alpha = 0
      self.transform = CGAffineTransform(scaleX: 0.96, y: 0.96)
    } completion: { _ in
      guard !self.presented else { return }
      self.isHidden = true
      self.transform = .identity
    }
  }

  private func layoutContainer() {
    let shouldCollapse = collapsed && items.indices.contains(focusedIndex)
    container.frame = shouldCollapse
      ? Geometry.collapsedContainerRect(in: bounds, focusedIndex: focusedIndex)
      : Geometry.expandedContainerRect(in: bounds)
    container.layer.cornerRadius = container.frame.height / 2

    chargeRing.frame = container.frame.insetBy(dx: -4, dy: -4)
    chargeRing.alpha = shouldCollapse ? 1 : 0
  }

  private func layoutItems() {
    layoutContainer()

    // Items live in the content view, so their centre is the container's own
    // bounds midpoint — `frame.midY` would be the rail's space and drop every
    // reaction onto the toolbar below.
    let barCenterY = container.bounds.midY
    let collapsedCentre = CGPoint(x: container.bounds.midX, y: container.bounds.midY)
    let scrubbing = scrubX != nil

    for index in items.indices where itemLabels.indices.contains(index) {
      let restCenterX = Geometry.restCenterX(index: index)
      let magnification = scrubX.map { Geometry.magnification(distance: abs(restCenterX - $0)) } ?? 1
      let lifted = Geometry.amplitude > 0 ? (magnification - 1) / Geometry.amplitude : 0
      let isFocused = index == focusedIndex

      let scale: CGFloat
      let center: CGPoint
      let alpha: CGFloat
      if collapsed {
        // Everything converges on the single button; the chosen one grows into
        // it and the rest are swallowed by the contracting capsule.
        scale = isFocused
          ? Geometry.collapsedEmojiDiameter / Geometry.restDiameter
          : Geometry.collapsedOthersScale
        center = collapsedCentre
        alpha = isFocused ? 1 : 0
      } else {
        scale = magnification
        center = CGPoint(x: restCenterX, y: barCenterY - Geometry.lift * lifted)
        alpha = 1
      }

      let diameter = Geometry.restDiameter * scale
      let restBounds = CGRect(origin: .zero, size: CGSize(width: Geometry.restDiameter, height: Geometry.restDiameter))

      // Scaling by transform rather than by font size and bounds: a font change
      // snaps instantly and would tear away from an animated frame.
      let label = itemLabels[index]
      label.bounds = restBounds
      label.center = center
      label.transform = CGAffineTransform(scaleX: scale, y: scale)
      label.alpha = alpha

      let highlight = itemHighlights[index]
      highlight.bounds = restBounds
      highlight.center = center
      highlight.transform = label.transform
      highlight.layer.cornerRadius = Geometry.restDiameter / 2

      let badge = itemBadges[index]
      badge.alpha = scrubbing ? 0 : 1
      if !badge.isHidden {
        let size = badge.badgeSize
        badge.frame = CGRect(
          x: center.x + diameter / 2 - size.width + 3,
          y: center.y - diameter / 2 - 4,
          width: size.width,
          height: size.height
        )
        badge.layer.cornerRadius = size.height / 2
      }

      // The elements live in the content view's space; the accessibility frame
      // is read in the rail's, so it needs the container's own offset added.
      accessibilityItems[index].accessibilityFrameInContainerSpace = CGRect(
        x: container.frame.minX + center.x - diameter / 2,
        y: container.frame.minY + center.y - diameter / 2,
        width: diameter,
        height: diameter
      )
    }

    guard scrubbing else { return }
    updateFocusLabel()
  }

  private func updateFocusLabel() {
    guard itemLabels.indices.contains(focusedIndex), items.indices.contains(focusedIndex) else { return }
    let focused = itemLabels[focusedIndex]
    container.contentView.bringSubviewToFront(focused)
    focusLabel.text = stream.isStreaming ? "×\(stream.pendingCount)" : "\(items[focusedIndex].count)"
    focusLabel.sizeToFit()
    let radius = focused.bounds.height * focused.transform.d / 2
    focusLabel.center = CGPoint(
      x: container.frame.minX + focused.center.x,
      y: container.frame.minY + focused.center.y - radius - focusLabel.bounds.height / 2 - 4
    )
  }

  @objc private func handleScrub(_ recognizer: UILongPressGestureRecognizer) {
    let x = recognizer.location(in: container).x
    switch recognizer.state {
    case .began:
      beginScrub(at: x)
    case .changed:
      updateScrub(at: x)
    case .ended, .cancelled, .failed:
      cancelScrub(commit: true)
    default:
      break
    }
  }

  private func beginScrub(at x: CGFloat) {
    guard !items.isEmpty else { return }
    scrubX = x
    focusedIndex = Geometry.index(atX: x, itemCount: items.count)
    stream.reset()
    haptics.crossedItem()
    applyScrubLayout(animated: true)
    stream.armHold()
  }

  private func updateScrub(at x: CGFloat) {
    guard scrubX != nil, !stream.isStreaming else { return }
    scrubX = x
    let next = Geometry.index(atX: x, itemCount: items.count)
    if next != focusedIndex {
      focusedIndex = next
      haptics.crossedItem()
      stream.armHold()
    }
    layoutItems()
  }

  private func cancelScrub(commit: Bool) {
    stream.stopTimers()

    guard scrubX != nil, items.indices.contains(focusedIndex) else {
      scrubX = nil
      collapsed = false
      stream.reset()
      return
    }

    let reaction = items[focusedIndex].reaction
    let index = focusedIndex

    if commit {
      if stream.isStreaming {
        haptics.streamEnded()
        onSend?(reaction, stream.pendingCount)
      } else {
        haptics.singleSend()
        emitParticle(reaction, at: index)
        onSend?(reaction, 1)
      }
      startAfterglow(at: index)
    } else if stream.isStreaming {
      haptics.streamEnded()
    }

    scrubX = nil
    collapsed = false
    stream.reset()
    applyScrubLayout(animated: true)
  }

  private func pulseFocusedItem() {
    guard itemLabels.indices.contains(focusedIndex) else { return }
    let label = itemLabels[focusedIndex]
    let base = Geometry.collapsedEmojiDiameter / Geometry.restDiameter
    label.transform = CGAffineTransform(scaleX: base * 1.09, y: base * 1.09)
    UIView.animate(
      withDuration: 0.14,
      delay: 0,
      options: [.allowUserInteraction, .beginFromCurrentState, .curveEaseOut]
    ) {
      label.transform = CGAffineTransform(scaleX: base, y: base)
    }
  }

  private func sendSingle(at index: Int) {
    guard items.indices.contains(index) else { return }
    haptics.singleSend()
    emitParticle(items[index].reaction, at: index)
    onSend?(items[index].reaction, 1)
    startAfterglow(at: index)
  }

  private func emitParticle(_ reaction: String, at index: Int) {
    guard !UIAccessibility.isReduceMotionEnabled, itemLabels.indices.contains(index) else { return }
    let center = itemLabels[index].center
    onEmitParticle?(
      reaction,
      CGPoint(x: container.frame.minX + center.x, y: container.frame.minY + center.y)
    )
  }

  // The server keeps no record of who reacted, so nothing here may claim a
  // lasting selection — the glow says "just now" and then lets go.
  private func startAfterglow(at index: Int) {
    guard itemHighlights.indices.contains(index) else { return }
    let highlight = itemHighlights[index]
    highlight.alpha = 1
    UIView.animate(withDuration: afterglowDuration, delay: 0, options: [.allowUserInteraction]) {
      highlight.alpha = 0
    }
  }

  // Asymmetric on purpose: the collapse is the commit, so it overshoots; coming
  // back is bookkeeping and gets out of the way.
  private func applyCollapseLayout() {
    guard !UIAccessibility.isReduceMotionEnabled else {
      layoutItems()
      return
    }
    UIView.animate(
      withDuration: 0.26,
      delay: 0,
      usingSpringWithDamping: 0.68,
      initialSpringVelocity: 0,
      options: [.allowUserInteraction, .beginFromCurrentState]
    ) {
      self.layoutItems()
    }
  }

  private func applyScrubLayout(animated: Bool) {
    let scrubbing = scrubX != nil
    let changes = { [self] in
      layoutItems()
      focusLabel.alpha = scrubbing ? 1 : 0
    }
    guard animated, !UIAccessibility.isReduceMotionEnabled else {
      changes()
      return
    }
    UIView.animate(
      withDuration: 0.16,
      delay: 0,
      options: [.allowUserInteraction, .beginFromCurrentState, .curveEaseOut],
      animations: changes
    )
  }
}
