import UIKit

final class AFFocusTabVerticalLabel: UIView {
  private let label = UILabel()
  private let rotates: Bool

  var textColor: UIColor {
    get { label.textColor }
    set { label.textColor = newValue }
  }

  init(title: String) {
    rotates = !Self.isUprightScript(title)
    super.init(frame: .zero)
    label.font = AFFont.ui(size: 13, weight: .medium)
    label.adjustsFontForContentSizeCategory = false
    label.textAlignment = .center
    label.numberOfLines = 0
    label.text = rotates ? title : title.map(String.init).joined(separator: "\n")
    label.isAccessibilityElement = false
    addSubview(label)
    if rotates {
      label.transform = CGAffineTransform(rotationAngle: .pi / 2)
    }
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  override var intrinsicContentSize: CGSize {
    let size = label.sizeThatFits(CGSize(width: CGFloat.greatestFiniteMagnitude, height: .greatestFiniteMagnitude))
    return rotates ? CGSize(width: size.height, height: size.width) : size
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    let size = label.sizeThatFits(CGSize(width: CGFloat.greatestFiniteMagnitude, height: .greatestFiniteMagnitude))
    label.bounds = CGRect(origin: .zero, size: size)
    label.center = CGPoint(x: bounds.midX, y: bounds.midY)
  }

  static func isUprightScript(_ text: String) -> Bool {
    text.unicodeScalars.contains { scalar in
      switch scalar.value {
      case 0x3040...0x30FF, 0x3400...0x4DBF, 0x4E00...0x9FFF, 0xAC00...0xD7AF, 0xF900...0xFAFF: true
      default: false
      }
    }
  }
}
