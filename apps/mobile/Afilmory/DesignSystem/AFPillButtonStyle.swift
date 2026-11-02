import SwiftUI

struct AFPillButtonStyle: ButtonStyle {
  enum Kind {
    case primary
    case fill
    case outline
  }

  var kind: Kind = .primary
  var height: CGFloat = 52

  @Environment(\.isEnabled) private var isEnabled

  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .font(.system(size: height >= 48 ? 17 : 14, weight: .semibold))
      .lineLimit(1)
      .padding(.horizontal, height >= 48 ? 20 : 14)
      .frame(minHeight: height)
      .frame(maxWidth: height >= 48 ? .infinity : nil)
      .foregroundStyle(Color(kind == .primary ? AFColor.onLight : AFColor.textPrimary))
      .background(background, in: Capsule())
      .overlay(Capsule().stroke(Color(AFColor.tick), lineWidth: kind == .outline ? 1 : 0))
      .contentShape(Capsule())
      .opacity(isEnabled ? (configuration.isPressed ? 0.75 : 1) : 0.4)
  }

  private var background: Color {
    switch kind {
    case .primary: Color(AFColor.textPrimary)
    case .fill: Color(AFColor.fill)
    case .outline: .clear
    }
  }
}

extension ButtonStyle where Self == AFPillButtonStyle {
  static var afPrimary: AFPillButtonStyle { AFPillButtonStyle(kind: .primary) }
  static var afFill: AFPillButtonStyle { AFPillButtonStyle(kind: .fill) }
  static var afOutline: AFPillButtonStyle { AFPillButtonStyle(kind: .outline) }
  static func afPill(_ kind: AFPillButtonStyle.Kind, height: CGFloat) -> AFPillButtonStyle {
    AFPillButtonStyle(kind: kind, height: height)
  }
}

struct AFTextButtonStyle: ButtonStyle {
  var color: UIColor = AFColor.textSecondary

  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .font(.system(size: 15))
      .foregroundStyle(Color(color))
      .frame(minHeight: 44)
      .contentShape(Rectangle())
      .opacity(configuration.isPressed ? 0.6 : 1)
  }
}

extension ButtonStyle where Self == AFTextButtonStyle {
  static var afText: AFTextButtonStyle { AFTextButtonStyle() }
}
