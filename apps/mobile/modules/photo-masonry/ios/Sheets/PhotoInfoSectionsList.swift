import SwiftUI

struct PhotoInfoSectionsList: View {
  let info: PhotoInfoSheetModel
  var bottomContentInset: CGFloat = 0

  // Keyed by section id rather than photo id so an expanded group survives
  // swiping to the next photo.
  @State private var expandedSections: Set<String> = []

  // List(.insetGrouped) hard-codes a 20pt section radius on iOS 26 with no API to
  // override it; measured against Photos, its own info cards sit at ~8pt. Hence
  // the hand-drawn cards below.
  private static let cardRadius: CGFloat = 9
  private static let horizontalMargin: CGFloat = 16
  private static let cardSpacing: CGFloat = 18

  var body: some View {
    ScrollView {
      LazyVStack(spacing: Self.cardSpacing) {
        card {
          PhotoInfoGearCardView(gear: info.gear, ratingLabel: String(localized: "Rating"))
        }

        if let description = info.description, !description.isEmpty {
          card {
            Text(description)
              .font(.body)
              .textSelection(.enabled)
              .frame(maxWidth: .infinity, alignment: .leading)
              .padding(.horizontal, 16)
              .padding(.vertical, 11)
          }
        }

        if !info.tags.isEmpty {
          card {
            PhotoInfoTagsRow(tags: info.tags, accessibilityLabel: String(localized: "Tags"))
          }
        }

        if let mapLocation = info.mapLocation {
          card {
            VStack(spacing: 0) {
              PhotoMapPreview(
                latitude: mapLocation.latitude,
                longitude: mapLocation.longitude,
                accessibilityLabel: String(
                  localized: "Photo location, latitude \(mapLocation.latitude), longitude \(mapLocation.longitude)"
                )
              )
              .frame(height: 160)

              if let place = info.place, !place.isEmpty {
                Divider()
                Text(place)
                  .font(.subheadline)
                  .textSelection(.enabled)
                  .frame(maxWidth: .infinity, alignment: .leading)
                  .padding(.horizontal, 16)
                  .padding(.vertical, 11)
              }
            }
          }
        }

        if !info.sections.isEmpty {
          card {
            VStack(spacing: 0) {
              ForEach(Array(info.sections.enumerated()), id: \.element.id) { index, section in
                if index > 0 {
                  Divider().padding(.leading, 16)
                }
                disclosure(for: section)
              }
            }
          }
        }

        if let emptyMessage = info.emptyMessage {
          card {
            Label(emptyMessage, systemImage: "info.circle")
              .font(.footnote)
              .foregroundStyle(.secondary)
              .frame(maxWidth: .infinity, alignment: .leading)
              .padding(.horizontal, 16)
              .padding(.vertical, 11)
          }
        }
      }
      .padding(.horizontal, Self.horizontalMargin)
      .padding(.vertical, 16)
    }
    // The bottom edge effect is wired in UIKit by PhotoDetailInfoView: the detail
    // toolbar is a sibling view, so SwiftUI has no bar to anchor one to here.
    .contentMargins(.bottom, bottomContentInset, for: .scrollContent)
    .background(Color(.systemGroupedBackground))
  }

  private func card(@ViewBuilder _ content: () -> some View) -> some View {
    content()
      .frame(maxWidth: .infinity)
      .background(Color(.secondarySystemGroupedBackground))
      .clipShape(RoundedRectangle(cornerRadius: Self.cardRadius, style: .continuous))
  }

  // Hand-rolled rather than DisclosureGroup: outside a List it routes both the
  // label and the chevron through the tint, and hierarchical styles like
  // .primary then resolve against that tint instead of the label colour, which
  // inverts the intended contrast. Concrete UIColors keep it unambiguous.
  private func disclosure(for section: PhotoInfoSection) -> some View {
    let isExpanded = expandedSections.contains(section.id)

    return VStack(spacing: 0) {
      Button {
        withAnimation(.snappy(duration: 0.25)) {
          if isExpanded {
            expandedSections.remove(section.id)
          } else {
            expandedSections.insert(section.id)
          }
        }
      } label: {
        HStack(spacing: 12) {
          Text(section.title)
            .foregroundStyle(Color(.label))
          Spacer(minLength: 12)
          if let summary = section.summary, !summary.isEmpty {
            Text(summary)
              .font(.subheadline)
              .foregroundStyle(Color(.secondaryLabel))
              .lineLimit(1)
              .truncationMode(.tail)
          }
          Image(systemName: "chevron.right")
            .font(.footnote.weight(.semibold))
            .foregroundStyle(Color(.tertiaryLabel))
            .rotationEffect(.degrees(isExpanded ? 90 : 0))
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 11)
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)

      if isExpanded {
        ForEach(section.rows) { row in
          Divider().padding(.leading, 16)
          PhotoInfoRowView(row: row)
        }

        if section.id == "tone", let histogramUrl = info.histogramUrl {
          Divider().padding(.leading, 16)
          histogram(urlString: histogramUrl)
        }
      }
    }
  }

  private func histogram(urlString: String) -> some View {
    VStack(alignment: .leading, spacing: 8) {
      Text("Histogram")
        .font(.caption)
        .foregroundStyle(.secondary)
      PhotoHistogramView(
        urlString: urlString,
        failedMessage: String(localized: "Unable to load histogram"),
        accessibilityLabel: String(localized: "RGB and luminance histogram")
      )
      .frame(height: 128)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(.horizontal, 16)
    .padding(.vertical, 11)
  }
}
