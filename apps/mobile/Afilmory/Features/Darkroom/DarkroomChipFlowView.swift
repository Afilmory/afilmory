import UIKit

final class DarkroomChipFlowView: UIView {
  private var buttons: [UIButton] = []
  private let spacing: CGFloat = 8

  var onToggle: ((String) -> Void)?

  var tags: [String] = [] {
    didSet { rebuild() }
  }

  var selected: Set<String> = [] {
    didSet { buttons.forEach(style) }
  }

  private func rebuild() {
    buttons.forEach { $0.removeFromSuperview() }
    buttons = tags.map { tag in
      var configuration = UIButton.Configuration.plain()
      configuration.attributedTitle = AttributedString(tag, attributes: AttributeContainer([.font: AFFont.ui(size: 14, relativeTo: .subheadline)]))
      configuration.contentInsets = NSDirectionalEdgeInsets(top: 7, leading: 14, bottom: 7, trailing: 14)
      configuration.titleLineBreakMode = .byTruncatingTail
      let button = UIButton(configuration: configuration, primaryAction: UIAction { [weak self] _ in self?.onToggle?(tag) })
      button.accessibilityIdentifier = tag
      button.layer.borderWidth = 1
      addSubview(button)
      return button
    }
    buttons.forEach(style)
    invalidateIntrinsicContentSize()
    setNeedsLayout()
  }

  private func style(_ button: UIButton) {
    let tag = button.accessibilityIdentifier ?? ""
    let on = selected.contains(tag)
    UIView.animate(withDuration: 0.2) {
      button.backgroundColor = on ? AFColor.textPrimary : .clear
      button.layer.borderColor = (on ? AFColor.textPrimary : AFColor.tick).cgColor
      button.configuration?.baseForegroundColor = on ? AFColor.onLight : AFColor.textPrimary
    }
    button.accessibilityTraits = on ? [.button, .selected] : .button
  }

  private func frames(for width: CGFloat) -> [CGRect] {
    var x: CGFloat = 0
    var y: CGFloat = 0
    var rowHeight: CGFloat = 0
    return buttons.map { button in
      let fitting = button.systemLayoutSizeFitting(UIView.layoutFittingCompressedSize)
      let size = CGSize(width: min(width, fitting.width), height: max(34, fitting.height))
      if x > 0, x + size.width > width {
        x = 0
        y += rowHeight + spacing
        rowHeight = 0
      }
      let frame = CGRect(origin: CGPoint(x: x, y: y), size: size)
      x += size.width + spacing
      rowHeight = max(rowHeight, size.height)
      return frame
    }
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    for (button, frame) in zip(buttons, frames(for: bounds.width)) {
      button.frame = frame
      button.layer.cornerRadius = frame.height / 2
    }
    let height = frames(for: bounds.width).map(\.maxY).max() ?? 0
    if abs(height - lastHeight) > 0.5 {
      lastHeight = height
      invalidateIntrinsicContentSize()
    }
  }

  private var lastHeight: CGFloat = 0

  override var intrinsicContentSize: CGSize {
    let width = bounds.width > 0 ? bounds.width : (window?.windowScene?.screen.bounds.width ?? 402) - 60
    return CGSize(width: UIView.noIntrinsicMetric, height: frames(for: width).map(\.maxY).max() ?? 0)
  }

  override func systemLayoutSizeFitting(
    _ targetSize: CGSize,
    withHorizontalFittingPriority _: UILayoutPriority,
    verticalFittingPriority _: UILayoutPriority
  ) -> CGSize {
    CGSize(width: targetSize.width, height: frames(for: targetSize.width).map(\.maxY).max() ?? 0)
  }
}
