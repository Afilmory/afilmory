import SwiftUI

struct PhotoInfoGearCardView: View {
  let gear: PhotoInfoGear
  let ratingLabel: String

  var body: some View {
    VStack(spacing: 0) {
      header

      if hasBody {
        Divider()
        cardBody
      }

      if !gear.exposure.isEmpty {
        Divider()
        exposureStrip
      }
    }
  }

  private var hasBody: Bool {
    gear.lens != nil || gear.rating > 0 || !gear.specs.isEmpty || gear.tone != nil
  }

  private var header: some View {
    HStack(spacing: 8) {
      Text(gear.model)
        .font(.headline)
        .lineLimit(1)
        .truncationMode(.tail)

      Spacer(minLength: 8)

      if let formatBadge = gear.formatBadge {
        PhotoInfoBadge(text: formatBadge, outlined: false)
      }
      if let styleBadge = gear.styleBadge {
        PhotoInfoBadge(text: styleBadge, outlined: true)
      }
    }
    .padding(.horizontal, 16)
    .padding(.vertical, 9)
    .background(Color(.quaternarySystemFill))
    .accessibilityElement(children: .combine)
  }

  private var cardBody: some View {
    VStack(alignment: .leading, spacing: 3) {
      if gear.lens != nil || gear.rating > 0 {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
          if let lens = gear.lens {
            Text(lens)
              .font(.subheadline)
              .foregroundStyle(.secondary)
              .lineLimit(1)
              .truncationMode(.tail)
          }

          Spacer(minLength: 8)

          if gear.rating > 0 {
            Text(String(repeating: "★", count: gear.rating))
              .font(.caption2)
              .foregroundStyle(.secondary)
              .accessibilityLabel("\(ratingLabel) \(gear.rating)")
          }
        }
      }

      if !gear.specs.isEmpty || gear.tone != nil {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
          if !gear.specs.isEmpty {
            Text(gear.specs.joined(separator: " • "))
              .font(.footnote.monospacedDigit())
              .foregroundStyle(.secondary)
              .lineLimit(1)
              .minimumScaleFactor(0.8)
          }

          Spacer(minLength: 8)

          if let tone = gear.tone {
            Text(tone)
              .font(.caption)
              .foregroundStyle(.secondary)
              .padding(.horizontal, 9)
              .padding(.vertical, 2)
              .overlay(Capsule().strokeBorder(.quaternary))
          }
        }
      }
    }
    .padding(.horizontal, 16)
    .padding(.vertical, 10)
  }

  private var exposureStrip: some View {
    HStack(spacing: 0) {
      ForEach(Array(gear.exposure.enumerated()), id: \.offset) { index, value in
        if index > 0 {
          Divider().frame(height: 12)
        }
        Text(value)
          .font(.caption.monospacedDigit())
          .foregroundStyle(.secondary)
          .lineLimit(1)
          .minimumScaleFactor(0.75)
          .frame(maxWidth: .infinity)
      }
    }
    .padding(.horizontal, 4)
    .padding(.vertical, 7)
    .accessibilityElement(children: .combine)
  }
}

private struct PhotoInfoBadge: View {
  let text: String
  let outlined: Bool

  var body: some View {
    Text(text)
      .font(.caption2.weight(.semibold))
      .foregroundStyle(.secondary)
      .lineLimit(1)
      .padding(.horizontal, 7)
      .padding(.vertical, 3)
      .background {
        let shape = RoundedRectangle(cornerRadius: 6, style: .continuous)
        if outlined {
          shape.strokeBorder(.quaternary)
        } else {
          shape.fill(Color(.tertiarySystemFill))
        }
      }
      .layoutPriority(1)
  }
}
