import UIKit

enum AFGlyph: Equatable {
  case filmFrame
  case viewfinder
}

final class AFGlyphView: UIView {
  static let size = CGSize(width: 76, height: 56)

  private let outline = CAShapeLayer()
  private let solid = CAShapeLayer()

  var glyph: AFGlyph? {
    didSet {
      isHidden = glyph == nil
      setNeedsLayout()
    }
  }

  override init(frame: CGRect) {
    super.init(frame: frame)
    isAccessibilityElement = false
    outline.fillColor = nil
    outline.strokeColor = AFColor.textTertiary.cgColor
    outline.lineWidth = 1.5
    outline.lineCap = .round
    outline.lineJoin = .round
    layer.addSublayer(outline)
    layer.addSublayer(solid)
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  override var intrinsicContentSize: CGSize { Self.size }

  override func layoutSubviews() {
    super.layoutSubviews()
    let box = CGRect(
      x: (bounds.width - Self.size.width) / 2,
      y: (bounds.height - Self.size.height) / 2,
      width: Self.size.width,
      height: Self.size.height
    )
    outline.frame = bounds
    solid.frame = bounds
    switch glyph {
    case .filmFrame:
      let paths = Self.filmFrame(in: box)
      outline.path = paths.outline
      solid.path = paths.solid
      solid.fillColor = AFColor.textTertiary.cgColor
    case .viewfinder:
      let paths = Self.viewfinder(in: box)
      outline.path = paths.outline
      solid.path = paths.solid
      solid.fillColor = AFColor.accentFallback.cgColor
    case nil:
      outline.path = nil
      solid.path = nil
    }
  }

  private static func filmFrame(in box: CGRect) -> (outline: CGPath, solid: CGPath) {
    let outline = UIBezierPath(roundedRect: box.insetBy(dx: 0.75, dy: 0.75), cornerRadius: 7)
    let window = CGRect(x: box.minX + 9, y: box.minY + 14, width: box.width - 18, height: box.height - 28)
    outline.append(UIBezierPath(roundedRect: window, cornerRadius: 2.5))
    let solid = UIBezierPath()
    let holes = 6
    let holeSize = CGSize(width: 5, height: 4)
    let pitch = (box.width - 18) / CGFloat(holes)
    for index in 0..<holes {
      let x = box.minX + 9 + pitch * CGFloat(index) + (pitch - holeSize.width) / 2
      for y in [box.minY + 5, box.maxY - 5 - holeSize.height] {
        solid.append(UIBezierPath(roundedRect: CGRect(origin: CGPoint(x: x, y: y), size: holeSize), cornerRadius: 1))
      }
    }
    return (outline.cgPath, solid.cgPath)
  }

  private static func viewfinder(in box: CGRect) -> (outline: CGPath, solid: CGPath) {
    let frame = box.insetBy(dx: 4, dy: 6)
    let arm: CGFloat = 12
    let outline = UIBezierPath()
    let corners: [(CGPoint, CGFloat, CGFloat)] = [
      (CGPoint(x: frame.minX, y: frame.minY), 1, 1),
      (CGPoint(x: frame.maxX, y: frame.minY), -1, 1),
      (CGPoint(x: frame.minX, y: frame.maxY), 1, -1),
      (CGPoint(x: frame.maxX, y: frame.maxY), -1, -1),
    ]
    for (corner, dx, dy) in corners {
      outline.move(to: CGPoint(x: corner.x + arm * dx, y: corner.y))
      outline.addLine(to: corner)
      outline.addLine(to: CGPoint(x: corner.x, y: corner.y + arm * dy))
    }
    let center = CGPoint(x: frame.midX, y: frame.midY)
    outline.append(UIBezierPath(arcCenter: center, radius: 7, startAngle: 0, endAngle: .pi * 2, clockwise: true))
    let solid = UIBezierPath(arcCenter: center, radius: 2.5, startAngle: 0, endAngle: .pi * 2, clockwise: true)
    return (outline.cgPath, solid.cgPath)
  }
}
