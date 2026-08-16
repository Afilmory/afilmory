@preconcurrency import AuthenticationServices
import SwiftUI

struct AfilmoryButton<Label: View>: View {
  let prominent: Bool
  let action: () -> Void
  @ViewBuilder let label: () -> Label

  init(
    prominent: Bool = false,
    action: @escaping () -> Void,
    @ViewBuilder label: @escaping () -> Label
  ) {
    self.prominent = prominent
    self.action = action
    self.label = label
  }

  var body: some View {
    if #available(iOS 26.0, *) {
      if prominent {
        Button(action: action, label: label)
          .buttonStyle(.glassProminent)
      } else {
        Button(action: action, label: label)
          .buttonStyle(.glass)
      }
    } else if prominent {
      Button(action: action, label: label)
        .buttonStyle(.borderedProminent)
    } else {
      Button(action: action, label: label)
        .buttonStyle(.bordered)
    }
  }
}

struct NativeAppleAuthorizationButton: UIViewRepresentable {
  let type: ASAuthorizationAppleIDButton.ButtonType
  let action: () -> Void

  func makeCoordinator() -> Coordinator {
    Coordinator(action: action)
  }

  func makeUIView(context: Context) -> ASAuthorizationAppleIDButton {
    let button = ASAuthorizationAppleIDButton(authorizationButtonType: type, authorizationButtonStyle: .white)
    button.cornerRadius = 14
    button.addTarget(context.coordinator, action: #selector(Coordinator.invoke), for: .touchUpInside)
    return button
  }

  func updateUIView(_: ASAuthorizationAppleIDButton, context: Context) {
    context.coordinator.action = action
  }

  final class Coordinator: NSObject {
    var action: () -> Void

    init(action: @escaping () -> Void) {
      self.action = action
    }

    @objc func invoke() {
      action()
    }
  }
}

struct AfilmoryBrandIcon: View {
  var body: some View {
    Image("AfilmoryLogo")
      .resizable()
      .scaledToFit()
      .clipShape(.rect(cornerRadius: 8, style: .continuous))
      .accessibilityHidden(true)
  }
}

struct GitHubMark: View {
  var body: some View {
    GeometryReader { geometry in
      GitHubMarkShape()
        .fill(.primary)
        .frame(width: geometry.size.width, height: geometry.size.height)
    }
  }
}

private struct GitHubMarkShape: Shape {
  func path(in rect: CGRect) -> Path {
    let sx = rect.width / 24
    let sy = rect.height / 24
    func point(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: x * sx, y: y * sy) }
    var path = Path()
    path.move(to: point(12, 1))
    path.addCurve(to: point(1, 12), control1: point(5.9225, 1), control2: point(1, 5.9225))
    path.addCurve(to: point(8.52125, 22.4362), control1: point(1, 16.8675), control2: point(4.14875, 20.9787))
    path.addCurve(to: point(9.2775, 21.9137), control1: point(9.07125, 22.5325), control2: point(9.2775, 22.2025))
    path.addCurve(to: point(9.26375, 19.865), control1: point(9.2775, 21.6525), control2: point(9.26375, 20.7862))
    path.addCurve(to: point(5.565, 18.5725), control1: point(6.5, 20.3737), control2: point(5.785, 19.1912))
    path.addCurve(to: point(4.4375, 17.0187), control1: point(5.44125, 18.2562), control2: point(4.905, 17.28))
    path.addCurve(to: point(4.42375, 16.29), control1: point(4.0525, 16.8125), control2: point(3.5025, 16.3037))
    path.addCurve(to: point(6.115, 17.4175), control1: point(5.29, 16.2762), control2: point(5.90875, 17.0875))
    path.addCurve(to: point(9.31875, 18.325), control1: point(7.105, 19.0812), control2: point(8.68625, 18.6137))
    path.addCurve(to: point(10.02, 16.8537), control1: point(9.415, 17.61), control2: point(9.70375, 17.1287))
    path.addCurve(to: point(5.015, 11.4225), control1: point(7.5725, 16.5787), control2: point(5.015, 15.63))
    path.addCurve(to: point(6.1425, 8.46625), control1: point(5.015, 10.2262), control2: point(5.44125, 9.23625))
    path.addCurve(to: point(6.2525, 5.55125), control1: point(6.0325, 8.19125), control2: point(5.6475, 7.06375))
    path.addCurve(to: point(9.2775, 6.67875), control1: point(6.2525, 5.55125), control2: point(7.17375, 5.2625))
    path.addCurve(to: point(12.0275, 6.3075), control1: point(10.1575, 6.43125), control2: point(11.0925, 6.3075))
    path.addCurve(to: point(14.7775, 6.67875), control1: point(12.9625, 6.3075), control2: point(13.8975, 6.43125))
    path.addCurve(to: point(17.8025, 5.55125), control1: point(16.8813, 5.24875), control2: point(17.8025, 5.55125))
    path.addCurve(to: point(17.9125, 8.46625), control1: point(18.4075, 7.06375), control2: point(18.0225, 8.19125))
    path.addCurve(to: point(19.04, 11.4225), control1: point(18.6138, 9.23625), control2: point(19.04, 10.2125))
    path.addCurve(to: point(14.0213, 16.8537), control1: point(19.04, 15.6437), control2: point(16.4688, 16.5787))
    path.addCurve(to: point(14.7638, 18.8887), control1: point(14.42, 17.1975), control2: point(14.7638, 17.8575))
    path.addCurve(to: point(14.75, 21.9137), control1: point(14.7638, 20.36), control2: point(14.75, 21.5425))
    path.addCurve(to: point(15.5063, 22.4362), control1: point(14.75, 22.2025), control2: point(14.9563, 22.5462))
    path.addCurve(to: point(23, 12), control1: point(19.8513, 20.9787), control2: point(23, 16.8537))
    path.addCurve(to: point(12, 1), control1: point(23, 5.9225), control2: point(18.0775, 1))
    path.closeSubpath()
    return path
  }
}
