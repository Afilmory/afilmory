import SwiftUI

struct PhotoInfoRowView: View {
  let row: PhotoInfoRow

  var body: some View {
    HStack(alignment: .firstTextBaseline, spacing: 16) {
      Text(row.label)
        .foregroundStyle(.secondary)
      Spacer(minLength: 16)
      Text(row.value)
        .multilineTextAlignment(.trailing)
        .textSelection(.enabled)
    }
    .padding(.horizontal, 16)
    .padding(.vertical, 11)
    .accessibilityElement(children: .combine)
  }
}

struct PhotoInfoTagsRow: View {
  let tags: [String]
  let accessibilityLabel: String

  var body: some View {
    ScrollView(.horizontal, showsIndicators: false) {
      HStack(spacing: 8) {
        ForEach(tags, id: \.self) { tag in
          Text(tag)
            .font(.subheadline)
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(.quaternary, in: Capsule())
            .textSelection(.enabled)
        }
      }
      .padding(.horizontal, 16)
      .padding(.vertical, 10)
    }
    .accessibilityLabel("\(accessibilityLabel): \(tags.joined(separator: ", "))")
  }
}
