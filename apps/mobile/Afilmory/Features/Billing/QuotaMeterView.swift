import SwiftUI

struct QuotaMeterView: View {
  let meter: QuotaMeter
  let accent: Color

  var body: some View {
    if let frames = meter.frames {
      LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 5), count: min(10, frames)), spacing: 5) {
        ForEach(0 ..< frames, id: \.self) { index in
          RoundedRectangle(cornerRadius: 3, style: .continuous)
            .fill(index < Int(meter.used) ? Color(AFColor.textPrimary).opacity(0.82) : Color(AFColor.fill))
            .frame(height: 16)
        }
      }
      .accessibilityHidden(true)
    } else {
      GeometryReader { proxy in
        let span = max(meter.limit, meter.projected ?? 0, meter.used)
        let scale = proxy.size.width / span
        ZStack(alignment: .leading) {
          Capsule().fill(Color(AFColor.fill))
          if let projected = meter.projected {
            Capsule().fill(accent).frame(width: projected * scale)
          }
          Capsule().fill(Color(AFColor.textPrimary).opacity(0.82)).frame(width: min(meter.used, span) * scale)
          Rectangle()
            .fill(Color(AFColor.textPrimary))
            .frame(width: 1.5, height: 16)
            .offset(x: meter.limit * scale - 0.75)
        }
      }
      .frame(height: 8)
      .padding(.vertical, 4)
      .accessibilityHidden(true)
    }
  }
}
