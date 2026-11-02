import UIKit

final class AFProgressDots: UIView {
  private static let dot: CGFloat = 6
  private static let current: CGFloat = 18

  private let stack = UIStackView()
  private var dots: [UIView] = []
  private var widths: [NSLayoutConstraint] = []
  private(set) var currentIndex = 0

  var accentColor: UIColor = AFColor.accentFallback {
    didSet { applyColors() }
  }

  var dotWidths: [CGFloat] { widths.map(\.constant) }

  init(count: Int) {
    super.init(frame: .zero)
    stack.axis = .horizontal
    stack.spacing = 6
    stack.alignment = .center
    stack.translatesAutoresizingMaskIntoConstraints = false
    addSubview(stack)
    NSLayoutConstraint.activate([
      stack.topAnchor.constraint(equalTo: topAnchor),
      stack.bottomAnchor.constraint(equalTo: bottomAnchor),
      stack.centerXAnchor.constraint(equalTo: centerXAnchor),
      stack.leadingAnchor.constraint(greaterThanOrEqualTo: leadingAnchor),
      heightAnchor.constraint(equalToConstant: Self.dot),
    ])
    for _ in 0..<count {
      let dot = UIView()
      dot.layer.cornerRadius = Self.dot / 2
      let width = dot.widthAnchor.constraint(equalToConstant: Self.dot)
      NSLayoutConstraint.activate([width, dot.heightAnchor.constraint(equalToConstant: Self.dot)])
      stack.addArrangedSubview(dot)
      dots.append(dot)
      widths.append(width)
    }
    isAccessibilityElement = true
    accessibilityTraits = .updatesFrequently
    setCurrent(0, animated: false)
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  func setCurrent(_ index: Int, animated: Bool) {
    currentIndex = min(max(0, index), max(0, dots.count - 1))
    for (offset, width) in widths.enumerated() {
      width.constant = offset == currentIndex ? Self.current : Self.dot
    }
    accessibilityLabel = String(localized: "Step \(currentIndex + 1) of \(dots.count)")
    let changes = {
      self.applyColors()
      self.stack.layoutIfNeeded()
    }
    animated && !AFMotion.reduceMotion ? AFMotion.spring(duration: 0.4, animations: changes) : changes()
  }

  private func applyColors() {
    for (offset, dot) in dots.enumerated() {
      dot.backgroundColor = offset == currentIndex ? accentColor : AFColor.tick
    }
  }
}
