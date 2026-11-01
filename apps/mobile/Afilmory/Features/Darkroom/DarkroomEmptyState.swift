import SwiftUI

struct DarkroomEmptyState: View {
  let symbol: String
  let title: String
  let message: String

  var body: some View {
    VStack(spacing: 10) {
      Image(systemName: symbol)
        .font(.system(size: 32, weight: .light))
        .foregroundStyle(Color.darkroomTertiary)
      Text(title)
        .font(Font(AFFont.exhibit(size: 22, relativeTo: .title2)))
        .foregroundStyle(Color(AFColor.textPrimary))
        .multilineTextAlignment(.center)
      Text(message)
        .font(.footnote)
        .foregroundStyle(Color.darkroomTertiary)
        .multilineTextAlignment(.center)
    }
    .frame(maxWidth: .infinity)
    .padding(.vertical, 48)
    .accessibilityElement(children: .combine)
  }
}
